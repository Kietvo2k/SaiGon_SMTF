import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  DemoApiError, DemoDecisionAction, DemoRecord, DemoRecordDetail, DemoTimeline,
  getRecordDetail, getTimeline,
} from '../api';
import { complaintKindLabel, evidenceKindLabel, violationStatusLabel, violationStatusTone } from '../../../lib/labels';
import {
  buildLabelMaps, filterRecords, formatDateTime, formatRelativeTime, openRecordCount, paginateRecords,
  sortRecords, statusCounts, SORT_OPTIONS, type DemoNodeMapEntry, type RecordSort,
} from './ops-model';
import type { DemoCamera } from '../api';

export interface DecisionResult { ok: boolean; status?: string; message?: string }

const money = new Intl.NumberFormat('vi-VN');
const penaltyRange = (record: DemoRecord): string => {
  const min = record.penaltyAmountMin ?? record.penaltyAmountMax;
  const max = record.penaltyAmountMax ?? record.penaltyAmountMin;
  if (min == null || max == null) return '—';
  return min === max ? `${money.format(min)} đồng` : `${money.format(min)} – ${money.format(max)} đồng`;
};
const vehicleText = (record: DemoRecord): string => record.vehicleClass === 'car' ? 'Ô tô' : record.vehicleClass === 'motorbike' ? 'Xe máy' : '—';

function OpsStatusBadge({ status }: { status: string }) {
  return <span className={`ops-status ops-status-${violationStatusTone(status)}`}>{violationStatusLabel(status)}</span>;
}

const AUDIT_LABELS: Record<string, string> = {
  confirm: 'Cán bộ xác nhận vi phạm',
  dismiss: 'Cán bộ gỡ hồ sơ',
  needs_review: 'Chuyển về hàng chờ xác minh',
  complaint: 'Người dân gửi khiếu nại',
};

const COMPLAINT_STATUS: Record<string, string> = {
  open: 'đang chờ xử lý', accepted: 'được chấp nhận', rejected: 'chưa được chấp nhận', resolved: 'đã xử lý',
};

const DECISION_META: { action: DemoDecisionAction; label: string; title: string; className: string }[] = [
  { action: 'confirm', label: 'Duyệt hồ sơ', title: 'Xác nhận vi phạm, hồ sơ chuyển sang Đã xác nhận', className: 'ops-button-primary' },
  { action: 'needs_review', label: 'Cần xác minh', title: 'Chuyển hồ sơ về hàng chờ cán bộ xem xét', className: '' },
  { action: 'dismiss', label: 'Gỡ hồ sơ', title: 'Gỡ hồ sơ, ghi lý do vào nhật ký nếu có', className: 'ops-button-danger' },
];

function SkeletonRows({ count = 5 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, index) => <tr key={index} className="ops-skeleton-row" aria-hidden="true">
    <td><span className="ops-skeleton ops-skeleton-text" /></td>
    <td><span className="ops-skeleton ops-skeleton-text" /></td>
    <td><span className="ops-skeleton ops-skeleton-short" /></td>
    <td><span className="ops-skeleton ops-skeleton-short" /></td>
    <td><span className="ops-skeleton ops-skeleton-tag" /></td>
    <td><span className="ops-skeleton ops-skeleton-short" /></td>
    <td><span className="ops-skeleton ops-skeleton-short" /></td>
  </tr>)}</>;
}

