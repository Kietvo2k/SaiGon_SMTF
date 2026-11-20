import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  createRequestEpoch, DemoApiError, DemoCamera, DemoCameraFrame, DemoLookup,
  DemoOfficerSnapshot, getOfficerSnapshot, lookupPlate, requestCamera, startDemoSession,
} from './api';

export function isVercelDemoRoute(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'vercel'
    || import.meta.env.VITE_SMTF_SUBMIT === '1';
}

const cameraIdsEqual = (left?: DemoCamera, right?: DemoCamera | null) => left?.cameraId === right?.cameraId;
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : 'Ảnh mẫu · không có giờ chụp';

function LandingBack() {
  return <a className="submit-back" href="/">← Về trang chọn demo</a>;
}

function MediaFrame({ camera, frame, busy, error, onRetry }: { camera: DemoCamera | null; frame: DemoCameraFrame | null; busy: boolean; error: string; onRetry: () => void }) {
  const [imageError, setImageError] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => setImageError(false), [frame?.frameId, frame?.imageUrl]);
  const fullScreen = async () => {
    try {
      if (stage.current && !document.fullscreenElement) await stage.current.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* Browser denied fullscreen; keep the contained inline frame visible. */ }
  };
  const source = frame?.source;
  const missing = !frame || source === 'missing' || imageError || !frame.imageUrl;
  const shownSource = missing ? 'missing' : source;
  return <section className="submit-camera" aria-labelledby="submit-camera-title">
    <div className="submit-camera-head"><div><p className="submit-eyebrow">GÓC NHÌN CAMERA</p><h2 id="submit-camera-title">{camera?.label ?? 'Camera đang chờ dữ liệu'}</h2></div>
      <button className="submit-secondary" type="button" onClick={fullScreen} disabled={missing} aria-label="Mở camera toàn màn hình">Toàn màn hình</button></div>
    <div className="submit-media-stage" ref={stage} aria-busy={busy}>
      {missing ? <div className="submit-media-empty" role={error || imageError ? 'alert' : 'status'}>
        <strong>{imageError || error ? 'Không tải được camera này' : 'Chưa có ảnh từ camera này'}</strong>
        <span>{error || (source === 'missing' ? 'Nguồn hiện không có khung hình. Không thay bằng ảnh của camera khác.' : 'Chọn camera và thử tải lại nguồn ảnh.')}</span>
        <button className="submit-secondary" type="button" onClick={() => { setImageError(false); onRetry(); }} disabled={busy}>Thử lại</button>
      </div> : <img key={frame.frameId} src={frame.imageUrl!} alt={`Khung hình camera ${frame.label}`} onError={() => setImageError(true)} />}
      {busy && <span className="submit-media-loading" role="status">Đang tải đúng camera…</span>}
    </div>
    <div className="submit-media-meta" aria-live="polite">
      <span className={`submit-source submit-source-${shownSource}`}>{shownSource === 'live' ? 'Trực tiếp từ mô phỏng' : shownSource === 'sample' ? 'Ảnh mẫu' : busy ? 'Đang tải' : 'Mất nguồn'}</span>
      {!missing && <span>{dateLabel(frame.capturedAt)}</span>}
      {camera && <span>{camera.junctionId} · {camera.cameraId}</span>}
    </div>
  </section>;
}

