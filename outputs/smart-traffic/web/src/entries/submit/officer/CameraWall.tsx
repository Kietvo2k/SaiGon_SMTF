import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoCamera, DemoCameraFrame } from '../api';
import { displayNodeLabel } from '../../../lib/labels';
import {
  buildJunctionMarkers, filterCameras, formatDateTime, frameSourceLabel, isFrameStale,
  type CameraSourceFilter, type DemoNodeMapEntry, type MapRoadData, uniqueJunctions,
} from './ops-model';

interface CameraPanelProps {
  cameras: DemoCamera[];
  selectedId: string | null;
  selectedFrame: DemoCameraFrame | null;
  frames: Record<string, DemoCameraFrame | undefined>;
  cameraBusy: boolean;
  cameraError: string;
  wallLoading: boolean;
  nodes: DemoNodeMapEntry[] | null;
  roads: MapRoadData | null;
  mapLoading: boolean;
  mapError: string;
  focusRequest: number;
  onSelect: (cameraId: string) => void;
  onRetrySelected: () => void;
  onReloadWall: () => void;
  onRetryMap: () => void;
}

const SOURCE_OPTIONS: { value: CameraSourceFilter; label: string }[] = [
  { value: 'all', label: 'Mọi nguồn' },
  { value: 'live', label: 'Trực tiếp' },
  { value: 'sample', label: 'Tệp' },
  { value: 'missing', label: 'Mất nguồn' },
  { value: 'pending', label: 'Đang tải' },
];

function junctionLabels(cameras: DemoCamera[], nodes: DemoNodeMapEntry[] | null): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const camera of cameras) if (!labels[camera.junctionId]) labels[camera.junctionId] = displayNodeLabel(camera.label.split(' · ')[0]);
  for (const node of nodes ?? []) if (!labels[node.junction_id]) labels[node.junction_id] = displayNodeLabel(node.label);
  return labels;
}

// Thêm nonce khi thử lại để trình duyệt không dùng lại ảnh lỗi đã cache.
const retryUrl = (url: string, tick: number) => tick ? `${url}${url.includes('?') ? '&' : '?'}retry=${tick}` : url;