function EvidenceFigure({ plate, kind, url }: { plate: string; kind: string; url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <figure className="ops-evidence-item">
    {failed
      ? <div className="ops-evidence-failed" role="status">Không tải được ảnh<br /><small>{evidenceKindLabel(kind)}</small></div>
      : <img src={url} alt={`${evidenceKindLabel(kind)} · hồ sơ ${plate}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    <figcaption>{evidenceKindLabel(kind)}</figcaption>
  </figure>;
}

function RecordTimeline({ detail, timeline, error, onRetry }: {
  detail: DemoRecordDetail;
  timeline: DemoTimeline | null;
  error: string;
  onRetry: () => void;
}) {
  const items = useMemo(() => {
    const next: { at: string; title: string; note?: string | null }[] = [];
    if (detail.occurredAt) next.push({ at: detail.occurredAt, title: 'Hệ thống ghi nhận vi phạm' });
    for (const entry of timeline?.audit ?? []) next.push({ at: entry.at, title: AUDIT_LABELS[entry.action] ?? entry.action, note: entry.note });
    for (const complaint of timeline?.complaints ?? []) {
      next.push({
        at: complaint.created_at,
        title: `Khiếu nại · ${complaintKindLabel(complaint.kind)} · ${COMPLAINT_STATUS[complaint.status] ?? complaint.status}`,
        note: complaint.note,
      });
    }
    return next.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  }, [detail.occurredAt, timeline]);

  if (error) return <div className="ops-inline-error" role="alert"><p>{error}</p><button type="button" className="ops-button ops-button-small" onClick={onRetry}>Tải lại dòng thời gian</button></div>;
  if (!timeline) return <p className="ops-muted" role="status">Đang tải dòng thời gian…</p>;
  if (!items.length) return <p className="ops-muted">Chưa có dòng thời gian cho hồ sơ này.</p>;
  return <ol className="ops-timeline" aria-label="Dòng thời gian hồ sơ">
    {items.map((item, index) => <li key={`${item.at}-${index}`}>
      <time dateTime={item.at}>{formatDateTime(item.at)}</time>
      <div><b>{item.title}</b>{item.note && <small>{item.note}</small>}</div>
    </li>)}
  </ol>;
}

function RecordDrawer({ plate, decisionBusy, onClose, onDecide }: {
  plate: string | null;
  decisionBusy: boolean;
  onClose: () => void;
  onDecide: (plate: string, action: DemoDecisionAction, note: string) => Promise<DecisionResult>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [detail, setDetail] = useState<DemoRecordDetail | null>(null);
  const [timeline, setTimeline] = useState<DemoTimeline | null>(null);
  const [timelineError, setTimelineError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [success, setSuccess] = useState('');
  const safeId = plate ? plate.replace(/[^a-z0-9]/gi, '-') : 'record';
  const busy = submitting || decisionBusy;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (plate && !dialog.open) {
      try { dialog.showModal(); } catch { /* dialog đã mở hoặc trình duyệt không hỗ trợ */ }
    }
    if (!plate && dialog.open) dialog.close();
  }, [plate]);

  useEffect(() => {
    if (!plate) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [plate]);

  useEffect(() => {
    setNote('');
    setDecisionError('');
    setSuccess('');
    setDetail(null);
    setTimeline(null);
    setError('');
    setTimelineError('');
  }, [plate]);

  useEffect(() => {
    if (!plate) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');
    setTimelineError('');
    Promise.allSettled([getRecordDetail(plate, fetch, controller.signal), getTimeline(plate, fetch, controller.signal)])
      .then(([recordResult, timelineResult]) => {
        if (cancelled) return;
        if (recordResult.status === 'fulfilled') setDetail(recordResult.value);
        else setError(recordResult.reason instanceof DemoApiError ? recordResult.reason.message : 'Không tải được chi tiết hồ sơ. Thử lại.');
        if (timelineResult.status === 'fulfilled') setTimeline(timelineResult.value);
        else setTimelineError(timelineResult.reason instanceof DemoApiError ? timelineResult.reason.message : 'Không tải được dòng thời gian.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [plate, reloadKey]);

  const decide = async (action: DemoDecisionAction) => {
    if (!plate || submittingRef.current || decisionBusy || detail?.status === 'disputed') return;
    submittingRef.current = true;
    setSubmitting(true);
    setDecisionError('');
    setSuccess('');
    try {
      const result = await onDecide(plate, action, note);
      if (result.ok) {
        setSuccess(`Đã ghi quyết định${result.status ? ` · trạng thái mới: ${violationStatusLabel(result.status)}` : ''}.`);
        setNote('');
        setReloadKey(value => value + 1);
      } else {
        setDecisionError(result.message ?? 'Không ghi được quyết định. Thử lại.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const submitGuard = (event: FormEvent) => event.preventDefault();

  // Chromium có thể đưa focus ra <body> khi Tab hết vòng trong dialog; tự kẹp vòng focus.
  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter(element => !element.hasAttribute('hidden'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return <dialog ref={dialogRef} className="ops-drawer" aria-modal="true" aria-labelledby={`ops-drawer-title-${safeId}`} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onKeyDown={trapFocus}>
    {plate && <div className="ops-drawer-inner">
      <header className="ops-drawer-head">
        <div>
          <p className="ops-eyebrow">HỒ SƠ VI PHẠM</p>
          <h2 id={`ops-drawer-title-${safeId}`}>{plate}</h2>
          {detail && <p className="ops-drawer-sub">{vehicleText(detail)} · {detail.violationLabel ?? detail.summary}{detail.junctionId ? ` · ${detail.junctionId}` : ''}</p>}
        </div>
        <button type="button" className="ops-drawer-close" onClick={onClose} aria-label="Đóng hồ sơ">Đóng</button>
      </header>

      <div className="ops-drawer-body">
        {loading && !detail && <div className="ops-drawer-skeleton" role="status"><span className="ops-skeleton ops-skeleton-title" /><span className="ops-skeleton ops-skeleton-text" /><span className="ops-skeleton ops-skeleton-block" /><span className="ops-skeleton ops-skeleton-text" /></div>}
        {error && <div className="ops-inline-error" role="alert"><p>{error}</p><button type="button" className="ops-button ops-button-small" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button></div>}
        {!loading && !error && !detail && <p className="ops-muted" role="status">Không có dữ liệu chi tiết cho hồ sơ này.</p>}

        {detail && <>
          <div className="ops-drawer-status"><OpsStatusBadge status={detail.status} />{detail.priorityFlag && <span className="ops-priority-flag">Nghi nhường xe ưu tiên</span>}</div>
          <p className="ops-drawer-summary">{detail.summary}{detail.direction ? ` · ${detail.direction}` : ''}</p>

          <dl className="ops-facts">
            <div><dt>Mức phạt</dt><dd>{penaltyRange(detail)}</dd></div>
            <div><dt>Điểm trừ GPLX</dt><dd>{detail.penaltyPoints ? `${detail.penaltyPoints} điểm` : 'Không có'}</dd></div>
            <div><dt>Nơi ghi nhận</dt><dd>{detail.junctionId ?? '—'}<small>{detail.cameraId ?? 'Camera đang cập nhật'}</small></dd></div>
            <div><dt>Thời điểm</dt><dd>{formatDateTime(detail.occurredAt)}<small>{detail.occurredAt ? formatRelativeTime(detail.occurredAt) : ''}</small></dd></div>
            <div><dt>Loại xe</dt><dd>{vehicleText(detail)}</dd></div>
            <div><dt>Mã lỗi</dt><dd>{detail.code ?? '—'}</dd></div>
          </dl>

          <section className="ops-drawer-section" aria-labelledby={`ops-evidence-title-${safeId}`}>
            <h3 id={`ops-evidence-title-${safeId}`}>Bằng chứng hình ảnh</h3>
            {detail.evidence.length
              ? <div className="ops-evidence-grid">{detail.evidence.map(item => <EvidenceFigure key={item.kind} plate={plate} kind={item.kind} url={item.url} />)}</div>
              : <p className="ops-muted">Hồ sơ này chưa có ảnh bằng chứng trong nguồn dữ liệu.</p>}
          </section>

          <div className="ops-penalty-note">
            <span>Căn cứ xử phạt</span>
            <b>{detail.penaltySource ?? 'Chưa có trong dữ liệu'}</b>
            <small>{penaltyRange(detail)}{detail.penaltyPoints ? ` · trừ ${detail.penaltyPoints} điểm GPLX` : ''}</small>
          </div>

          {detail.priorityReason && <p className="ops-priority-note">{detail.priorityReason}</p>}

          <section className="ops-drawer-section" aria-labelledby={`ops-timeline-title-${safeId}`}>
            <h3 id={`ops-timeline-title-${safeId}`}>Dòng thời gian</h3>
            <RecordTimeline detail={detail} timeline={timeline} error={timelineError} onRetry={() => setReloadKey(value => value + 1)} />
          </section>
        </>}
      </div>

      {detail && <form className="ops-decision" onSubmit={submitGuard} aria-busy={busy}>
        <div className="ops-decision-head">
          <div><p className="ops-eyebrow">QUYẾT ĐỊNH</p><h3>Ghi quyết định xử lý</h3></div>
          <span className="ops-note-count">{note.length}/500</span>
        </div>
        <label htmlFor={`ops-note-${safeId}`}>Ghi chú <span>(không bắt buộc, lưu vào nhật ký)</span></label>
        <textarea id={`ops-note-${safeId}`} rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)}
          placeholder="Lý do duyệt, cần xác minh hoặc gỡ hồ sơ…" disabled={busy} aria-describedby={`ops-decision-hint-${safeId}`} />
        {detail.status === 'disputed' && <p className="ops-inline-warning" id={`ops-decision-status-${safeId}`}>Hồ sơ đang khiếu nại. API hiện hành yêu cầu xử lý khiếu nại trước; các nút quyết định bị khoá.</p>}
        {decisionError && <p className="ops-inline-error" role="alert">{decisionError}</p>}
        {success && <p className="ops-inline-success" role="status">{success}</p>}
        <div className="ops-decision-actions">
          {DECISION_META.map(item => <button key={item.action} type="button" className={`ops-button ${item.className}`} title={item.title}
            disabled={busy || detail.status === 'disputed'} onClick={() => void decide(item.action)}>
            {busy ? 'Đang ghi…' : item.label}
          </button>)}
        </div>
        <p className="ops-decision-hint" id={`ops-decision-hint-${safeId}`}>Một quyết định mỗi lần gửi. Ghi chú và trạng thái mới được lưu cùng nhật ký qua API hiện có.</p>
      </form>}
    </div>}
  </dialog>;
}

export function ViolationDesk({ records, loading, cameras, nodes, decisionBusy, onDecide, children }: {
  records: DemoRecord[];
  loading: boolean;
  cameras: DemoCamera[];
  nodes: DemoNodeMapEntry[] | null;
  decisionBusy: boolean;
  onDecide: (plate: string, action: DemoDecisionAction, note: string) => Promise<DecisionResult>;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<RecordSort>('status');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [openPlate, setOpenPlate] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const maps = useMemo(() => buildLabelMaps(cameras, nodes), [cameras, nodes]);
  const counts = useMemo(() => statusCounts(records), [records]);
  const filtered = useMemo(() => sortRecords(filterRecords(records, query, status, maps), sort), [records, query, status, sort, maps]);
  const paged = useMemo(() => paginateRecords(filtered, page, pageSize), [filtered, page, pageSize]);
  const openCount = openRecordCount(records);

  useEffect(() => { setPage(1); }, [query, status, sort, pageSize]);
  useEffect(() => { if (page !== paged.page) setPage(paged.page); }, [page, paged.page]);

  const resetFilters = () => { setQuery(''); setStatus('all'); setSort('status'); setPage(1); };

  const openRecord = (plate: string, button: HTMLButtonElement | null) => {
    triggerRef.current = button;
    setOpenPlate(plate);
  };
  const closeRecord = () => {
    setOpenPlate(null);
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    });
  };

  return <section className="ops-panel ops-desk" aria-labelledby="ops-desk-title">
    <header className="ops-panel-head ops-desk-head">
      <div>
        <p className="ops-eyebrow">HỒ SƠ VI PHẠM</p>
        <h2 id="ops-desk-title">Bàn xử lý hồ sơ</h2>
        <p className="ops-desk-sub">{records.length} hồ sơ trong nguồn · <b>{openCount}</b> cần xử lý</p>
      </div>
      <div className="ops-desk-summary">{children}</div>
    </header>

    <div className="ops-desk-toolbar">
      <label className="ops-field ops-field-search">Tìm hồ sơ
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Biển số, nút giao, camera…" autoComplete="off" spellCheck={false} />
      </label>
      <label className="ops-field">Sắp xếp
        <select value={sort} onChange={event => setSort(event.target.value as RecordSort)}>
          {SORT_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="ops-field ops-field-size">Số dòng
        <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
          {[6, 10, 20].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" className="ops-chip ops-desk-reset" onClick={resetFilters} disabled={!query && status === 'all' && sort === 'status'}>Xoá lọc</button>
    </div>

    <div className="ops-status-filter" role="group" aria-label="Lọc theo trạng thái hồ sơ">
      <button type="button" className={`ops-chip${status === 'all' ? ' is-active' : ''}`} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>Tất cả <span>{records.length}</span></button>
      {counts.map(item => item.count > 0 && <button key={item.status} type="button" className={`ops-chip${status === item.status ? ' is-active' : ''}`} aria-pressed={status === item.status} onClick={() => setStatus(item.status)}>
        {violationStatusLabel(item.status)} <span>{item.count}</span>
      </button>)}
    </div>

    <p className="ops-result-count" aria-live="polite">{filtered.length ? `${paged.from}–${paged.to} / ${filtered.length} hồ sơ` : '0 hồ sơ khớp bộ lọc'}</p>

    <div className="ops-table-wrap">
      <table className="ops-table" aria-busy={loading && !records.length}>
        <caption className="ops-sr-only">Danh sách hồ sơ vi phạm, bấm vào biển số hoặc nút mở hồ sơ để xem chi tiết</caption>
        <thead><tr><th scope="col">Biển số</th><th scope="col">Vi phạm</th><th scope="col">Nút</th><th scope="col">Thời gian</th><th scope="col">Trạng thái</th><th scope="col">Mức phạt</th><th scope="col"><span className="ops-sr-only">Mở hồ sơ</span></th></tr></thead>
        <tbody>
          {loading && !records.length && <SkeletonRows />}
          {paged.items.map(record => <tr key={record.plate} data-record-plate={record.plate}>
            <th scope="row" data-label="Biển số">
              <button type="button" className="ops-plate-link" aria-haspopup="dialog" aria-expanded={openPlate === record.plate}
                onClick={event => openRecord(record.plate, event.currentTarget)}>{record.plate}</button>
            </th>
            <td data-label="Vi phạm"><span className="ops-cell-main">{record.violationLabel ?? record.summary}</span><small>{record.direction ?? record.cameraId ?? ''}</small>{record.priorityFlag && <span className="ops-priority-flag">Nghi nhường ưu tiên</span>}</td>
            <td data-label="Nút">{record.junctionId ?? '—'}</td>
            <td data-label="Thời gian"><span className="ops-cell-main">{formatDateTime(record.occurredAt)}</span><small>{formatRelativeTime(record.occurredAt)}</small></td>
            <td data-label="Trạng thái"><OpsStatusBadge status={record.status} /></td>
            <td data-label="Mức phạt">{penaltyRange(record)}</td>
            <td data-label="Mở hồ sơ"><button type="button" className="ops-button ops-button-small" aria-haspopup="dialog" aria-expanded={openPlate === record.plate}
              onClick={event => openRecord(record.plate, event.currentTarget)}>Mở hồ sơ</button></td>
          </tr>)}
        </tbody>
      </table>
      {!paged.items.length && <div className="ops-empty ops-empty-inline" role="status">
        <strong>{loading ? 'Đang tải hồ sơ…' : records.length ? 'Không có hồ sơ khớp bộ lọc' : 'Chưa có hồ sơ trong phiên này'}</strong>
        <span>{loading ? 'Đang chờ dữ liệu từ API phiên.' : records.length ? 'Thử bỏ từ khoá hoặc chọn trạng thái khác.' : 'API không trả hồ sơ trong phiên này.'}</span>
        {!loading && (query || status !== 'all') && <button type="button" className="ops-button" onClick={resetFilters}>Xoá bộ lọc</button>}
      </div>}
    </div>

    {paged.pages > 1 && <nav className="ops-pagination" aria-label="Phân trang hồ sơ">
      <button type="button" className="ops-button ops-button-small" onClick={() => setPage(1)} disabled={paged.page === 1}>Trang đầu</button>
      <button type="button" className="ops-button ops-button-small" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={paged.page === 1}>Trước</button>
      <span>Trang <b>{paged.page}</b> / {paged.pages}</span>
      <button type="button" className="ops-button ops-button-small" onClick={() => setPage(value => Math.min(paged.pages, value + 1))} disabled={paged.page === paged.pages}>Sau</button>
      <button type="button" className="ops-button ops-button-small" onClick={() => setPage(paged.pages)} disabled={paged.page === paged.pages}>Trang cuối</button>
    </nav>}

    <RecordDrawer plate={openPlate} decisionBusy={decisionBusy} onClose={closeRecord} onDecide={onDecide} />
  </section>;
}
