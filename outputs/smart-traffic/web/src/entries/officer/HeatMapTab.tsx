import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { alertDetail } from '../../lib/alerts';
import { formatDateTime } from '../../lib/format';
import {
  HEAT_COLORS_32, HeatAlert, HeatView, LEVEL_LABELS, LEVEL_RANGES, NO_DATA_COLOR, NorthRoad, NorthRoadsDoc,
  colorOf, roadWidth,
} from '../../lib/heat';

interface Props {
  api: Api;
  tick: number;
  live: HeatView | null;   // dữ liệu mới nhất nhận qua WebSocket (heat.update)
}

interface Size { w: number; h: number }
// cx, cz: tâm khung nhìn (m, hệ cảnh); k: mức phóng so với "vừa khung" (1 = vừa khung).
interface View { cx: number; cz: number; k: number }

const ROADS_URL = `${import.meta.env.BASE_URL}north-roads-32.json`;
const STALE_S = 60;          // quá 1 phút không có bản mới từ trạm → cảnh báo dữ liệu cũ
const BLINK_MS = 450;        // nhịp nhấp nháy của đoạn đang chọn
const K_MIN = 1;
const K_MAX = 40;
const EMPTY_ALERTS: HeatAlert[] = [];
const MAP_BG = '#eef2f6';
const HALO = '#111827';

let roadsCache: Promise<NorthRoadsDoc> | null = null;
function loadRoads(): Promise<NorthRoadsDoc> {
  if (!roadsCache) {
    roadsCache = fetch(ROADS_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<NorthRoadsDoc>;
      })
      .catch(err => {
        roadsCache = null;
        throw err;
      });
  }
  return roadsCache;
}

function baseScale(size: Size, bbox: NorthRoadsDoc['bbox']): number {
  const bw = bbox[2] - bbox[0];
  const bh = bbox[3] - bbox[1];
  return Math.min(size.w / bw, size.h / bh) * 0.94;
}

function fitView(doc: NorthRoadsDoc): View {
  const [x0, z0, x1, z1] = doc.bbox;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, k: 1 };
}

// Phóng/thu quanh một điểm trên màn hình, điểm dưới con trỏ giữ nguyên vị trí.
function zoomAt(v: View, doc: NorthRoadsDoc, size: Size, px: number, py: number, factor: number): View {
  const s0 = baseScale(size, doc.bbox) * v.k;
  const wx = v.cx + (px - size.w / 2) / s0;
  const wz = v.cz + (py - size.h / 2) / s0;
  const k = Math.min(K_MAX, Math.max(K_MIN, v.k * factor));
  const s1 = baseScale(size, doc.bbox) * k;
  return { cx: wx - (px - size.w / 2) / s1, cz: wz - (py - size.h / 2) / s1, k };
}

function drawMap(
  canvas: HTMLCanvasElement,
  size: Size,
  doc: NorthRoadsDoc,
  levels: Map<number, number>,
  edgeIndex: Map<number, NorthRoad>,
  selected: number | null,
  blinkOn: boolean,
  v: View,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size.w * dpr);
  canvas.height = Math.round(size.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = MAP_BG;
  ctx.fillRect(0, 0, size.w, size.h);

  const s = baseScale(size, doc.bbox) * v.k;
  const X = (x: number) => size.w / 2 + (x - v.cx) * s;
  const Z = (z: number) => size.h / 2 + (z - v.cz) * s;
  const wScale = Math.min(2.2, Math.max(0.8, Math.sqrt(v.k)));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const stroke = (e: NorthRoad, color: string, extra: number) => {
    ctx.beginPath();
    e.coords.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(X(x), Z(z));
      else ctx.lineTo(X(x), Z(z));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = roadWidth(e.highway) * wScale + extra;
    ctx.stroke();
  };

  // Lớp nền: đường chưa có mức nhiệt; lớp trên: đường có mức nhiệt theo thang 5 nấc.
  for (const e of doc.edges) {
    if (!levels.has(e.edge)) stroke(e, NO_DATA_COLOR, 0);
  }
  for (const e of doc.edges) {
    const lv = levels.get(e.edge);
    if (lv !== undefined) stroke(e, colorOf(lv), 0);
  }

  // Đoạn được chọn nhấp nháy: viền tối và nét trắng xen kẽ mỗi nhịp.
  if (selected !== null && blinkOn) {
    const e = edgeIndex.get(selected);
    if (e) {
      stroke(e, HALO, 7 * wScale);
      stroke(e, '#ffffff', 3 * wScale);
    }
  }

  // Nhãn nút HX: viền nền để đọc được trên đường; nút liền kề lệch nhãn lên/xuống để khỏi đè nhau.
  ctx.font = '12px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = MAP_BG;
  ctx.fillStyle = '#0b2d4f';
  doc.nodes.forEach((n, i) => {
    const px = X(n.x);
    const pz = Z(n.z);
    if (px < -20 || pz < -20 || px > size.w + 20 || pz > size.h + 20) return;
    ctx.beginPath();
    ctx.arc(px, pz, 4, 0, Math.PI * 2);
    ctx.fill();
    const dy = i % 2 === 0 ? -8 : 16;
    ctx.strokeText(n.id, px + 7, pz + dy);
    ctx.fillText(n.id, px + 7, pz + dy);
  });
}

