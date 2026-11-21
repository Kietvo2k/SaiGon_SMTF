import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DemoApiError, DemoCamera, DemoCameraFrame, DemoDecisionAction, DemoKpi, DemoOfficerSnapshot,
  getOfficerSnapshot, postDecision, requestCamera, startDemoSession,
} from '../api';
import { subscribeStationEvents, type StationEvent } from '../../../lib/events';
import { CameraPanel } from './CameraWall';
import { EventFeed } from './EventFeed';
import { ViolationDesk, type DecisionResult } from './ViolationDesk';
import { ThemeToggle } from '../../../theme/ThemeToggle';
import { useMediaQuery, useNow } from './hooks';
import {
  eventKey, formatClock, formatDateTime, formatMetric, formatRelativeTime, openRecordCount,
  shiftFor, sparklinePath, sparklinePoints, trendFor, type DemoNodeMapEntry, type MapRoadData, type TrendInfo,
} from './ops-model';

const REFRESH_MS = 12_000;
const CAMERA_POLL_MS = 3_000;
const MAP_ROADS_URL = '/north-roads-32.json';
const MAP_NODES_URL = '/smart-traffic/backend/app/seed/public-north/node_map.json';
const DATE_SHORT = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' });

type BootState = 'loading' | 'ready' | 'error';
type MobileTab = 'field' | 'events' | 'records';

interface RefreshInfo {
  latency: number | null;
  failures: number;
  httpStatus?: number;
  code?: string;
  message: string;
  nextAt: number | null;
  lastAt: number | null;
}

const EMPTY_REFRESH: RefreshInfo = { latency: null, failures: 0, message: '', nextAt: null, lastAt: null };

const KPI_FIELDS = [
  { key: 'wait_avg_s', label: 'Chờ trung bình', unit: 'giây', lowerIsBetter: true },
  { key: 'queue_max', label: 'Hàng chờ lớn nhất', unit: 'xe', lowerIsBetter: true },
  { key: 'flow_per_node_min', label: 'Lưu lượng mỗi nút', unit: 'xe/phút', lowerIsBetter: false },
] as const;

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const path = sparklinePath(values);
  const points = sparklinePoints(values);
  return <svg className="ops-sparkline" viewBox="0 0 120 34" role="img" aria-label={`Xu hướng ${label}, ${values.length} lần đo`}>
    <title>Xu hướng {label} qua {values.length} lần đo</title>
    <line x1="3" y1="31" x2="117" y2="31" className="ops-sparkline-axis" />
    {path
      ? <>
          <path d={path} className="ops-sparkline-line" />
          {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 2.3 : 1.25} className={index === points.length - 1 ? 'ops-sparkline-dot' : 'ops-sparkline-sample'} />)}
        </>
      : <line x1="3" y1="17" x2="117" y2="17" className="ops-sparkline-empty" />}
  </svg>;
}

function KpiCard({ label, value, unit, values, lowerIsBetter, loading }: {
  label: string;
  value: number | null;
  unit: string;
  values: number[];
  lowerIsBetter: boolean;
  loading: boolean;
}) {
  const trend: TrendInfo = trendFor(values, lowerIsBetter, unit);
  return <article className={`ops-kpi${loading ? ' is-loading' : ''}`}>
    <div className="ops-kpi-top">
      <h3>{label}</h3>
      <span className="ops-kpi-samples">{values.length} lần đo</span>
    </div>
    <div className="ops-kpi-value">{loading ? <span className="ops-skeleton ops-skeleton-value" /> : <><b>{formatMetric(value)}</b><small>{unit}</small></>}</div>
    <Sparkline values={values} label={label} />
    <div className="ops-kpi-foot">
      {values.length >= 2
        ? <span className={`ops-trend ops-trend-${trend.tone}`}>{trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.text} <small>so với lần đo đầu</small></span>
        : <span className="ops-trend ops-trend-flat">Chờ lần đo kế tiếp (chu kỳ 12 giây)</span>}
    </div>
  </article>;
}

