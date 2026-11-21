import { FormEvent, useEffect, useState } from 'react';
import {
  DemoApiError, DemoComplaintKind, DemoLookup, DemoRecord, DemoRecordDetail, DemoTimeline, getRecordDetail,
  getTimeline, lookupPlate, postComplaint,
} from './api';
import { complaintKindLabel, evidenceKindLabel, violationStatusLabel, violationStatusTone } from '../../lib/labels';

export { isVercelDemoRoute } from './route';

const dateTimeLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : '—';
const penaltyAmountLabel = (record: DemoRecord) => {
  const min = record.penaltyAmountMin ?? record.penaltyAmountMax;
  const max = record.penaltyAmountMax ?? record.penaltyAmountMin;
  const money = new Intl.NumberFormat('vi-VN');
  return min != null && max != null
    ? (min === max ? `${money.format(min)} đồng` : `${money.format(min)} – ${money.format(max)} đồng`)
    : '—';
};
const penaltyLabel = (record: DemoRecord) => {
  const range = penaltyAmountLabel(record);
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

const CASE_STEPS = ['Ghi nhận', 'Xác nhận', 'Thông báo', 'Nộp phạt'];
const CASE_STEP_INDEX: Record<string, number> = { new: 0, pending: 0, needs_review: 0, confirmed: 1, notified: 2, paid: 3, disputed: 1, dismissed: 0 };

function CaseProgress({ status }: { status: string }) {
  const active = CASE_STEP_INDEX[status] ?? 0;
  return <ol className="submit-case-progress" aria-label="Tiến trình hồ sơ">
    {CASE_STEPS.map((label, index) => <li key={label} className={index < active ? 'is-done' : index === active ? 'is-active' : ''}>
      <span aria-hidden="true">{index + 1}</span><b>{label}</b>
    </li>)}
  </ol>;
}

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
    <div className="submit-case-facts">
      <div><span>Mức phạt</span><strong>{penaltyAmountLabel(detail)}</strong></div>
      <div><span>Điểm trừ GPLX</span><strong>{detail.penaltyPoints ? `${detail.penaltyPoints} điểm` : 'Không có'}</strong></div>
      <div><span>Nơi ghi nhận</span><strong>{detail.junctionId ?? '—'}</strong><small>{detail.cameraId ?? 'Camera đang cập nhật'}</small></div>
    </div>
    <div className="submit-evidence-block">
      <p className="submit-evidence-title">Bằng chứng hình ảnh</p>
      {detail.evidence.length
        ? <div className="submit-evidence-photos">
            {detail.evidence.map(item => <figure key={item.kind}>
              <img src={item.url} alt={`${evidenceKindLabel(item.kind)} · hồ sơ ${plate}`} loading="lazy" />
              <figcaption>{evidenceKindLabel(item.kind)}</figcaption>
            </figure>)}
          </div>
        : <p className="submit-empty">Hồ sơ này chưa có ảnh bằng chứng trong nguồn dữ liệu.</p>}
    </div>
    <div className="submit-penalty">
      <span className="submit-penalty-label">Căn cứ xử phạt</span>
      <strong>{detail.penaltySource ?? 'Chưa có trong dữ liệu'}</strong>
      <small>Mức phạt: {penaltyLabel(detail)}</small>
    </div>
    {detail.priorityFlag && <p className="submit-record-priority">{detail.priorityReason ?? 'Nghi nhường xe ưu tiên — chờ cán bộ xem xét'}</p>}
    <CaseProgress status={detail.status} />
    {timeline && <RecordTimeline timeline={timeline} />}
    <div className="submit-complaint-zone">
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
        : <>
            <p className="submit-complaint-hint">Nếu bạn cho rằng hồ sơ ghi nhận chưa đúng, gửi khiếu nại kèm lý do. Cán bộ xử lý sẽ xem lại ảnh và dòng thời gian.</p>
            <button type="button" className="submit-secondary" onClick={() => setComplaintOpen(true)}>Khiếu nại hồ sơ</button>
          </>}
    </div>
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