export function OfficerSubmitDemo() {
  const [snapshot, setSnapshot] = useState<DemoOfficerSnapshot | null>(null);
  const [selected, setSelected] = useState<DemoCamera | null>(null);
  const [frame, setFrame] = useState<DemoCameraFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [started, setStarted] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const epoch = useRef(createRequestEpoch());
  const cameraRequest = useRef<AbortController | null>(null);
  const load = async () => {
    setStarted(true); setBusy(true); setError('');
    try {
      await startDemoSession();
      const result = await getOfficerSnapshot();
      setSnapshot(result);
      setSelected(current => result.cameras.find(item => cameraIdsEqual(item, current)) ?? result.cameras[0] ?? null);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof DemoApiError ? err.message : 'Không tải được dữ liệu demo. Thử lại sau.');
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!selected) return;
    const request = epoch.current.issue();
    const controller = new AbortController();
    cameraRequest.current = controller;
    let timer: number | undefined;
    async function refresh(camera: DemoCamera) {
      try {
        const result = await requestCamera(camera, fetch, controller.signal);
        if (!epoch.current.isCurrent(request)) return;
        setFrame(result);
        setCameraError('');
      } catch (err) {
        if (!epoch.current.isCurrent(request)) return;
        setFrame(null);
        setCameraError(err instanceof DemoApiError ? err.message : 'Không tải được camera. Thử lại.');
      } finally {
        if (epoch.current.isCurrent(request)) {
          setCameraBusy(false);
          timer = window.setTimeout(() => void refresh(camera), 3000);
        }
      }
    }
    setCameraBusy(true);
    setCameraError('');
    setFrame(null);
    void refresh(selected);
    return () => {
      epoch.current.cancel();
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selected, cameraRetry]);
  return <main className="submit-shell">
    <header className="submit-header"><a className="submit-wordmark" href="/">SMTF <span>SAIGON · ĐIỀU HÀNH</span></a><LandingBack /></header>
    <div className="submit-title"><p className="submit-eyebrow">TRUNG TÂM ĐIỀU HÀNH · CHẾ ĐỘ CHỈ XEM</p><h1>Demo cán bộ</h1><p>Một phiên demo tạm thời. Dữ liệu và quyền truy cập đến từ dịch vụ bản nộp.</p></div>
    {!started ? <section className="submit-entry-callout"><p>Một phiên tạm thời để xem chỉ số, hồ sơ mẫu và camera. Không cần tạo tài khoản.</p><button type="button" onClick={() => void load()} disabled={busy}>Vào demo cán bộ</button></section> : error ? <section className="submit-error" role="alert"><strong>Chưa mở được demo cán bộ</strong><p>{error}</p><button type="button" onClick={() => void load()} disabled={busy}>{busy ? 'Đang thử…' : 'Thử tải lại'}</button></section> : <>
      <section className="submit-kpis" aria-label="Chỉ số giao thông">
        <Kpi label="Nguồn chỉ số" value={snapshot?.kpi.source === 'live' ? 'Trực tiếp' : snapshot?.kpi.source === 'sample' ? 'Dữ liệu mẫu' : busy ? 'Đang tải…' : 'Chưa có'} />
        <Kpi label="Chờ trung bình" value={snapshot ? `${snapshot.kpi.wait_avg_s} giây` : '—'} />
        <Kpi label="Hàng chờ lớn nhất" value={snapshot ? `${snapshot.kpi.queue_max} xe` : '—'} />
        <Kpi label="Lưu lượng mỗi nút" value={snapshot ? `${snapshot.kpi.flow_per_node_min} xe/phút` : '—'} />
      </section>
      <section className="submit-dashboard">
        <div className="submit-camera-column"><label className="submit-select-label" htmlFor="submit-camera-select">Chọn camera
          <select id="submit-camera-select" value={selected?.cameraId ?? ''} onChange={event => { epoch.current.cancel(); cameraRequest.current?.abort(); setFrame(null); setCameraBusy(true); setCameraError(''); setSelected(snapshot?.cameras.find(item => item.cameraId === event.target.value) ?? null); }} disabled={busy || !snapshot?.cameras.length}>
            {(snapshot?.cameras ?? []).map(camera => <option key={camera.cameraId} value={camera.cameraId}>{camera.label} · {camera.junctionId}</option>)}
          </select></label>
          <MediaFrame key={selected?.cameraId} camera={selected} frame={frame} busy={cameraBusy} error={cameraError}
            onRetry={() => selected ? setCameraRetry(value => value + 1) : void load()} />
        </div>
        <section className="submit-records"><div className="submit-section-head"><div><p className="submit-eyebrow">HỒ SƠ MẪU</p><h2>Hồ sơ cần theo dõi</h2></div><span>{snapshot?.records.length ?? '—'} hồ sơ</span></div>
          {!snapshot?.records.length ? <p className="submit-empty" role="status">{busy ? 'Đang tải hồ sơ…' : 'Chưa có hồ sơ trong phiên này.'}</p> : <ul>{snapshot.records.map((record, index) => <li key={`${record.plate}-${index}`}><strong>{record.plate}</strong><span>{record.summary}</span><small>{record.status}</small></li>)}</ul>}
        </section>
      </section>
    </>}
  </main>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="submit-kpi"><span>{label}</span><strong>{value}</strong></div>;
}

export function CitizenSubmitLookup() {
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState<DemoLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lookup = async (event: FormEvent) => {
    event.preventDefault(); setResult(null); setError(''); setMessage(''); setBusy(true);
    try {
      const value = await lookupPlate(plate);
      setPlate(value.plate); setResult(value);
      setMessage(value.records.length ? `${value.records.length} hồ sơ được tìm thấy.` : 'Biển số hợp lệ, chưa có hồ sơ trong dữ liệu demo.');
    } catch (err) {
      setError(err instanceof DemoApiError ? err.message : 'Không kết nối được dịch vụ tra cứu. Thử lại sau.');
    } finally { setBusy(false); }
  };
  return <main className="submit-shell submit-lookup-shell">
    <header className="submit-header"><a className="submit-wordmark" href="/">SMTF <span>SAIGON · TRA CỨU</span></a><LandingBack /></header>
    <div className="submit-lookup">
      <p className="submit-eyebrow">TRA CỨU CÔNG KHAI · KHÔNG CẦN ĐĂNG NHẬP</p><h1>Tra cứu biển số.</h1>
      <p>Tìm hồ sơ mẫu từ cùng nguồn dữ liệu demo với trang cán bộ.</p>
      <form className="submit-lookup-form" onSubmit={event => void lookup(event)}>
        <label htmlFor="submit-plate">Biển số xe</label><div className="submit-lookup-input"><input id="submit-plate" value={plate} onChange={event => setPlate(event.target.value.toUpperCase())} placeholder="Ví dụ: 51K-123.45" autoComplete="off" spellCheck={false} readOnly={busy} aria-describedby="submit-plate-hint" />
          <button type="submit" disabled={busy}>{busy ? 'Đang tra cứu…' : 'Tra cứu biển số'}</button></div>
        <span id="submit-plate-hint">Nhập có dấu phân cách hoặc viết liền.</span>
      </form>
      <div className="submit-sample-plates" aria-label="Biển số mẫu để thử"><span>Thử biển mẫu</span>{['51K-123.45','51K12345','51K-987.65'].map(item => <button key={item} type="button" disabled={busy} onClick={() => { setPlate(item); setError(''); setMessage(''); setResult(null); }}>{item}</button>)}</div>
      {error && <p className="submit-error" role="alert">{error}</p>}{message && <p className="submit-lookup-message" role="status">{message}</p>}
      {!!result?.records.length && <section className="submit-lookup-results" aria-label="Kết quả tra cứu">{result.records.map((record, index) => <article key={`${record.plate}-${index}`}><strong>{record.plate}</strong><p>{record.summary}</p><span>{record.status}</span></article>)}</section>}
    </div>
  </main>;
}