function TopBar({ source, lastUpdated, refreshInfo, refreshing, bootState, onRefresh }: {
  source: 'sample' | 'live' | null;
  lastUpdated: number | null;
  refreshInfo: RefreshInfo;
  refreshing: boolean;
  bootState: BootState;
  onRefresh: () => void;
}) {
  const now = useNow(1_000);
  const shift = shiftFor(new Date(now));
  const seconds = refreshInfo.nextAt ? Math.max(0, Math.ceil((refreshInfo.nextAt - now) / 1_000)) : null;
  const sourceLabel = source === 'live' ? 'Trực tiếp' : source === 'sample' ? 'Tệp' : bootState === 'loading' ? 'Đang mở phiên' : 'Chưa có dữ liệu';
  const stale = !lastUpdated || now - lastUpdated > REFRESH_MS * 3;
  const dot = refreshInfo.failures ? 'error' : bootState === 'loading' || !lastUpdated ? 'idle' : stale ? 'warn' : 'ok';
  return <header className="ops-topbar">
    <a className="ops-brand" href="/" aria-label="Smart Traffic · SaiGon SMTF · về cổng">
      <svg className="ops-brand-mark" viewBox="0 0 64 64" width="40" height="40" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="st-road-officer" x1="0" y1="15" x2="0" y2="31" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2381ff" />
            <stop offset=".45" stopColor="#1c6cf4" />
            <stop offset=".66" stopColor="#4c8ff0" />
            <stop offset=".8" stopColor="#cfe7f8" />
            <stop offset="1" stopColor="#f6fdff" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="13" fill="#001a4b" />
        <rect x=".6" y=".6" width="62.8" height="62.8" rx="12.4" fill="none" stroke="#9fd8e2" strokeOpacity=".18" />
        <path d="M45.6 15H27.8C21.7 15 16.9 19.2 16.9 25.4v.8c0 3.7 2 6.5 5.5 7.4" fill="none" stroke="url(#st-road-officer)" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="46.8" cy="14.9" r="3.7" fill="#1f79f7" />
        <path d="M43 29.6c2.9 2.5 3.9 5.2 3.9 9.4 0 5.2-3.3 8.7-8.7 10.9H19.3" fill="none" stroke="#f5fdff" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17.2" cy="49.7" r="3.7" fill="#f5fdff" />
        <circle cx="32" cy="24.2" r="3.6" fill="#e21b3c" />
        <circle cx="32" cy="33.1" r="3.6" fill="#e3b707" />
        <circle cx="32" cy="42" r="3.6" fill="#03a13a" />
      </svg>
      <span className="ops-brand-text">
        <b>Smart Traffic</b>
        <small>SaiGon SMTF · Trung tâm điều hành</small>
      </span>
    </a>
    <div className="ops-topbar-fact ops-shift">
      <span>CA TRỰC</span>
      <b>{shift.label} <small>{shift.range}</small></b>
      <small>theo giờ máy · Asia/Ho_Chi_Minh</small>
    </div>
    <div className="ops-topbar-fact ops-clock">
      <span>GIỜ HỆ THỐNG</span>
      <time dateTime={new Date(now).toISOString()}>{formatClock(now)}</time>
      <small>{DATE_SHORT.format(now)}</small>
    </div>
    <div className="ops-topbar-fact ops-source-fact">
      <span>NGUỒN DỮ LIỆU</span>
      <b><i className={`ops-dot ops-dot-${dot}`} aria-hidden="true" />{sourceLabel}</b>
      <small>{lastUpdated ? `cập nhật ${formatRelativeTime(lastUpdated, now)}` : refreshInfo.message || 'chưa nhận dữ liệu'}</small>
    </div>
    <div className="ops-topbar-actions">
      <ThemeToggle />
      <span className={`ops-refresh-pill${refreshInfo.failures ? ' is-error' : ''}`} title={refreshInfo.failures ? refreshInfo.message : 'Tự động lấy dữ liệu mỗi 12 giây'}>
        {refreshInfo.failures
          ? (refreshInfo.httpStatus === 429 ? `429 · chờ ${seconds ?? 0}s` : `Lỗi · chờ ${seconds ?? 0}s`)
          : seconds != null && bootState === 'ready' ? `Tự động · ${seconds}s` : 'Đang mở phiên'}
      </span>
      <button type="button" className="ops-button ops-button-primary ops-refresh-button" onClick={onRefresh} disabled={refreshing || bootState === 'loading'}>
        {refreshing ? 'Đang làm mới…' : 'Làm mới'}
      </button>
      <a className="ops-topbar-link" href="/">Về cổng</a>
    </div>
  </header>;
}

