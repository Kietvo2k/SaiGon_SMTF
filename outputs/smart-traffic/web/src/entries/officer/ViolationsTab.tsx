import { useEffect, useMemo, useRef, useState } from 'react';
import { Api, errorMessage, streamUrl } from '../../lib/api';
import { formatDateTime, formatPenalty, penaltyContext } from '../../lib/format';
import { violationLabel, violationStatusLabel } from '../../lib/labels';
import { Pager, pageCount } from '../../components/Pager';
import {
  cameraDefault, cameraGridSlice, CameraGridSize, cameraGroups,
  CameraStream, cameraPageForId, filterCamerasByJunction, GroupedCameraOption,
} from '../../lib/cameras';
import type { OfficerViolation, Page } from '../../lib/types';

type Filter = 'pending' | 'confirmed' | 'notified' | 'disputed' | 'paid' | 'dismissed' | 'all';
type Action = 'confirm' | 'dismiss' | 'needs-review' | 'notify';

const FILTERS: [Filter, string][] = [
  ['pending', 'Chờ xử lý (mới và cần xác minh)'],
  ['confirmed', 'Đã xác nhận, chờ gửi thông báo'],
  ['notified', 'Đã thông báo'],
  ['disputed', 'Đang khiếu nại'],
  ['paid', 'Đã nộp phạt'],
  ['dismissed', 'Đã gỡ'],
  ['all', 'Tất cả'],
];
const PAGE_SIZE = 50;
const PENDING_LIMIT = 100;   // "Chờ xử lý" gộp hai trạng thái, mỗi trạng thái lấy tối đa 100 mục
const GRID_SIZES: CameraGridSize[] = [1, 4, 9];
export const CAMERA_ID = 'CAM-HX-001';

interface Props {
  api: Api;
  tick: number;
  streamTicks: Record<string, number>;   // đổi src ảnh từng camera theo stream.updated (tối đa 1 lần/2 s)
  onChanged: () => void;
  onVisibleCamerasChange: (ids: string[]) => void;   // đồng bộ các camera trên lưới lên App
}

interface Flash {
  ok: boolean;
  text: string;
}

const SUCCESS_TEXT: Record<Action, (status?: string) => string> = {
  confirm: status => (status === 'notified' ? 'Đã xác nhận và gửi thông báo cho chủ xe.' : 'Đã xác nhận vi phạm.'),
  dismiss: () => 'Đã gỡ vi phạm.',
  'needs-review': () => 'Đã chuyển sang cần xác minh.',
  notify: () => 'Đã gửi thông báo cho chủ xe.',
};

