import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  createRequestEpoch, DemoApiError, DemoCamera, DemoCameraFrame, DemoComplaintKind, DemoDecisionAction,
  DemoLookup, DemoOfficerSnapshot, DemoRecord, DemoRecordDetail, DemoTimeline, getOfficerSnapshot, getRecordDetail,
  getTimeline, lookupPlate, postComplaint, postDecision, requestCamera, startDemoSession,
} from './api';
import {
  complaintKindLabel, evidenceKindLabel, violationStatusLabel, violationStatusTone,
} from '../../lib/labels';
import { subscribeStationEvents, type StationEvent } from '../../lib/events';

export function isVercelDemoRoute(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'vercel'
    || import.meta.env.VITE_SMTF_SUBMIT === '1';
}

const cameraIdsEqual = (left?: DemoCamera, right?: DemoCamera | null) => left?.cameraId === right?.cameraId;
const dateTimeLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : '—';
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : 'Ảnh mẫu · không có giờ chụp';
const penaltyLabel = (record: DemoRecord) => {
  const min = record.penaltyAmountMin ?? record.penaltyAmountMax;
  const max = record.penaltyAmountMax ?? record.penaltyAmountMin;
  const money = new Intl.NumberFormat('vi-VN');
  const range = min != null && max != null
    ? (min === max ? `${money.format(min)} đồng` : `${money.format(min)} – ${money.format(max)} đồng`)
    : '—';
  const points = record.penaltyPoints ? ` · trừ ${record.penaltyPoints} điểm giấy phép lái xe` : '';
  return range === '—' ? '—' : `${range}${points}`;
};
const vehicleLabel = (record: DemoRecord) => record.vehicleClass === 'car' ? 'Ô tô' : record.vehicleClass === 'motorbike' ? 'Xe máy' : '—';
const statusClass = (status: string) => `submit-status submit-status-${violationStatusTone(status)}`;

function StatusBadge({ status }: { status: string }) {
  return <span className={statusClass(status)}>{violationStatusLabel(status)}</span>;
}

function LandingBack() {
  return <a className="submit-back" href="/">← Về trang chọn lối vào</a>;
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
      <span className={`submit-source submit-source-${shownSource}`}>{shownSource === 'live' ? 'Trực tiếp' : shownSource === 'sample' ? 'Ảnh mẫu' : busy ? 'Đang tải' : 'Mất nguồn'}</span>
      {!missing && <span>{dateLabel(frame.capturedAt)}</span>}
      {camera && <span>{camera.junctionId} · {camera.cameraId}</span>}
    </div>
  </section>;
}

// Banner sự kiện sống từ trạm 3D (kênh BroadcastChannel chỉ truyền tín hiệu): va chạm + khung nhận diện.
function StationEventFeed() {
  const [events, setEvents] = useState<StationEvent[]>([]);
  useEffect(() => subscribeStationEvents(event => {
    setEvents(current => {
      // Mỗi nút chỉ giữ sự kiện va chạm mới nhất; khung nhận diện giữ tối đa 6 dòng.
      const next = [event, ...current.filter(item => !(event.type === 'incident' && item.type === 'incident' && item.node === event.node))];
      return next.slice(0, 6);
    });
  }), []);
  if (!events.length) return null;
  const incidents = events.filter((item): item is Extract<StationEvent, { type: 'incident' }> => item.type === 'incident');
  const violations = events.filter((item): item is Extract<StationEvent, { type: 'violation' }> => item.type === 'violation');
  return <div className="submit-events" role="status" aria-live="polite">
    {incidents.map((incident, index) => <p key={`${incident.node}-${index}`} className={`submit-event-incident submit-event-incident-${incident.status}`}>
      {incident.status === 'before' ? 'Va chạm hai xe' : 'Đã điều tiết'} tại nút {incident.node} · {incident.lane}
      {incident.status === 'before' ? ` · phương án: ${incident.plan}` : ' · dòng xe đã chuyển hướng theo phương án'}
    </p>)}
    {violations.map((violation, index) => <p key={`${violation.plate}-${index}`} className="submit-event-violation">
      Khung nhận diện tự động: {violation.label} · {violation.cameraId} · {violation.plate}
      {violation.confidence != null ? ` · độ tin cậy ${Math.round(violation.confidence * 100)}%` : ''}
    </p>)}
  </div>;
}