function RefreshBanner({ info, hasData }: { info: RefreshInfo; hasData: boolean }) {
  const now = useNow(1_000);
  if (!info.failures || !hasData) return null;
  const seconds = info.nextAt ? Math.max(0, Math.ceil((info.nextAt - now) / 1_000)) : null;
  const rate = info.httpStatus === 429;
  return <div className={`ops-alert${rate ? ' ops-alert-rate' : ''}`} role="alert">
    <b>{rate ? 'Nguồn đang giới hạn tần suất (HTTP 429)' : 'Không cập nhật được dữ liệu'}</b>
    <span>{info.message || 'Lần lấy dữ liệu gần nhất thất bại.'}{seconds != null ? ` · tự động thử lại sau ${seconds} giây.` : ''}</span>
    <small>Bảng đang giữ lần cập nhật gần nhất{info.lastAt ? ` lúc ${formatDateTime(info.lastAt)}` : ''}; không thay bằng số liệu tự tạo.</small>
  </div>;
}

function HealthPanel({ snapshot, frames, eventCount, refreshInfo, nodes, roads, mapLoading, mapError }: {
  snapshot: DemoOfficerSnapshot | null;
  frames: Record<string, DemoCameraFrame | undefined>;
  eventCount: number;
  refreshInfo: RefreshInfo;
  nodes: DemoNodeMapEntry[] | null;
  roads: MapRoadData | null;
  mapLoading: boolean;
  mapError: string;
}) {
  const now = useNow(5_000);
  const cameras = snapshot?.cameras ?? [];
  const withImage = cameras.filter(camera => frames[camera.cameraId]?.imageUrl).length;
  const missing = cameras.filter(camera => frames[camera.cameraId]?.source === 'missing').length;
  const lastAge = refreshInfo.lastAt ? Math.max(0, now - refreshInfo.lastAt) : null;
  const cadence = refreshInfo.nextAt ? Math.max(0, Math.ceil((refreshInfo.nextAt - now) / 1_000)) : null;
  return <section className="ops-panel ops-health" aria-labelledby="ops-health-title">
    <header className="ops-panel-head"><div><p className="ops-eyebrow">SỨC KHOẺ NGUỒN</p><h2 id="ops-health-title">Trạng thái kỹ thuật</h2></div></header>
    <dl className="ops-health-list">
      <div><dt>Lần lấy dữ liệu thành công</dt><dd>{refreshInfo.lastAt ? `${formatClock(refreshInfo.lastAt)} · ${lastAge != null ? `${Math.round(lastAge / 1000)} giây trước` : '—'}` : 'Chưa có'}</dd></div>
      <div><dt>Độ trễ API</dt><dd>{refreshInfo.latency != null ? `${refreshInfo.latency} ms` : '—'}</dd></div>
      <div><dt>Chu kỳ tự động</dt><dd>{refreshInfo.httpStatus === 429 ? `Backoff do 429 · còn ${cadence ?? 0}s` : cadence != null ? `12 giây · còn ${cadence}s` : 'Chưa chạy'}{refreshInfo.failures > 0 && refreshInfo.httpStatus !== 429 && <small>{refreshInfo.failures} lỗi liên tiếp</small>}</dd></div>
      <div><dt>Camera có ảnh</dt><dd>{cameras.length ? `${withImage}/${cameras.length}` : '—'}{cameras.length > 0 && <small>{missing} mất nguồn</small>}</dd></div>
      <div><dt>Hồ sơ cần xử lý</dt><dd>{snapshot ? openRecordCount(snapshot.records) : '—'}</dd></div>
      <div><dt>Sự kiện đã nhận</dt><dd>{eventCount}</dd></div>
      <div><dt>Sơ đồ nền</dt><dd>{mapLoading ? 'Đang tải' : roads ? `${roads.edges.length.toLocaleString('vi-VN')} đoạn · ${nodes?.length ?? 0} cụm` : mapError ? 'Lỗi tải' : 'Chưa tải'}</dd></div>
    </dl>
    {mapError && <p className="ops-health-note" role="status">Sơ đồ: {mapError}</p>}
  </section>;
}