export function ViolationsTab({ api, tick, streamTicks, onChanged, onVisibleCamerasChange }: Props) {
  const [failedCams, setFailedCams] = useState<Record<string, boolean>>({});
  const [rawStreams, setRawStreams] = useState<CameraStream[]>([]);
  const [junctionFilter, setJunctionFilter] = useState<string>('');
  const [cameraId, setCameraId] = useState<string>(CAMERA_ID);
  const [gridSize, setGridSize] = useState<CameraGridSize>(4);
  const [camPage, setCamPage] = useState<number>(1);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, HTMLElement | null>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OfficerViolation[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  // Trang có thể mở trước khi trạm gửi khung đầu; mỗi lần làm mới hoặc có khung mới phải thử lại ảnh đã lỗi.
  const prevStreamTicks = useRef<Record<string, number>>({});
  useEffect(() => {
    setFailedCams({});
  }, [tick]);

  useEffect(() => {
    const prev = prevStreamTicks.current;
    const revived = Object.keys(streamTicks).filter(id => streamTicks[id] !== prev[id]);
    prevStreamTicks.current = streamTicks;
    if (revived.length === 0) return;
    setFailedCams(cur => {
      let changed = false;
      const next = { ...cur };
      for (const id of revived) {
        if (next[id]) { next[id] = false; changed = true; }
      }
      return changed ? next : cur;
    });
  }, [streamTicks]);

  // Danh sách camera giao lộ để chọn (10 camera, mỗi nút 1–2 hướng).
  useEffect(() => {
    let alive = true;
    api.get<{ streams: CameraStream[] }>('/officer/streams')
      .then(r => {
        if (!alive) return;
        const list = Array.isArray(r.streams) && r.streams.length > 0 ? r.streams : [{ camera_id: CAMERA_ID }];
        setRawStreams(list);
        const first = cameraDefault(list);
        if (first) setCameraId(first);
      })
      .catch(() => { if (alive) setRawStreams([{ camera_id: CAMERA_ID }]); });
    return () => { alive = false; };
  }, [api]);

  const groups = useMemo(() => cameraGroups(rawStreams), [rawStreams]);
  const totalCameraCount = useMemo(() => groups.reduce((acc, g) => acc + g.items.length, 0), [groups]);
  const visibleGroups = useMemo(
    () => (junctionFilter ? groups.filter(g => g.junction === junctionFilter) : groups),
    [groups, junctionFilter],
  );
  const cams = useMemo(
    () => filterCamerasByJunction(groups, junctionFilter),
    [groups, junctionFilter],
  );

  useEffect(() => {
    if (cams.length > 0 && !cams.some(c => c.value === cameraId)) {
      setCameraId(cams[0].value);
    }
  }, [cams, cameraId]);

  useEffect(() => {
    const syncFs = () => {
      const fsEl = document.fullscreenElement;
      const hit = Object.entries(tileRefs.current).find(([, el]) => el === fsEl)?.[0] ?? null;
      setFullscreenId(hit);
    };
    document.addEventListener('fullscreenchange', syncFs);
    return () => document.removeEventListener('fullscreenchange', syncFs);
  }, []);

  const gridState = useMemo(() => {
    if (cams.length === 0) return { page: 1, totalPages: 1, items: [] as GroupedCameraOption[] };
    if (gridSize === 1) {
      const idx = Math.max(0, cams.findIndex(c => c.value === cameraId));
      return { page: idx + 1, totalPages: cams.length, items: [cams[idx]] };
    }
    return cameraGridSlice(cams, gridSize, camPage);
  }, [cams, gridSize, camPage, cameraId]);

  const visibleKey = gridState.items.map(c => c.value).join(',');
  useEffect(() => {
    if (!visibleKey) return;
    onVisibleCamerasChange(visibleKey.split(','));
  }, [visibleKey, onVisibleCamerasChange]);

  const toggleFullscreen = (id: string) => {
    setCameraId(id);
    const el = tileRefs.current[id];
    if (!el) return;
    if (document.fullscreenElement === el && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (typeof el.requestFullscreen === 'function') el.requestFullscreen().catch(() => {});
  };

  const changeGridSize = (next: CameraGridSize) => {
    setGridSize(next);
    if (next > 1) setCamPage(cameraPageForId(cams, cameraId, next));
  };

  const selectJunction = (nextJunction: string) => {
    setJunctionFilter(nextJunction);
    setCamPage(1);
    const nextCams = filterCamerasByJunction(groups, nextJunction);
    if (nextCams.length > 0 && !nextCams.some(c => c.value === cameraId)) {
      setCameraId(nextCams[0].value);
    }
  };

  const selectCamera = (nextId: string) => {
    setCameraId(nextId);
    setFailedCams(prev => (prev[nextId] ? { ...prev, [nextId]: false } : prev));
    if (gridSize > 1) setCamPage(cameraPageForId(cams, nextId, gridSize));
  };

  const stepCameraPage = (delta: number) => {
    if (gridSize === 1) {
      if (cams.length === 0) return;
      const curIdx = Math.max(0, cams.findIndex(c => c.value === cameraId));
      const nextIdx = Math.min(Math.max(0, curIdx + delta), cams.length - 1);
      setCameraId(cams[nextIdx].value);
    } else {
      setCamPage(p => Math.min(Math.max(1, p + delta), gridState.totalPages));
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (filter === 'pending') {
          const [fresh, review] = await Promise.all(['new', 'needs_review'].map(s =>
            api.get<Page<OfficerViolation>>(`/officer/violations?status=${s}&page_size=${PENDING_LIMIT}`)));
          if (!alive) return;
          setItems([...fresh.items, ...review.items].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
          setTotal(fresh.total + review.total);
        } else {
          const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
          if (filter !== 'all') qs.set('status', filter);
          const r = await api.get<Page<OfficerViolation>>(`/officer/violations?${qs}`);
          if (!alive) return;
          setItems(r.items);
          setTotal(r.total);
        }
        setLoadError('');
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      }
    };
    load();
    return () => { alive = false; };
  }, [api, filter, page, tick]);

  const act = async (v: OfficerViolation, action: Action, note: string) => {
    setBusyId(v.id);
    setFlash(null);
    try {
      const r = await api.post<{ status: string }>(`/officer/violations/${v.id}/${action}`, { note });
      setFlash({ ok: true, text: SUCCESS_TEXT[action](r.status) });
      onChanged();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const pages = filter === 'pending' ? 1 : pageCount(total, PAGE_SIZE);

  return (
    <section className="panel" aria-label="Danh sách vi phạm">
      <div className="cam-wall">
        <div className="cam-wall-bar">
          <div className="cam-controls">
            <div className="cam-layout-group" role="group" aria-label="Bố cục lưới camera">
              {GRID_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  className={gridSize === size ? 'active' : undefined}
                  aria-pressed={gridSize === size}
                  onClick={() => changeGridSize(size)}
                >
                  {size} ô
                </button>
              ))}
            </div>
            {gridState.totalPages > 1 && (
              <div className="cam-pager" aria-label="Phân trang lưới camera">
                <button
                  type="button"
                  className="ghost"
                  disabled={gridState.page <= 1}
                  onClick={() => stepCameraPage(-1)}
                  aria-label="Trang camera trước"
                >
                  ‹
                </button>
                <span className="cam-page-info">Trang {gridState.page}/{gridState.totalPages} ({cams.length} camera)</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={gridState.page >= gridState.totalPages}
                  onClick={() => stepCameraPage(1)}
                  aria-label="Trang camera sau"
                >
                  ›
                </button>
              </div>
            )}
          </div>
          <div className="cam-selects">
            <label className="cam-junction-field">Nút giao lộ
              <select
                aria-label="Lọc camera theo nút giao lộ"
                value={junctionFilter}
                onChange={e => selectJunction(e.target.value)}
              >
                <option value="">Tất cả nút giao ({totalCameraCount})</option>
                {groups.map(group => (
                  <option key={group.junction} value={group.junction}>
                    {group.junction} ({group.items.length})
                  </option>
                ))}
              </select>
            </label>
            <label className="cam-select-field">Camera giao lộ
              <select value={cameraId} onChange={e => selectCamera(e.target.value)}>
                {visibleGroups.map(group => (
                  <optgroup key={group.junction} label={`${group.junction} (${group.items.length})`}>
                    {group.items.map(cam => (
                      <option key={cam.value} value={cam.value}>
                        {cam.direction ? `${cam.value} · ${cam.direction}` : cam.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={`cam-grid cam-grid-${gridState.items.length === 1 ? 1 : gridSize}`}>
          {gridState.items.map(cam => {
            const tileTick = streamTicks[cam.value] ?? 0;
            const isFailed = Boolean(failedCams[cam.value]);
            const isFs = fullscreenId === cam.value;
            const isSelected = cameraId === cam.value;
            return (
              <figure
                key={cam.value}
                className={isSelected ? 'cam-tile active' : 'cam-tile'}
                ref={el => { tileRefs.current[cam.value] = el; }}
              >
                <button
                  type="button"
                  className="cam-stage"
                  onClick={() => toggleFullscreen(cam.value)}
                  aria-label={isFs ? `Thu nhỏ camera ${cam.value}` : `Mở toàn màn hình camera ${cam.value}`}
                  title="Bấm vào khung hình để xem toàn màn hình"
                >
                  {!isFailed ? (
                    <img
                      src={`${streamUrl(cam.value)}?v=${tileTick}`}
                      alt={`Hình ảnh camera ${cam.label}`}
                      onLoad={() => setFailedCams(prev => (prev[cam.value] ? { ...prev, [cam.value]: false } : prev))}
                      onError={() => setFailedCams(prev => (prev[cam.value] ? prev : { ...prev, [cam.value]: true }))}
                    />
                  ) : (
                    <div className="cam-off">Chưa có hình ảnh từ camera này</div>
                  )}
                  <span className="cam-badge mono">{cam.value}</span>
                  <span className="cam-fs-hint" aria-hidden="true">{isFs ? 'Thu nhỏ' : '⛶ Toàn màn hình'}</span>
                </button>
                <figcaption className="cam-cap">
                  <div className="cam-cap-text" title={cam.label}>
                    <span className="cam-cap-junction">{cam.junction}</span>
                    {cam.direction && <span className="cam-cap-dir">{cam.direction}</span>}
                  </div>
                  <button
                    type="button"
                    className="ghost cam-fs-btn"
                    onClick={() => toggleFullscreen(cam.value)}
                    title={isFs ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
                  >
                    {isFs ? 'Thu nhỏ' : '⛶ Toàn màn hình'}
                  </button>
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div className="toolbar cam-filter-bar">
          <label>Lọc theo trạng thái
            <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(1); }}>
              {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <p className="count">Có {total} vi phạm{filter === 'pending' && total > items.length ? `, đang hiện ${items.length} mục` : ''}.</p>
          <p className="hint">Bấm vào khung camera để xem toàn màn hình. Tự động: vi phạm được xác nhận và báo về ngay; khoảng 1% tự sinh khiếu nại để xử lý ở mục Khiếu nại.</p>
        </div>
      </div>

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã</th><th>Biển số</th><th>Lỗi</th><th>Thời gian</th><th>Nút</th>
              <th>Mức phạt</th><th>Trạng thái</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id}>
                <td className="mono">{v.id}</td>
                <td>
                  <span className="mono">{v.plate}</span>
                  {v.priority_flag && (
                    <span className="badge warn" title={v.priority_reason ?? undefined}>Nghi nhường xe ưu tiên</span>
                  )}
                </td>
                <td>{violationLabel(v.violation_code)}</td>
                <td>{formatDateTime(v.occurred_at)}</td>
                <td>{v.node_id}</td>
                <td>{formatPenalty(v.penalty)}<small style={{display:'block',marginTop:4}}>{penaltyContext(v.penalty)}</small></td>
                <td>
                  <span className={`badge s-${v.status}`}>{violationStatusLabel(v.status)}</span>
                  {v.auto && <span className="badge auto">Tự động</span>}
                </td>
                <td className="actions">
                  {(v.status === 'new' || v.status === 'needs_review') && (
                    <>
                      <button type="button" disabled={busyId === v.id} onClick={() => act(v, 'confirm', 'xác nhận')}>Xác nhận</button>
                      <button type="button" className="danger" disabled={busyId === v.id} onClick={() => act(v, 'dismiss', 'gỡ')}>Gỡ</button>
                    </>
                  )}
                  {v.status === 'new' && (
                    <button type="button" className="ghost" disabled={busyId === v.id} onClick={() => act(v, 'needs-review', 'cần xác minh')}>Cần xác minh</button>
                  )}
                  {v.status === 'confirmed' && (
                    <button type="button" disabled={busyId === v.id} onClick={() => act(v, 'notify', 'gửi thông báo cho chủ xe')}>Gửi thông báo</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loadError && (
              <tr><td colSpan={8} className="empty">Không có vi phạm nào trong bộ lọc này.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pages={pages} onChange={setPage} />
    </section>
  );
}