const DECISIONS: { action: DemoDecisionAction; label: string; title: string }[] = [
  { action: 'confirm', label: 'Duyệt', title: 'Xác nhận vi phạm, hồ sơ chuyển Đã xác nhận' },
  { action: 'needs_review', label: 'Cần xác minh', title: 'Chuyển hồ sơ về hàng chờ cán bộ xem xét' },
  { action: 'dismiss', label: 'Gỡ', title: 'Gỡ hồ sơ (kèm ghi chú cho nhật ký)' },
];

function RecordsTable({ records, busy, onDecision }: {
  records: DemoRecord[];
  busy: boolean;
  onDecision: (plate: string, action: DemoDecisionAction, note: string) => Promise<boolean>;
}) {
  const [openPlate, setOpenPlate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DemoRecordDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!openPlate) { setDetail(null); return; }
    let cancelled = false;
    setDetailBusy(true);
    getRecordDetail(openPlate)
      .then(result => { if (!cancelled) setDetail(result); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailBusy(false); });
    return () => { cancelled = true; };
  }, [openPlate]);

  if (!records.length) {
    return <p className="submit-empty" role="status">{busy ? 'Đang tải hồ sơ…' : 'Chưa có hồ sơ trong phiên này.'}</p>;
  }
  return <div className="submit-records-table" role="region" aria-label="Hồ sơ vi phạm">
    <table className="submit-record-table">
      <thead>
        <tr><th scope="col">Biển số</th><th scope="col">Lỗi</th><th scope="col">Loại xe</th><th scope="col">Nút</th><th scope="col">Giờ ghi nhận</th><th scope="col">Trạng thái</th><th scope="col">Mức phạt</th><th scope="col" aria-label="Xử lý">Xử lý</th></tr>
      </thead>
      <tbody>
        {records.map(record => {
          const open = openPlate === record.plate;
          return <>
            <tr key={record.plate} className={open ? 'submit-record-row submit-record-row-open' : 'submit-record-row'} data-record-plate={record.plate}>
              <th scope="row"><button type="button" className="submit-record-plate" aria-expanded={open} onClick={() => setOpenPlate(open ? null : record.plate)}>{record.plate}</button></th>
              <td>{record.violationLabel ?? record.summary}</td>
              <td>{vehicleLabel(record)}</td>
              <td>{record.junctionId ?? '—'}</td>
              <td>{dateTimeLabel(record.occurredAt ?? null)}</td>
              <td><StatusBadge status={record.status} />{record.priorityFlag && <span className="submit-record-priority">Nghi nhường xe ưu tiên</span>}</td>
              <td title={record.penaltySource ?? undefined}>{penaltyLabel(record)}</td>
              <td>
                <span className="submit-record-actions">
                  {DECISIONS.map(item => <button key={item.action} type="button" className="submit-secondary" title={item.title}
                    disabled={busy || record.status === 'disputed'}
                    onClick={() => { setNote(''); void onDecision(record.plate, item.action, note); }}>
                    {item.label}
                  </button>)}
                </span>
              </td>
            </tr>
            {open && <tr key={`${record.plate}-detail`} className="submit-record-detail-row">
              <td colSpan={8}>
                <div className="submit-evidence" aria-busy={detailBusy}>
                  {detailBusy && <p className="submit-empty">Đang tải bằng chứng…</p>}
                  {!detailBusy && detail && <>
                    <div className="submit-evidence-photos">
                      {detail.evidence.map(item => <figure key={item.kind}>
                        <img src={item.url} alt={`${evidenceKindLabel(item.kind)} · hồ sơ ${record.plate}`} loading="lazy" />
                        <figcaption>{evidenceKindLabel(item.kind)}</figcaption>
                      </figure>)}
                    </div>
                    <p className="submit-evidence-note">Căn cứ xử phạt: {record.penaltySource ?? 'chưa có trong dữ liệu'}</p>
                    {record.priorityReason && <p className="submit-evidence-note">Ghi chú: {record.priorityReason}</p>}
                  </>}
                  {!detailBusy && !detail && <p className="submit-empty">Không tải được bằng chứng của hồ sơ này.</p>}
                </div>
              </td>
            </tr>}
          </>;
        })}
      </tbody>
    </table>
  </div>;
}