function QuickActions({ selectedCamera, onRefresh, onSendCamera, syncMessage, refreshing }: {
  selectedCamera: DemoCamera | null;
  onRefresh: () => void;
  onSendCamera: () => void;
  syncMessage: string;
  refreshing: boolean;
}) {
  return <section className="ops-panel ops-quick" aria-labelledby="ops-quick-title">
    <header className="ops-panel-head"><div><p className="ops-eyebrow">THAO TÁC NHANH</p><h2 id="ops-quick-title">Kênh điều hành</h2></div></header>
    <div className="ops-quick-grid">
      <a className="ops-button ops-button-primary ops-quick-link" href="/hcmc-poc/">Mở trạm 3D</a>
      <button type="button" className="ops-button" onClick={onSendCamera} disabled={!selectedCamera} title={selectedCamera ? 'Gửi lựa chọn camera sang trạm 3D cùng origin' : 'Chọn camera trước'}>Gửi camera sang trạm</button>
      <button type="button" className="ops-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Đang làm mới…' : 'Làm mới dữ liệu'}</button>
    </div>
    {syncMessage && <p className="ops-quick-message" role="status">{syncMessage}</p>}
    <div className="ops-quick-disabled" role="group" aria-labelledby="ops-quick-remote-title" aria-describedby="ops-quick-reason">
      <p className="ops-eyebrow" id="ops-quick-remote-title">ĐIỀU KHIỂN TỪ XA</p>
      <div className="ops-quick-grid">
        <button type="button" className="ops-button" disabled title="API public chưa có endpoint điều khiển đèn">Đổi chế độ đèn</button>
        <button type="button" className="ops-button" disabled title="API public chưa có endpoint ghim đèn">Ghim đèn</button>
        <button type="button" className="ops-button" disabled title="API public chưa có endpoint bơm xe">Bơm xe</button>
        <button type="button" className="ops-button" disabled title="API public chưa có endpoint triệu hồi xe ưu tiên">Triệu hồi ưu tiên</button>
      </div>
      <p id="ops-quick-reason" className="ops-quick-reason">Các nút này bị khoá vì API public hiện không có endpoint điều khiển. Dùng bàn cưỡng chế trong trạm 3D; console không gửi lệnh khi thiếu kênh.</p>
    </div>
  </section>;
}

function LoadingSkeleton() {
  return <>
    <section className="ops-kpis" aria-label="Đang tải chỉ số" aria-busy="true">
      {KPI_FIELDS.map(field => <article key={field.key} className="ops-kpi is-loading">
        <div className="ops-kpi-top"><h3>{field.label}</h3><span className="ops-kpi-samples">—</span></div>
        <div className="ops-kpi-value"><span className="ops-skeleton ops-skeleton-value" /></div>
        <div className="ops-skeleton ops-skeleton-spark" />
        <div className="ops-kpi-foot"><span className="ops-skeleton ops-skeleton-text" /></div>
      </article>)}
      <article className="ops-kpi is-loading"><div className="ops-kpi-top"><h3>Hồ sơ cần xử lý</h3><span className="ops-kpi-samples">—</span></div><div className="ops-kpi-value"><span className="ops-skeleton ops-skeleton-value" /></div><div className="ops-skeleton ops-skeleton-spark" /><div className="ops-kpi-foot"><span className="ops-skeleton ops-skeleton-text" /></div></article>
    </section>
    <div className="ops-layout">
      <div className="ops-layout-main"><section className="ops-panel ops-camera-panel">
        <div className="ops-panel-head"><div><p className="ops-eyebrow">HIỆN TRƯỜNG</p><h2>Đang mở phiên dữ liệu…</h2></div></div>
        <div className="ops-stage ops-stage-skeleton"><span className="ops-skeleton ops-skeleton-stage" /></div>
        <div className="ops-wall-grid ops-wall-skeleton">{Array.from({ length: 10 }, (_, index) => <div key={index} className="ops-skeleton ops-skeleton-tile" />)}</div>
      </section></div>
      <aside className="ops-layout-side"><section className="ops-panel"><div className="ops-panel-head"><div><p className="ops-eyebrow">LUỒNG SỰ KIỆN</p><h2>Đang chờ tín hiệu…</h2></div></div><div className="ops-feed-empty"><strong>Đang mở phiên điều hành</strong><p>Khung sự kiện và camera sẽ xuất hiện khi API phiên trả dữ liệu.</p></div></section></aside>
    </div>
    <section className="ops-panel ops-desk"><div className="ops-panel-head"><div><p className="ops-eyebrow">HỒ SƠ VI PHẠM</p><h2>Đang tải hồ sơ…</h2></div></div><div className="ops-skeleton ops-skeleton-table" /></section>
  </>;
}