function CameraStage({ camera, frame, busy, error, onRetry }: {
  camera: DemoCamera | null;
  frame: DemoCameraFrame | null;
  busy: boolean;
  error: string;
  onRetry: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => { setImageError(false); setRetryTick(0); }, [camera?.cameraId, frame?.frameId, frame?.imageUrl]);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const missing = !camera || !frame || frame.source === 'missing' || !frame.imageUrl || imageError;
  const stale = isFrameStale(frame);
  const hasFile = Boolean(frame?.imageUrl) && frame?.source === 'sample' && !imageError;
  const toggleFullscreen = async () => {
    try {
      if (stage.current && !document.fullscreenElement) await stage.current.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* Trình duyệt từ chối fullscreen: giữ khung trong trang. */ }
  };
  const retry = () => {
    setImageError(false);
    setRetryTick(value => value + 1);
    onRetry();
  };
  const source = imageError ? 'missing' : frame?.source ?? 'pending';

  return <div className={`ops-stage${missing ? ' ops-stage-missing' : ''}`} ref={stage} aria-busy={busy} data-camera={camera?.cameraId ?? ''}>
    {camera && <>
      <div className="ops-stage-top">
        <div className="ops-stage-id"><span>{camera.cameraId}</span><b>{displayNodeLabel(camera.label)}</b></div>
        <div className="ops-stage-actions">
          <span className={`ops-source ops-source-${source}`}>{imageError ? 'Lỗi ảnh' : frameSourceLabel(frame ?? undefined)}</span>
          <button type="button" className="ops-icon-button" onClick={() => void toggleFullscreen()} disabled={missing} aria-pressed={fullscreen}>
            {fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>
        </div>
      </div>
      {missing
        ? <div className="ops-stage-empty" role={error || imageError ? 'alert' : 'status'}>
            <strong>{imageError || error ? 'Không tải được camera này' : frame ? 'Camera đang mất nguồn' : 'Đang tải khung hình'}</strong>
            <span>{camera.cameraId} · {error || (imageError ? 'Ảnh trả về lỗi. Thử tải lại khung.' : frame?.source === 'missing' ? 'Nguồn không có khung. Không thay bằng ảnh của camera khác.' : frame?.source === 'sample' ? 'Nguồn báo có tệp nhưng chưa trả ảnh.' : 'Đang chờ khung đầu tiên từ nguồn camera.')}</span>
            <button type="button" className="ops-button" onClick={retry}>Tải lại khung</button>
          </div>
        : <img key={`${frame.frameId}:${retryTick}`} className="ops-stage-image" src={retryUrl(frame.imageUrl!, retryTick)} alt={`Khung hình camera ${camera.label}`} decoding="async" onError={() => setImageError(true)} />}
      <div className="ops-stage-bottom">
        <span>{frame?.capturedAt ? formatDateTime(frame.capturedAt) : hasFile ? 'Tệp · không có giờ chụp' : 'Chưa có giờ chụp'}</span>
        <span>{camera.junctionId}</span>
        {stale && <span className="ops-stale">Khung cũ · quá 10 giây</span>}
        {busy && !missing && <span className="ops-refreshing">Đang làm mới…</span>}
      </div>
    </>}
    {!camera && <div className="ops-stage-empty" role="status"><strong>Chưa có camera được chọn</strong><span>Chọn một camera trong lưới bên dưới để xem khung lớn.</span></div>}
  </div>;
}

function WallThumb({ camera, frame, active, onSelect }: {
  camera: DemoCamera;
  frame: DemoCameraFrame | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const [imageState, setImageState] = useState<'pending' | 'ready' | 'error'>('pending');
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => { setImageState(frame ? (frame.imageUrl ? 'pending' : 'error') : 'pending'); }, [frame]);
  // Ảnh đã có trong cache có thể hoàn tất trước khi React gắn onLoad.
  useEffect(() => {
    if (imageState === 'pending' && imgRef.current?.complete && imgRef.current.naturalWidth > 0) setImageState('ready');
  });

  const hasUrl = Boolean(frame?.imageUrl);
  const failed = imageState === 'error';
  const showImage = hasUrl && !failed;
  const status = failed
    ? (hasUrl ? 'Lỗi ảnh' : frame?.source === 'missing' ? 'Mất nguồn' : 'Chưa có ảnh')
    : !frame ? 'Đang tải' : !hasUrl ? (frame.source === 'missing' ? 'Mất nguồn' : 'Chưa có ảnh') : null;

  return <button type="button" className={`ops-wall-item${active ? ' is-active' : ''}`}
    aria-pressed={active}
    aria-label={`Chọn ${camera.cameraId} · ${displayNodeLabel(camera.label)} · ${status ?? frameSourceLabel(frame)}`}
    onClick={onSelect}>
    <span className={`ops-wall-thumb${showImage ? '' : ' is-empty'}`} aria-busy={!frame || imageState === 'pending'}>
      {showImage && <img ref={imgRef} src={frame!.imageUrl!} alt="" decoding="async"
        onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />}
      {(!showImage || imageState !== 'ready') && <span className={`ops-wall-placeholder${failed ? ' is-missing' : ''}`}>
        <b>{camera.cameraId}</b>
        <small>{status ?? 'Đang tải ảnh'}</small>
      </span>}
      <span className={`ops-wall-source ops-source-${failed ? 'missing' : frame?.source ?? 'pending'}`}>{status ?? frameSourceLabel(frame)}</span>
      {active && <span className="ops-wall-selected">Đang xem</span>}
    </span>
    <span className="ops-wall-meta">
      <b>{camera.cameraId}</b>
      <small>{camera.junctionId} · {displayNodeLabel(camera.label)}</small>
    </span>
  </button>;
}

const Roads = memo(function Roads({ roads }: { roads: MapRoadData }) {
  return <g aria-hidden="true">
    {roads.edges.map(edge => <polyline
      key={edge.edge}
      className={`ops-road ops-road-${edge.highway}`}
      points={edge.coords.map(([x, z]) => `${x},${z}`).join(' ')}
    />)}
  </g>;
});

function StationMap({ roads, nodes, cameras, selectedId, mapLoading, mapError, onSelect, onRetry }: {
  roads: MapRoadData | null;
  nodes: DemoNodeMapEntry[] | null;
  cameras: DemoCamera[];
  selectedId: string | null;
  mapLoading: boolean;
  mapError: string;
  onSelect: (cameraId: string) => void;
  onRetry: () => void;
}) {
  const markers = useMemo(() => buildJunctionMarkers(cameras, nodes), [cameras, nodes]);
  const labels = useMemo(() => junctionLabels(cameras, nodes), [cameras, nodes]);
  const selected = cameras.find(camera => camera.cameraId === selectedId) ?? null;

  if (mapLoading) return <div className="ops-map ops-map-state" role="status">Đang tải sơ đồ khu Bắc…</div>;
  if (mapError || !roads) {
    return <div className="ops-map ops-map-state" role="alert">
      <strong>Không tải được sơ đồ</strong>
      <span>{mapError || 'Dữ liệu đường chưa sẵn sàng.'}</span>
      <button type="button" className="ops-button" onClick={onRetry}>Thử lại</button>
    </div>;
  }

  const [minX, minZ, maxX, maxZ] = roads.bbox;
  const pad = 90;
  const width = maxX - minX;
  const height = maxZ - minZ;
  const totalWidth = width + pad * 2;
  const totalHeight = height + pad * 2;
  const viewBox = `${minX - pad} ${minZ - pad} ${totalWidth} ${totalHeight}`;
  const relative = (x: number, z: number) => ({
    left: `${((x - (minX - pad)) / totalWidth) * 100}%`,
    top: `${((z - (minZ - pad)) / totalHeight) * 100}%`,
  });

  return <div className="ops-map" style={{ aspectRatio: `${width + pad * 2} / ${height + pad * 2}` }}>
    <svg className="ops-map-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sơ đồ đường khu Bắc và các cụm camera">
      <title>Sơ đồ đường khu Bắc, dữ liệu OpenStreetMap rút gọn</title>
      <rect x={minX - pad} y={minZ - pad} width={width + pad * 2} height={height + pad * 2} className="ops-map-bg" />
      <Roads roads={roads} />
    </svg>
    {markers.map(marker => {
      const active = selected?.junctionId === marker.junctionId;
      const pos = relative(marker.x, marker.z);
      return <button
        key={marker.junctionId}
        type="button"
        className={`ops-map-marker${active ? ' ops-map-marker-active' : ''}${marker.cameraIds.length ? '' : ' ops-map-marker-empty'}`}
        style={pos}
        onClick={() => marker.cameraIds[0] && onSelect(marker.cameraIds[0])}
        disabled={!marker.cameraIds.length}
        aria-pressed={active}
        aria-label={`${marker.junctionId} · ${displayNodeLabel(labels[marker.junctionId] ?? marker.label)} · ${marker.cameraIds.length} camera${marker.cameraIds.length ? '' : ' (không có camera)'}`}
        title={`${marker.junctionId} · ${displayNodeLabel(labels[marker.junctionId] ?? marker.label)} · ${marker.cameraIds.length} camera`}
      >
        <span aria-hidden="true">{marker.cameraIds.length}</span>
        <b>{marker.junctionId}</b>
      </button>;
    })}
    <div className="ops-map-legend" aria-hidden="true">
      <span><i className="ops-legend-road" /> Đường chính</span>
      <span><i className="ops-legend-marker" /> Cụm camera</span>
      <span><i className="ops-legend-active" /> Đang xem</span>
    </div>
    <p className="ops-map-credit">© OpenStreetMap contributors · ODbL 1.0 · sơ đồ rút gọn từ graph khu Bắc</p>
    {selected && <div className="ops-map-selected" role="status">
      <span>Đang chọn</span><b>{selected.cameraId}</b><small>{displayNodeLabel(selected.label)}</small>
    </div>}
    {!markers.length && <p className="ops-map-no-markers" role="status">Không có danh sách cụm camera; sơ đồ chỉ hiển thị đường.</p>}
  </div>;
}

export function CameraPanel({
  cameras, selectedId, selectedFrame, frames, cameraBusy, cameraError, wallLoading,
  nodes, roads, mapLoading, mapError, focusRequest,
  onSelect, onRetrySelected, onReloadWall, onRetryMap,
}: CameraPanelProps) {
  const [view, setView] = useState<'camera' | 'map'>('camera');
  const [query, setQuery] = useState('');
  const [junction, setJunction] = useState('all');
  const [source, setSource] = useState<CameraSourceFilter>('all');
  const [onlySelectedJunction, setOnlySelectedJunction] = useState(false);

  useEffect(() => { if (focusRequest > 0) setView('camera'); }, [focusRequest]);

  const selected = cameras.find(camera => camera.cameraId === selectedId) ?? null;
  const labels = useMemo(() => junctionLabels(cameras, nodes), [cameras, nodes]);
  const junctions = useMemo(() => uniqueJunctions(cameras), [cameras]);
  const effectiveJunction = onlySelectedJunction && selected ? selected.junctionId : junction;
  const filtered = useMemo(
    () => filterCameras(cameras, frames, query, effectiveJunction, source),
    [cameras, frames, query, effectiveJunction, source],
  );
  const withImage = cameras.filter(camera => frames[camera.cameraId]?.imageUrl).length;
  const missing = cameras.filter(camera => frames[camera.cameraId]?.source === 'missing').length;
  const filtersActive = Boolean(query) || junction !== 'all' || source !== 'all' || onlySelectedJunction;

  const resetFilters = () => { setQuery(''); setJunction('all'); setSource('all'); setOnlySelectedJunction(false); };

  return <section className="ops-panel ops-camera-panel" aria-labelledby="ops-camera-title">
    <header className="ops-panel-head">
      <div>
        <p className="ops-eyebrow">HIỆN TRƯỜNG · {cameras.length} CAMERA</p>
        <h2 id="ops-camera-title">Camera &amp; sơ đồ khu Bắc</h2>
      </div>
      <div className="ops-segmented" role="tablist" aria-label="Chế độ xem hiện trường">
        <button type="button" role="tab" id="ops-tab-camera" aria-selected={view === 'camera'} aria-controls="ops-view-camera" className={view === 'camera' ? 'is-active' : ''} onClick={() => setView('camera')}>Camera trực</button>
        <button type="button" role="tab" id="ops-tab-map" aria-selected={view === 'map'} aria-controls="ops-view-map" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}>Sơ đồ</button>
      </div>
    </header>

    <div id="ops-view-camera" role="tabpanel" aria-labelledby="ops-tab-camera" hidden={view !== 'camera'}>
      <CameraStage camera={selected} frame={selectedFrame} busy={cameraBusy} error={cameraError} onRetry={onRetrySelected} />
    </div>
    <div id="ops-view-map" role="tabpanel" aria-labelledby="ops-tab-map" hidden={view !== 'map'}>
      <StationMap roads={roads} nodes={nodes} cameras={cameras} selectedId={selectedId} mapLoading={mapLoading} mapError={mapError} onSelect={onSelect} onRetry={onRetryMap} />
    </div>

    <div className="ops-wall-head">
      <div>
        <p className="ops-eyebrow">LƯỚI QUAN SÁT</p>
        <h3>{filtered.length}/{cameras.length} camera khớp bộ lọc</h3>
      </div>
      <p className="ops-wall-stats"><span>{withImage} có ảnh</span><span>{missing} mất nguồn</span>{wallLoading && <span className="ops-wall-loading" role="status">Đang tải lưới…</span>}</p>
    </div>

    <div className="ops-wall-filters">
      <label className="ops-field ops-field-search">Tìm camera
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Mã, nút giao, hướng…" autoComplete="off" />
      </label>
      <label className="ops-field">Cụm
        <select value={effectiveJunction} onChange={event => { setOnlySelectedJunction(false); setJunction(event.target.value); }}>
          <option value="all">Tất cả cụm</option>
          {junctions.map(item => <option key={item.id} value={item.id}>{item.id} · {displayNodeLabel(labels[item.id] ?? item.id)} ({item.count})</option>)}
        </select>
      </label>
      <label className="ops-field">Nguồn
        <select value={source} onChange={event => setSource(event.target.value as CameraSourceFilter)}>
          {SOURCE_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="ops-wall-filter-actions">
        <button type="button" className={`ops-chip${onlySelectedJunction ? ' is-active' : ''}`} aria-pressed={onlySelectedJunction} onClick={() => setOnlySelectedJunction(value => !value)} disabled={!selected}>
          Cụm đang xem
        </button>
        <button type="button" className="ops-chip" onClick={resetFilters} disabled={!filtersActive}>Xoá lọc</button>
        <button type="button" className="ops-button ops-button-small" onClick={onReloadWall} disabled={wallLoading}>Tải lại lưới</button>
      </div>
    </div>

    {filtered.length
      ? <div className="ops-wall-grid">
          {filtered.map(camera => <WallThumb
            key={camera.cameraId}
            camera={camera}
            frame={frames[camera.cameraId]}
            active={camera.cameraId === selectedId}
            onSelect={() => { setView('camera'); onSelect(camera.cameraId); }}
          />)}
        </div>
      : <div className="ops-empty ops-empty-inline" role="status">
          <strong>{cameras.length ? 'Không có camera khớp bộ lọc' : 'Chưa có camera trong nguồn dữ liệu'}</strong>
          <span>{cameras.length ? 'Thử bỏ từ khoá hoặc chọn cụm/nguồn khác.' : 'API phiên này không trả camera. Không thay bằng dữ liệu tự tạo.'}</span>
          {filtersActive && <button type="button" className="ops-button" onClick={resetFilters}>Xoá bộ lọc</button>}
        </div>}
  </section>;
}