export function OfficerSubmitDemo() {
  const [snapshot, setSnapshot] = useState<DemoOfficerSnapshot | null>(null);
  const [selected, setSelected] = useState<DemoCamera | null>(null);
  const [frame, setFrame] = useState<DemoCameraFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [decisionError, setDecisionError] = useState('');
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
      setError(err instanceof DemoApiError ? err.message : 'Không tải được dữ liệu phiên. Thử lại sau.');
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

  const decide = async (plate: string, action: DemoDecisionAction, note: string) => {
    setDecisionError('');
    try {
      await postDecision(plate, action, note);
      const result = await getOfficerSnapshot();
      setSnapshot(result);
      return true;
    } catch (err) {
      setDecisionError(err instanceof DemoApiError ? err.message : 'Không ghi được quyết định. Thử lại.');
      return false;
    }
  };

  const pickCamera = (camera: DemoCamera | null) => {
    // Trạm 3D cùng origin nghe kênh này để đẩy khung đúng camera đang xem.
    try {
      const channel = new BroadcastChannel('smtf-submit-camera');
      channel.postMessage({ type: 'camera', cameraId: camera?.cameraId, junctionId: camera?.junctionId });
      channel.close();
    } catch { /* Trình duyệt không hỗ trợ: giữ nguyên luồng web. */ }
  };

  return <main className="submit-shell">
    <header className="submit-header"><a className="submit-wordmark" href="/">SMTF <span>SAIGON · ĐIỀU HÀNH</span></a><LandingBack /></header>
    <div className="submit-title"><p className="submit-eyebrow">TRUNG TÂM ĐIỀU HÀNH · KHU BẮC</p><h1>Trung tâm điều hành</h1><p>Một phiên xem tạm thời. Dữ liệu và quyền truy cập được cấp cho phiên này.</p></div>
    {!started ? <section className="submit-entry-callout"><p>Một phiên tạm thời để xem chỉ số, hồ sơ vi phạm và camera. Không cần tạo tài khoản.</p><button type="button" onClick={() => void load()} disabled={busy}>Vào trung tâm điều hành</button></section> : error ? <section className="submit-error" role="alert"><strong>Chưa mở được trung tâm điều hành</strong><p>{error}</p><button type="button" onClick={() => void load()} disabled={busy}>{busy ? 'Đang thử…' : 'Thử tải lại'}</button></section> : <>
      <StationEventFeed />
      <section className="submit-kpis" aria-label="Chỉ số giao thông">
        <Kpi label="Nguồn chỉ số" value={snapshot?.kpi.source === 'live' ? 'Trực tiếp' : snapshot?.kpi.source === 'sample' ? 'Dữ liệu mẫu' : busy ? 'Đang tải…' : 'Chưa có'} />
        <Kpi label="Chờ trung bình" value={snapshot ? `${snapshot.kpi.wait_avg_s} giây` : '—'} />
        <Kpi label="Hàng chờ lớn nhất" value={snapshot ? `${snapshot.kpi.queue_max} xe` : '—'} />
        <Kpi label="Lưu lượng mỗi nút" value={snapshot ? `${snapshot.kpi.flow_per_node_min} xe/phút` : '—'} />
      </section>
      <section className="submit-dashboard">
        <div className="submit-camera-column"><label className="submit-select-label" htmlFor="submit-camera-select">Chọn camera
          <select id="submit-camera-select" value={selected?.cameraId ?? ''} onChange={event => {
            const next = snapshot?.cameras.find(item => item.cameraId === event.target.value) ?? null;
            epoch.current.cancel(); cameraRequest.current?.abort(); setFrame(null); setCameraBusy(true); setCameraError(''); setSelected(next); pickCamera(next);
          }} disabled={busy || !snapshot?.cameras.length}>
            {(snapshot?.cameras ?? []).map(camera => <option key={camera.cameraId} value={camera.cameraId}>{camera.label} · {camera.junctionId}</option>)}
          </select></label>
          <MediaFrame key={selected?.cameraId} camera={selected} frame={frame} busy={cameraBusy} error={cameraError}
            onRetry={() => selected ? setCameraRetry(value => value + 1) : void load()} />
        </div>
        <section className="submit-records"><div className="submit-section-head"><div><p className="submit-eyebrow">HỒ SƠ VI PHẠM</p><h2>Hồ sơ cần xử lý</h2></div><span>{snapshot?.records.length ?? '—'} hồ sơ</span></div>
          {decisionError && <p className="submit-error" role="alert">{decisionError}</p>}
          <RecordsTable records={snapshot?.records ?? []} busy={busy} onDecision={decide} />
        </section>
      </section>
    </>}
  </main>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="submit-kpi"><span>{label}</span><strong>{value}</strong></div>;
}