export function OfficerConsole() {
  const [snapshot, setSnapshot] = useState<DemoOfficerSnapshot | null>(null);
  const [bootState, setBootState] = useState<BootState>('loading');
  const [bootError, setBootError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshInfo, setRefreshInfo] = useState<RefreshInfo>(EMPTY_REFRESH);
  const [refreshing, setRefreshing] = useState(false);
  const [kpiHistory, setKpiHistory] = useState<{ at: number; kpi: DemoKpi }[]>([]);
  const [openHistory, setOpenHistory] = useState<number[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<DemoCameraFrame | null>(null);
  const [frames, setFrames] = useState<Record<string, DemoCameraFrame | undefined>>({});
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraRetry, setCameraRetry] = useState(0);
  const [wallLoading, setWallLoading] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [events, setEvents] = useState<StationEvent[]>([]);
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [nodes, setNodes] = useState<DemoNodeMapEntry[] | null>(null);
  const [roads, setRoads] = useState<MapRoadData | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('field');
  const [focusRequest, setFocusRequest] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const isMobile = useMediaQuery('(max-width: 900px)');

  const snapshotSeq = useRef(0);
  const snapshotAbort = useRef<AbortController | null>(null);
  const snapshotInFlight = useRef(false);
  const hasData = useRef(false);
  const failures = useRef(0);
  const nextAt = useRef(0);
  const wallAbort = useRef<AbortController | null>(null);
  const wallKey = useRef('');
  const cameraEpoch = useRef(0);
  const cameraAbort = useRef<AbortController | null>(null);
  const decisionGuard = useRef(false);
  const mapAbort = useRef<AbortController | null>(null);
  const cameraPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add('ops-route');
    return () => document.body.classList.remove('ops-route');
  }, []);

  const requestSnapshot = useCallback(async (force = false): Promise<boolean> => {
    if (!force && snapshotInFlight.current) return false;
    const seq = ++snapshotSeq.current;
    snapshotAbort.current?.abort();
    const controller = new AbortController();
    snapshotAbort.current = controller;
    snapshotInFlight.current = true;
    setRefreshing(true);
    const started = performance.now();
    const apply = (result: DemoOfficerSnapshot) => {
      const at = Date.now();
      setSnapshot(result);
      hasData.current = true;
      setBootState('ready');
      setBootError('');
      setLastUpdated(at);
      setKpiHistory(history => [...history, { at, kpi: result.kpi }].slice(-24));
      setOpenHistory(history => [...history, openRecordCount(result.records)].slice(-24));
      failures.current = 0;
      const next = at + REFRESH_MS;
      nextAt.current = next;
      setRefreshInfo({ latency: Math.round(performance.now() - started), failures: 0, message: '', nextAt: next, lastAt: at });
    };
    try {
      const result = await getOfficerSnapshot(fetch, controller.signal);
      if (controller.signal.aborted || seq !== snapshotSeq.current) return false;
      apply(result);
      return true;
    } catch (error) {
      if (controller.signal.aborted || seq !== snapshotSeq.current) return false;
      if (error instanceof DemoApiError && error.status === 401) {
        try {
          await startDemoSession();
          const retry = await getOfficerSnapshot(fetch, controller.signal);
          if (!controller.signal.aborted && seq === snapshotSeq.current) { apply(retry); return true; }
        } catch { /* rơi xuống nhánh lỗi bên dưới */ }
      }
      const status = error instanceof DemoApiError ? error.status : 0;
      const code = error instanceof DemoApiError ? error.code : 'UNKNOWN';
      const message = error instanceof DemoApiError ? error.message : 'Không tải được dữ liệu phiên. Thử lại sau.';
      failures.current += 1;
      const delay = status === 429 ? Math.min(60_000, REFRESH_MS * 2 ** Math.min(failures.current, 3)) : REFRESH_MS;
      const next = Date.now() + delay;
      nextAt.current = next;
      // Giữ lastAt là lần lấy dữ liệu THÀNH CÔNG gần nhất; banner/health không được gọi giờ lỗi là giờ cập nhật.
      setRefreshInfo(previous => ({ latency: null, failures: failures.current, httpStatus: status || undefined, code, message, nextAt: next, lastAt: previous.lastAt }));
      setBootError(message);
      if (!hasData.current) setBootState('error');
      return false;
    } finally {
      if (seq === snapshotSeq.current) {
        snapshotInFlight.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  const boot = useCallback(async () => {
    setBootState('loading');
    setBootError('');
    try {
      await startDemoSession();
      const ok = await requestSnapshot(true);
      if (!ok && !hasData.current) setBootState('error');
    } catch (error) {
      const message = error instanceof DemoApiError ? error.message : 'Không mở được phiên dữ liệu. Thử lại sau.';
      setBootState('error');
      setBootError(message);
    }
  }, [requestSnapshot]);

  useEffect(() => {
    void boot();
    return () => {
      snapshotAbort.current?.abort();
      wallAbort.current?.abort();
      cameraAbort.current?.abort();
      mapAbort.current?.abort();
    };
  }, [boot]);

  useEffect(() => {
    if (bootState !== 'ready') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || snapshotInFlight.current) return;
      if (Date.now() >= nextAt.current) void requestSnapshot();
    }, 1_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !snapshotInFlight.current && Date.now() >= nextAt.current) void requestSnapshot();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [bootState, requestSnapshot]);

  useEffect(() => subscribeStationEvents(event => {
    setEvents(current => {
      const key = eventKey(event);
      if (current.some(item => eventKey(item) === key)) return current;
      return [...current, event].sort((left, right) => right.at - left.at).slice(0, 80);
    });
  }), []);

  const loadWall = useCallback(async (cameras: DemoCamera[], force = false) => {
    const key = cameras.map(camera => camera.cameraId).join(',');
    if (!cameras.length) return;
    if (!force && wallKey.current === key) return;
    wallKey.current = key;
    wallAbort.current?.abort();
    const controller = new AbortController();
    wallAbort.current = controller;
    setWallLoading(true);
    const queue = [...cameras];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const camera = queue.shift();
        if (!camera) return;
        try {
          const frame = await requestCamera(camera, fetch, controller.signal);
          if (!controller.signal.aborted) setFrames(current => ({ ...current, [frame.cameraId]: frame }));
        } catch {
          if (!controller.signal.aborted) setFrames(current => ({ ...current, [camera.cameraId]: { ...camera, source: 'missing', frameId: '', capturedAt: null, imageUrl: null } }));
        }
      }
    });
    await Promise.all(workers);
    if (!controller.signal.aborted) setWallLoading(false);
  }, []);

  useEffect(() => {
    if (snapshot?.cameras.length) void loadWall(snapshot.cameras);
  }, [snapshot?.cameras, loadWall]);

  const selectedCamera = useMemo(
    () => snapshot?.cameras.find(camera => camera.cameraId === selectedCameraId) ?? null,
    [snapshot, selectedCameraId],
  );

  useEffect(() => {
    if (!snapshot) return;
    if (selectedCameraId && snapshot.cameras.some(camera => camera.cameraId === selectedCameraId)) return;
    setSelectedCameraId(snapshot.cameras[0]?.cameraId ?? null);
  }, [snapshot, selectedCameraId]);

  useEffect(() => {
    if (!selectedCamera) { setSelectedFrame(null); return; }
    const epoch = ++cameraEpoch.current;
    cameraAbort.current?.abort();
    const controller = new AbortController();
    cameraAbort.current = controller;
    setCameraBusy(true);
    setCameraError('');
    setSelectedFrame(frames[selectedCamera.cameraId] ?? null);
    let timer: number | undefined;
    const poll = async () => {
      if (document.visibilityState !== 'visible') {
        timer = window.setTimeout(() => void poll(), CAMERA_POLL_MS);
        return;
      }
      try {
        const frame = await requestCamera(selectedCamera, fetch, controller.signal);
        if (controller.signal.aborted || epoch !== cameraEpoch.current) return;
        setSelectedFrame(frame);
        setFrames(current => ({ ...current, [frame.cameraId]: frame }));
        setCameraError('');
      } catch (error) {
        if (controller.signal.aborted || epoch !== cameraEpoch.current) return;
        const message = error instanceof DemoApiError ? error.message : 'Không tải được camera. Thử lại.';
        const missing: DemoCameraFrame = { ...selectedCamera, source: 'missing', frameId: '', capturedAt: null, imageUrl: null };
        setSelectedFrame(missing);
        setFrames(current => ({ ...current, [selectedCamera.cameraId]: missing }));
        setCameraError(message);
      } finally {
        if (!controller.signal.aborted && epoch === cameraEpoch.current) {
          setCameraBusy(false);
          timer = window.setTimeout(() => void poll(), CAMERA_POLL_MS);
        }
      }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [selectedCamera?.cameraId, cameraRetry]);

  const postCamera = useCallback((camera: DemoCamera) => {
    try {
      const channel = new BroadcastChannel('smtf-submit-camera');
      channel.postMessage({ type: 'camera', cameraId: camera.cameraId, junctionId: camera.junctionId });
      channel.close();
    } catch { /* Trình duyệt không hỗ trợ: giữ nguyên luồng web. */ }
  }, []);

  const chooseCamera = useCallback((cameraId: string) => {
    const camera = snapshot?.cameras.find(item => item.cameraId === cameraId);
    if (!camera) return;
    if (selectedCameraId === cameraId) setCameraRetry(value => value + 1);
    else {
      setSelectedCameraId(cameraId);
      setSelectedFrame(frames[cameraId] ?? null);
      setCameraBusy(!frames[cameraId]);
    }
    postCamera(camera);
  }, [snapshot, selectedCameraId, frames, postCamera]);

  const viewCamera = useCallback((cameraId: string) => {
    chooseCamera(cameraId);
    setMobileTab('field');
    setFocusRequest(value => value + 1);
    window.setTimeout(() => cameraPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [chooseCamera]);

  const sendCamera = () => {
    if (!selectedCamera) return;
    postCamera(selectedCamera);
    setSyncMessage(`Đã gửi ${selectedCamera.cameraId} sang trạm 3D. Trạm chỉ phản hồi nếu đang mở cùng origin.`);
  };

  const toggleHandled = (key: string) => {
    setHandled(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const decide = useCallback(async (plate: string, action: DemoDecisionAction, note: string): Promise<DecisionResult> => {
    if (decisionGuard.current) return { ok: false, message: 'Đang ghi một quyết định khác. Chờ hoàn tất rồi thử lại.' };
    decisionGuard.current = true;
    setDecisionBusy(true);
    snapshotSeq.current += 1;
    try {
      const result = await postDecision(plate, action, note);
      const refreshed = await requestSnapshot(true);
      return { ok: true, status: result.status, message: refreshed ? undefined : 'Quyết định đã ghi nhưng chưa làm mới được bảng hồ sơ.' };
    } catch (error) {
      // Đã tăng seq để bỏ phản hồi poll cũ; phải mở một lượt đồng bộ mới, nếu không cờ in-flight kẹt.
      void requestSnapshot(true);
      return { ok: false, message: error instanceof DemoApiError ? error.message : 'Không ghi được quyết định. Thử lại.' };
    } finally {
      decisionGuard.current = false;
      setDecisionBusy(false);
    }
  }, [requestSnapshot]);

  const loadMap = useCallback(async () => {
    mapAbort.current?.abort();
    const controller = new AbortController();
    mapAbort.current = controller;
    setMapLoading(true);
    setMapError('');
    const [roadsResult, nodesResult] = await Promise.allSettled([
      fetch(MAP_ROADS_URL, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error(`Không tải được sơ đồ (HTTP ${response.status}).`);
        return response.json() as Promise<MapRoadData>;
      }),
      fetch(MAP_NODES_URL, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error(`Không tải được danh sách cụm camera (HTTP ${response.status}).`);
        return response.json() as Promise<DemoNodeMapEntry[]>;
      }),
    ]);
    if (controller.signal.aborted) return;
    if (roadsResult.status === 'fulfilled' && roadsResult.value?.bbox && Array.isArray(roadsResult.value.edges)) setRoads(roadsResult.value);
    else setMapError(roadsResult.status === 'rejected' ? String(roadsResult.reason?.message ?? roadsResult.reason) : 'Dữ liệu đường không đúng định dạng.');
    if (nodesResult.status === 'fulfilled' && Array.isArray(nodesResult.value)) setNodes(nodesResult.value);
    setMapLoading(false);
  }, []);

  useEffect(() => { void loadMap(); }, [loadMap]);

  const latestKpi = snapshot?.kpi ?? null;
  const kpiValues = (field: typeof KPI_FIELDS[number]) => kpiHistory.map(sample => Number(sample.kpi[field.key])).filter(Number.isFinite);
  const openCount = snapshot ? openRecordCount(snapshot.records) : null;

  const fieldPanel = <div ref={cameraPanel}><CameraPanel
    cameras={snapshot?.cameras ?? []}
    selectedId={selectedCameraId}
    selectedFrame={selectedFrame}
    frames={frames}
    cameraBusy={cameraBusy}
    cameraError={cameraError}
    wallLoading={wallLoading}
    nodes={nodes}
    roads={roads}
    mapLoading={mapLoading}
    mapError={mapError}
    focusRequest={focusRequest}
    onSelect={chooseCamera}
    onRetrySelected={() => setCameraRetry(value => value + 1)}
    onReloadWall={() => snapshot && void loadWall(snapshot.cameras, true)}
    onRetryMap={() => void loadMap()}
  /></div>;

  const sidePanel = <>
    <EventFeed events={events} cameras={snapshot?.cameras ?? []} nodes={nodes} handled={handled} onViewCamera={viewCamera} onToggleHandled={toggleHandled} />
    <QuickActions selectedCamera={selectedCamera} onRefresh={() => void requestSnapshot(true)} onSendCamera={sendCamera} syncMessage={syncMessage} refreshing={refreshing} />
    <HealthPanel snapshot={snapshot} frames={frames} eventCount={events.length} refreshInfo={refreshInfo} nodes={nodes} roads={roads} mapLoading={mapLoading} mapError={mapError} />
  </>;

  const desk = <ViolationDesk records={snapshot?.records ?? []} loading={bootState === 'loading'} cameras={snapshot?.cameras ?? []} nodes={nodes} decisionBusy={decisionBusy} onDecide={decide} />;

  return <div className="ops-app">
    <TopBar source={latestKpi?.source ?? null} lastUpdated={lastUpdated} refreshInfo={refreshInfo} refreshing={refreshing} bootState={bootState} onRefresh={() => void requestSnapshot(true)} />
    <RefreshBanner info={refreshInfo} hasData={Boolean(snapshot)} />
    <main className="ops-main">
      <h1 className="ops-sr-only">Trung tâm điều hành giao thông khu Bắc</h1>
      {bootState === 'loading' && !snapshot
        ? <LoadingSkeleton />
        : bootState === 'error' && !snapshot
          ? <div className="ops-layout ops-layout-error">
              <div className="ops-layout-main"><section className="ops-panel ops-boot-error" role="alert">
                <p className="ops-eyebrow">PHIÊN DỮ LIỆU</p>
                <h1>Chưa mở được trung tâm điều hành</h1>
                <p>{bootError || 'Không kết nối được API phiên.'}</p>
                <p className="ops-muted">Không có dữ liệu tự tạo thay thế. Kiểm tra kết nối rồi thử lại; khung sự kiện bên cạnh vẫn nghe kênh trạm 3D.</p>
                <button type="button" className="ops-button ops-button-primary" onClick={() => void boot()} disabled={refreshing}>{refreshing ? 'Đang thử…' : 'Thử mở lại phiên'}</button>
              </section></div>
              <aside className="ops-layout-side">{sidePanel}</aside>
            </div>
          : <>
              {snapshot && <section className="ops-kpis" aria-label="Chỉ số vận hành">
                {KPI_FIELDS.map(field => <KpiCard key={field.key} label={field.label} value={Number(latestKpi?.[field.key] ?? NaN)} unit={field.unit} values={kpiValues(field)} lowerIsBetter={field.lowerIsBetter} loading={false} />)}
                <KpiCard label="Hồ sơ cần xử lý" value={openCount} unit="hồ sơ" values={openHistory} lowerIsBetter loading={false} />
              </section>}
              {isMobile ? <>
                <nav className="ops-mobile-tabs" role="tablist" aria-label="Khu vực điều hành">
                  <button type="button" role="tab" id="ops-mtab-field" aria-controls="ops-mpanel" aria-selected={mobileTab === 'field'} className={mobileTab === 'field' ? 'is-active' : ''} onClick={() => setMobileTab('field')}>Hiện trường</button>
                  <button type="button" role="tab" id="ops-mtab-events" aria-controls="ops-mpanel" aria-selected={mobileTab === 'events'} className={mobileTab === 'events' ? 'is-active' : ''} onClick={() => setMobileTab('events')}>Sự kiện <span>{events.length}</span></button>
                  <button type="button" role="tab" id="ops-mtab-records" aria-controls="ops-mpanel" aria-selected={mobileTab === 'records'} className={mobileTab === 'records' ? 'is-active' : ''} onClick={() => setMobileTab('records')}>Hồ sơ <span>{openCount ?? 0}</span></button>
                </nav>
                <div role="tabpanel" id="ops-mpanel" aria-labelledby={`ops-mtab-${mobileTab}`}>
                  {mobileTab === 'field' && fieldPanel}
                  {mobileTab === 'events' && <div className="ops-mobile-stack">{sidePanel}</div>}
                  {mobileTab === 'records' && desk}
                </div>
              </> : <>
                <div className="ops-layout">
                  <div className="ops-layout-main">{fieldPanel}</div>
                  <aside className="ops-layout-side">{sidePanel}</aside>
                </div>
                {desk}
              </>}
            </>}
    </main>
    <footer className="ops-footer">
      <span>Camera lấy từ API phiên · hồ sơ từ API điều hành · sự kiện qua BroadcastChannel cùng origin.</span>
    </footer>
  </div>;
}