export function HeatMapTab({ api, tick, live }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const sizeRef = useRef<Size>({ w: 0, h: 0 });
  const roadsRef = useRef<NorthRoadsDoc | null>(null);

  const [roads, setRoads] = useState<NorthRoadsDoc | null>(null);
  const [roadsError, setRoadsError] = useState('');
  const [view, setView] = useState<HeatView | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [cam, setCam] = useState<View | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [blinkOn, setBlinkOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    loadRoads()
      .then(doc => {
        if (alive) setRoads(doc);
      })
      .catch(() => {
        if (alive) setRoadsError('Không tải được dữ liệu đường khu Bắc. Vui lòng tải lại trang.');
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    roadsRef.current = roads;
    if (roads) setCam(prev => prev ?? fitView(roads));
  }, [roads]);

  // Kích thước khung hình theo phần tử chứa (đổi cỡ cửa sổ → vẽ lại).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = { w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) };
      sizeRef.current = next;
      setSize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bánh xe chuột: phóng/thu quanh con trỏ (không cuộn trang khi đang ở trên bản đồ).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const doc = roadsRef.current;
      if (!doc) return;
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.25 : 0.8;
      setCam(v => (v ? zoomAt(v, doc, sizeRef.current, px, py, factor) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    let alive = true;
    api.get<HeatView>('/officer/heat')
      .then(v => {
        if (!alive) return;
        setView(v);
        setError('');
      })
      .catch(e => {
        if (alive) setError(errorMessage(e));
      });
    return () => { alive = false; };
  }, [api, tick]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selected === null) return;
    setBlinkOn(true);
    const t = setInterval(() => setBlinkOn(b => !b), BLINK_MS);
    return () => clearInterval(t);
  }, [selected]);

  const current: HeatView | null = live ?? view;
  const levelMap = useMemo(() => new Map<number, number>(current?.levels ?? []), [current]);
  const edgeIndex = useMemo(() => new Map<number, NorthRoad>((roads?.edges ?? []).map(e => [e.edge, e] as [number, NorthRoad])), [roads]);
  const alerts = current?.alerts ?? EMPTY_ALERTS;
  const ageS = current?.updated_at ? (now - Date.parse(current.updated_at)) / 1000 : null;
  const stale = ageS !== null && ageS > STALE_S;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roads || !cam || size.w === 0 || size.h === 0) return;
    drawMap(canvas, size, roads, levelMap, edgeIndex, selected, blinkOn, cam);
  }, [roads, cam, size, levelMap, edgeIndex, selected, blinkOn]);

  function focusEdge(edge: number) {
    setSelected(edge);
    const e = edgeIndex.get(edge);
    if (!e) {
      setNote('Đoạn này nằm ngoài bản đồ khu Bắc nên không xem được trên hình.');
      return;
    }
    setNote('');
    const xs = e.coords.map(p => p[0]);
    const zs = e.coords.map(p => p[1]);
    setCam(v => ({
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cz: (Math.min(...zs) + Math.max(...zs)) / 2,
      k: Math.max(v?.k ?? 1, 4),
    }));
  }

  function zoomBy(factor: number) {
    const doc = roadsRef.current;
    if (!doc) return;
    setCam(v => (v ? zoomAt(v, doc, sizeRef.current, sizeRef.current.w / 2, sizeRef.current.h / 2, factor) : v));
  }

  function resetView() {
    if (roads) setCam(fitView(roads));
  }

  function onPointerDown(ev: ReactPointerEvent<HTMLCanvasElement>) {
    if (!cam) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { x: ev.clientX, y: ev.clientY, cx: cam.cx, cz: cam.cz };
  }

  function onPointerMove(ev: ReactPointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    const doc = roadsRef.current;
    if (!d || !doc) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    setCam(v => {
      if (!v) return v;
      const s = baseScale(sizeRef.current, doc.bbox) * v.k;
      return { ...v, cx: d.cx - dx / s, cz: d.cz - dy / s };
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const levelCount = levelMap.size;
  const label = `Bản đồ nhiệt khu Bắc: ${levelCount} đoạn có mức nhiệt, ${alerts.length} cảnh báo kẹt. `
    + 'Kéo để di chuyển, bánh xe chuột hoặc nút để phóng to và thu nhỏ.';

  return (
    <section className="panel heat" aria-label="Bản đồ nhiệt khu Bắc">
      <div className="heat-top">
        <p className="count">
          Cập nhật lúc <b>{current?.updated_at ? formatDateTime(current.updated_at) : '–'}</b>
          {' · '}Đoạn có mức nhiệt <b>{levelCount}</b>
          {' · '}Cảnh báo kẹt <b>{alerts.length}</b>
        </p>
        <div className="heat-actions">
          <button type="button" className="ghost" onClick={() => zoomBy(0.8)} disabled={!roads}>Thu nhỏ</button>
          <button type="button" className="ghost" onClick={() => zoomBy(1.25)} disabled={!roads}>Phóng to</button>
          <button type="button" className="ghost" onClick={resetView} disabled={!roads}>Đặt lại khung nhìn</button>
        </div>
      </div>

      {stale && (
        <p className="warn" role="status">
          Chưa nhận bản đồ nhiệt mới từ trạm trong hơn một phút. Đang hiển thị bản cuối.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {roadsError && <p className="error" role="alert">{roadsError}</p>}

      <div className="heat-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="heat-canvas"
          role="img"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!roads && !roadsError && <p className="heat-overlay">Đang tải bản đồ đường khu Bắc…</p>}
        {roads && !current && <p className="heat-overlay">Chưa có dữ liệu bản đồ nhiệt từ trạm.</p>}
      </div>
      {note && <p className="hint" role="status">{note}</p>}

      <div className="heat-grid">
        <div className="heat-box">
          <h3>Chú giải mức nhiệt</h3>
          <ul className="heat-legend">
            {HEAT_COLORS_32.map((c, i) => (
              <li key={c}>
                <span className="swatch" style={{ background: c }} aria-hidden="true" />
                <span><b>{LEVEL_LABELS[i]}</b> ({LEVEL_RANGES[i]})</span>
              </li>
            ))}
            <li>
              <span className="swatch" style={{ background: NO_DATA_COLOR }} aria-hidden="true" />
              <span>Dưới 5% hoặc chưa có dữ liệu</span>
            </li>
          </ul>
          <p className="hint">Mức của đoạn tăng khi xe trên đoạn chạy chậm hơn tốc độ cho phép hoặc phải dừng.</p>
        </div>

        <div className="heat-box">
          <div className="heat-alerts-head">
            <h3>Cảnh báo kẹt</h3>
            {selected !== null && (
              <button type="button" className="ghost" onClick={() => { setSelected(null); setNote(''); }}>Bỏ chọn</button>
            )}
          </div>
          {alerts.length === 0 ? (
            <p className="hint">Hiện chưa có cảnh báo kẹt.</p>
          ) : (
            <ol className="heat-alerts">
              {alerts.map(a => (
                <li key={a.edge}>
                  <button
                    type="button"
                    className={selected === a.edge ? 'alert-item on' : 'alert-item'}
                    aria-pressed={selected === a.edge}
                    onClick={() => focusEdge(a.edge)}
                  >
                    <span className="alert-name">{a.name}</span>
                    <span className="alert-detail">{alertDetail(a)}</span>
                    <span className={`alert-band b${a.band}`}>{LEVEL_LABELS[a.band]}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="heat-box">
        <h3>Mức nhiệt trung bình theo giờ</h3>
        <div className="heat-hours" role="img" aria-label="Mức nhiệt trung bình theo từng giờ trong ngày, lấy từ lịch sử">
          {(view?.hourly ?? []).map(h => {
            const pct = h.mean_level === null ? 0 : Math.round(h.mean_level * 100);
            const title = h.mean_level === null
              ? `${h.hour} giờ: chưa có dữ liệu`
              : `${h.hour} giờ: mức trung bình ${pct}%, ${h.samples} bản lịch sử`;
            return (
              <div className="heat-hour" key={h.hour} title={title}>
                <div className="heat-track">
                  <div className="heat-fill" style={{ height: `${pct}%`, background: h.mean_level === null ? NO_DATA_COLOR : colorOf(h.mean_level) }} />
                </div>
                <span className="heat-hour-label">{h.hour % 3 === 0 ? `${h.hour}h` : ''}</span>
              </div>
            );
          })}
        </div>
        <p className="hint">Lịch sử {view?.history_count ?? 0} bản, mỗi 5 phút theo giờ của trạm. Bản đồ nền: © OpenStreetMap contributors, ODbL 1.0.</p>
      </div>
    </section>
  );
}