const COMPLAINT_OPTIONS: { kind: DemoComplaintKind; label: string }[] = [
  { kind: 'priority_yield', label: 'Tôi đã nhường đường cho xe ưu tiên' },
  { kind: 'wrong_plate', label: 'Biển số không phải của tôi' },
  { kind: 'other', label: 'Lý do khác' },
];

const AUDIT_LABELS: Record<string, string> = {
  confirm: 'Cán bộ xác nhận vi phạm',
  dismiss: 'Cán bộ gỡ hồ sơ',
  needs_review: 'Chuyển về hàng chờ xác minh',
  complaint: 'Người dân gửi khiếu nại',
};

function RecordTimeline({ timeline }: { timeline: DemoTimeline }) {
  const items: { at: string; label: string; note?: string | null }[] = [];
  if (timeline.occurredAt) items.push({ at: timeline.occurredAt, label: 'Hệ thống ghi nhận vi phạm' });
  for (const entry of timeline.audit) {
    items.push({ at: entry.at, label: AUDIT_LABELS[entry.action] ?? entry.action, note: entry.note });
  }
  for (const complaint of timeline.complaints) {
    items.push({ at: complaint.created_at, label: `Khiếu nại · ${complaintKindLabel(complaint.kind)} · ${complaint.status === 'open' ? 'đang chờ xử lý' : complaint.status === 'accepted' ? 'được chấp nhận' : 'chưa được chấp nhận'}`, note: complaint.note });
  }
  if (!items.length) return <p className="submit-empty">Chưa có dòng thời gian cho hồ sơ này.</p>;
  return <ol className="submit-timeline" aria-label="Dòng thời gian hồ sơ">
    {items.map((item, index) => <li key={index}>
      <span className="submit-timeline-time">{dateTimeLabel(item.at)}</span>
      <span className="submit-timeline-label">{item.label}{item.note ? <small> · {item.note}</small> : null}</span>
    </li>)}
  </ol>;
}

function CitizenRecord({ plate, onDisputed }: { plate: string; onDisputed: () => void }) {
  const [detail, setDetail] = useState<DemoRecordDetail | null>(null);
  const [timeline, setTimeline] = useState<DemoTimeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintKind, setComplaintKind] = useState<DemoComplaintKind>('priority_yield');
  const [complaintNote, setComplaintNote] = useState('');
  const [complaintBusy, setComplaintBusy] = useState(false);
  const [complaintError, setComplaintError] = useState('');

  const reload = async () => {
    setBusy(true); setError('');
    try {
      const [record, recordTimeline] = await Promise.all([getRecordDetail(plate), getTimeline(plate)]);
      setDetail(record);
      setTimeline(recordTimeline);
    } catch (err) {
      setError(err instanceof DemoApiError ? err.message : 'Không tải được hồ sơ. Thử lại sau.');
    } finally { setBusy(false); }
  };
  useEffect(() => { void reload(); }, [plate]);

  const sendComplaint = async (event: FormEvent) => {
    event.preventDefault();
    setComplaintBusy(true); setComplaintError('');
    try {
      await postComplaint(plate, complaintKind, complaintNote);
      setComplaintOpen(false);
      await reload();
      onDisputed();
    } catch (err) {
      setComplaintError(err instanceof DemoApiError ? err.message : 'Không gửi được khiếu nại. Thử lại.');
    } finally { setComplaintBusy(false); }
  };

  if (busy && !detail) return <p className="submit-empty" role="status">Đang tải hồ sơ…</p>;
  if (error) return <p className="submit-error" role="alert">{error}</p>;
  if (!detail) return null;
  return <article className="submit-record-detail" aria-label={`Hồ sơ ${plate}`}>
    <header className="submit-record-detail-head">
      <h3>{detail.plate}</h3>
      <span>{vehicleLabel(detail)}</span>
      <StatusBadge status={detail.status} />
    </header>
    <p className="submit-record-summary">{detail.violationLabel ?? detail.summary}{detail.direction ? ` · ${detail.direction}` : ''}{detail.junctionId ? ` · nút ${detail.junctionId}` : ''}</p>
    <div className="submit-evidence-photos">
      {detail.evidence.map(item => <figure key={item.kind}>
        <img src={item.url} alt={`${evidenceKindLabel(item.kind)} · hồ sơ ${plate}`} loading="lazy" />
        <figcaption>{evidenceKindLabel(item.kind)}</figcaption>
      </figure>)}
    </div>
    <p className="submit-penalty">Mức phạt: <strong>{penaltyLabel(detail)}</strong>{detail.penaltySource ? <small>Căn cứ: {detail.penaltySource}</small> : null}</p>
    {detail.priorityFlag && <p className="submit-record-priority">{detail.priorityReason ?? 'Nghi nhường xe ưu tiên — chờ cán bộ xem xét'}</p>}
    {timeline && <RecordTimeline timeline={timeline} />}
    {detail.status === 'disputed'
      ? <p className="submit-lookup-message">Hồ sơ đang khiếu nại. Theo dõi dòng thời gian để xem tiến trình xử lý.</p>
      : complaintOpen ? <form className="submit-complaint-form" onSubmit={event => void sendComplaint(event)}>
          <label htmlFor="submit-complaint-kind">Lý do khiếu nại</label>
          <select id="submit-complaint-kind" value={complaintKind} onChange={event => setComplaintKind(event.target.value as DemoComplaintKind)}>
            {COMPLAINT_OPTIONS.map(option => <option key={option.kind} value={option.kind}>{option.label}</option>)}
          </select>
          <label htmlFor="submit-complaint-note">Ghi chú thêm</label>
          <textarea id="submit-complaint-note" rows={3} value={complaintNote} onChange={event => setComplaintNote(event.target.value)} placeholder="Thời gian, hoàn cảnh (không bắt buộc)" />
          {complaintError && <p className="submit-error" role="alert">{complaintError}</p>}
          <div className="submit-complaint-actions">
            <button type="submit" disabled={complaintBusy}>{complaintBusy ? 'Đang gửi…' : 'Gửi khiếu nại'}</button>
            <button type="button" className="submit-secondary" onClick={() => setComplaintOpen(false)}>Đóng</button>
          </div>
        </form>
      : <button type="button" className="submit-secondary" onClick={() => setComplaintOpen(true)}>Khiếu nại</button>}
  </article>;
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
      setMessage(value.records.length ? `${value.records.length} hồ sơ được tìm thấy.` : 'Biển số hợp lệ, chưa có hồ sơ trong dữ liệu hiện có.');
    } catch (err) {
      setError(err instanceof DemoApiError ? err.message : 'Không kết nối được dịch vụ tra cứu. Thử lại sau.');
    } finally { setBusy(false); }
  };
  return <main className="submit-shell submit-lookup-shell">
    <header className="submit-header"><a className="submit-wordmark" href="/">SMTF <span>SAIGON · TRA CỨU</span></a><LandingBack /></header>
    <div className="submit-lookup">
      <p className="submit-eyebrow">TRA CỨU CÔNG KHAI · KHÔNG CẦN ĐĂNG NHẬP</p><h1>Tra cứu biển số.</h1>
      <p>Tìm hồ sơ mẫu từ cùng nguồn dữ liệu với trang điều hành.</p>
      <form className="submit-lookup-form" onSubmit={event => void lookup(event)}>
        <label htmlFor="submit-plate">Biển số xe</label><div className="submit-lookup-input"><input id="submit-plate" value={plate} onChange={event => setPlate(event.target.value.toUpperCase())} placeholder="Ví dụ: 51K-123.45" autoComplete="off" spellCheck={false} readOnly={busy} aria-describedby="submit-plate-hint" />
          <button type="submit" disabled={busy}>{busy ? 'Đang tra cứu…' : 'Tra cứu biển số'}</button></div>
        <span id="submit-plate-hint">Nhập có dấu phân cách hoặc viết liền.</span>
      </form>
      <div className="submit-sample-plates" aria-label="Biển số mẫu để thử"><span>Thử biển mẫu</span>{['51K-123.45', '51K12345', '51K-987.65'].map(item => <button key={item} type="button" disabled={busy} onClick={() => { setPlate(item); setError(''); setMessage(''); setResult(null); }}>{item}</button>)}</div>
      {error && <p className="submit-error" role="alert">{error}</p>}{message && <p className="submit-lookup-message" role="status">{message}</p>}
      {!!result?.records.length && <section className="submit-lookup-results" aria-label="Kết quả tra cứu">
        {result.records.map((record, index) => <CitizenRecord key={`${record.plate}-${index}`} plate={record.plate} onDisputed={() => setMessage('Đã gửi khiếu nại. Hồ sơ chuyển sang trạng thái đang khiếu nại.')} />)}
      </section>}
    </div>
  </main>;
}
