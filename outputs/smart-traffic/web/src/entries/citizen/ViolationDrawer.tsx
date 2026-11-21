import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateTime, formatPenalty } from '../../lib/format';
import {
  complaintKindLabel,
  evidenceKindLabel,
  violationStatusLabel,
  violationStatusTone,
} from '../../lib/labels';
import {
  CitizenApiError,
  COMPLAINT_NOTE_MAX,
  complaintNoteError,
  type CitizenDetail,
  type CitizenMode,
  type CitizenRecord,
  loadCitizenDetail,
  sendCitizenComplaint,
} from './citizenApi';
import { EvidenceLightbox } from './EvidenceLightbox';
import { evidenceShortLabel } from './evidenceLabel';
import { AlertIcon, CameraIcon, CheckIcon, CloseIcon, LockIcon } from './icons';
import { PlateChip } from './PlateChip';
import { useDialogFocus } from './useDialogFocus';

type ComplaintKind = 'priority_yield' | 'wrong_plate' | 'other';

const COMPLAINT_OPTIONS: { value: ComplaintKind; hint: string }[] = [
  { value: 'wrong_plate', hint: 'Biển số hoặc ảnh không phải xe của tôi' },
  { value: 'priority_yield', hint: 'Tôi đang nhường đường cho xe ưu tiên' },
  { value: 'other', hint: 'Lý do khác, ghi rõ ở phần ghi chú' },
];

interface Props {
  record: CitizenRecord;
  mode: CitizenMode;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onRequireLogin: () => void;
}

interface Flash {
  ok: boolean;
  text: string;
}

export function ViolationDrawer({ record, mode, onClose, onStatusChange, onRequireLogin }: Props) {
  const titleId = useId();
  const baseId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const flashRef = useRef<HTMLParagraphElement>(null);
  const factsRef = useRef<HTMLHeadingElement>(null);
  const retryFocusRef = useRef(false);
  const busyRef = useRef(false);
  const [detail, setDetail] = useState<CitizenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [kind, setKind] = useState<ComplaintKind>('wrong_plate');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  useDialogFocus(true, onClose, panelRef);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadCitizenDetail(mode, record, controller.signal)
      .then(result => {
        if (!alive) return;
        setDetail(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Chưa tải được chi tiết hồ sơ.');
        setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [mode, record.id, record.plate, reloadKey]);

  useEffect(() => {
    if (!flash) return;
    const frame = requestAnimationFrame(() => flashRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [flash]);

  useEffect(() => {
    if (loading || !detail || !retryFocusRef.current) return;
    retryFocusRef.current = false;
    const frame = requestAnimationFrame(() => factsRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [loading, detail]);

  const current = detail?.record ?? record;
  const tone = violationStatusTone(current.status);
  const canComplain = Boolean(detail?.canComplain) && mode === 'public';
  const disputed = current.status === 'disputed';
  const finished = current.status === 'paid' || current.status === 'dismissed';
  const points = current.penalty.license_deduction_points;
  const evidence = detail?.record.evidence ?? current.evidence;

  const complain = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const problem = complaintNoteError(note);
    if (problem) {
      setNoteError(problem);
      setFlash(null);
      noteRef.current?.focus();
      return;
    }
    setNoteError('');
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    try {
      const result = await sendCitizenComplaint(mode, current.plate, kind, note);
      setFlash({ ok: true, text: result.message });
      setNote('');
      setDetail(previous => previous
        ? { ...previous, record: { ...previous.record, status: result.status }, canComplain: false }
        : previous);
      onStatusChange(result.status);
    } catch (err) {
      const message = err instanceof CitizenApiError
        ? err.message
        : 'Chưa gửi được khiếu nại. Kiểm tra kết nối rồi thử lại.';
      setFlash({ ok: false, text: message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="cz-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="cz-drawer-panel" ref={panelRef}>
        <header className="cz-drawer-head">
          <div className="cz-drawer-identity">
            <PlateChip plate={current.plate} size="md" />
            <div>
              <p className="cz-kicker">Chi tiết vi phạm</p>
              <h2 id={titleId}>{current.label}</h2>
            </div>
          </div>
          <button type="button" className="cz-icon-btn" onClick={onClose} data-autofocus aria-label="Đóng chi tiết vi phạm">
            <CloseIcon />
          </button>
        </header>

        <div className="cz-drawer-body">
          {loading && (
            <div className="cz-drawer-loading" aria-busy="true" aria-label="Đang tải chi tiết hồ sơ">
              <div className="cz-skeleton cz-skeleton-line is-short" />
              <div className="cz-skeleton cz-skeleton-line" />
              <div className="cz-skeleton cz-skeleton-block" />
            </div>
          )}

          {!loading && error && (
            <div className="cz-state cz-state-error" role="alert">
              <AlertIcon />
              <div>
                <h3>Chưa tải được hồ sơ</h3>
                <p>{error}</p>
                <button type="button" className="cz-btn cz-btn-primary" onClick={() => { retryFocusRef.current = true; setReloadKey(key => key + 1); }}>
                  Thử lại
                </button>
              </div>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              <section className="cz-drawer-section" aria-labelledby={`${baseId}-facts`}>
                <div className="cz-drawer-section-head">
                  <h3 id={`${baseId}-facts`} ref={factsRef} tabIndex={-1}>Thông tin hồ sơ</h3>
                  <span className={`cz-status cz-status-${tone}`}>
                    <span className="cz-status-dot" aria-hidden="true" />
                    {violationStatusLabel(current.status)}
                  </span>
                </div>
                <dl className="cz-facts cz-facts-drawer">
                  <div><dt>Mã vi phạm</dt><dd><code>{current.code || '—'}</code></dd></div>
                  <div><dt>Thời gian</dt><dd>{formatDateTime(current.occurredAt)}</dd></div>
                  <div><dt>Nút giao</dt><dd>{current.node || '—'}</dd></div>
                  <div><dt>Hướng / địa điểm</dt><dd>{current.direction || current.place || '—'}</dd></div>
                  <div><dt>Camera</dt><dd>{current.cameraId || '—'}</dd></div>
                  <div>
                    <dt>Mức phạt</dt>
                    <dd className={current.penalty.verified ? '' : 'is-muted'}>{formatPenalty(current.penalty)}</dd>
                    {points != null && points > 0 && <dd className="cz-fact-note">Trừ {points} điểm GPLX</dd>}
                  </div>
                </dl>
                {current.penalty.verified && current.penalty.source && (
                  <div className="cz-legal">
                    <p className="cz-kicker">Căn cứ xử phạt</p>
                    <p>{current.penalty.source}</p>
                  </div>
                )}
                {current.priorityFlag && (
                  <p className="cz-priority">
                    <strong>Nghi nhường xe ưu tiên.</strong> {current.priorityReason || 'Cán bộ sẽ xem lại trước khi kết luận.'}
                  </p>
                )}
              </section>

              <section className="cz-drawer-section" aria-labelledby={`${baseId}-evidence`}>
                <div className="cz-drawer-section-head">
                  <h3 id={`${baseId}-evidence`}>Ảnh bằng chứng</h3>
                  <span className="cz-muted">{evidence.length ? `${evidence.length} ảnh` : 'Chưa có ảnh'}</span>
                </div>
                {evidence.length === 0 ? (
                  <p className="cz-empty-inline"><CameraIcon /> Hồ sơ này chưa có ảnh đính kèm.</p>
                ) : (
                  <>
                    <ul className="cz-evidence-grid">
                      {evidence.map((item, index) => (
                        <li key={`${item.kind}-${item.url}`}>
                          <button
                            type="button"
                            className="cz-evidence-thumb"
                            onClick={() => setLightbox(index)}
                            aria-label={`Xem lớn: ${evidenceKindLabel(item.kind)}`}
                          >
                            <img
                              src={item.url}
                              alt={`${evidenceKindLabel(item.kind)} của biển số ${current.plate}`}
                              loading="lazy"
                              width={640}
                              height={360}
                            />
                            <span>{evidenceShortLabel(item.kind)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="cz-hint">Bấm một ảnh để xem lớn. Trong ảnh lớn, dùng ← → để chuyển và Esc để đóng.</p>
                  </>
                )}
              </section>

              <section className="cz-drawer-section" aria-labelledby={`${baseId}-timeline`}>
                <div className="cz-drawer-section-head">
                  <h3 id={`${baseId}-timeline`}>Dòng thời gian</h3>
                </div>
                {detail.timelineError && (
                  <p className="cz-inline-error" role="status">
                    {detail.timelineError}{' '}
                    <button type="button" className="cz-link" onClick={() => { retryFocusRef.current = true; setReloadKey(key => key + 1); }}>Thử lại</button>
                  </p>
                )}
                {detail.timeline.length === 0 && !detail.timelineError ? (
                  <p className="cz-muted">Chưa có mốc xử lý chi tiết cho hồ sơ này.</p>
                ) : (
                  <ol className="cz-timeline">
                    {detail.timeline.map(event => (
                      <li key={event.id} className={`cz-timeline-item cz-tone-${event.tone}`}>
                        <span className="cz-timeline-dot" aria-hidden="true" />
                        <div>
                          <p className="cz-timeline-title">{event.title}</p>
                          {event.detail && <p className="cz-timeline-detail">{event.detail}</p>}
                          <p className="cz-timeline-time">{formatDateTime(event.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="cz-drawer-section cz-complaint" aria-labelledby={`${baseId}-complaint`}>
                <div className="cz-drawer-section-head">
                  <h3 id={`${baseId}-complaint`}>Khiếu nại</h3>
                </div>

                {flash && (
                  <p
                    ref={flashRef}
                    tabIndex={-1}
                    className={flash.ok ? 'cz-flash is-ok' : 'cz-flash is-error'}
                    role={flash.ok ? 'status' : 'alert'}
                  >
                    {flash.ok ? <CheckIcon /> : <AlertIcon />}
                    <span>{flash.text}</span>
                  </p>
                )}

                {canComplain && !flash?.ok && (
                  <form className="cz-complaint-form" onSubmit={complain} noValidate>
                    <p className="cz-hint">
                      Nếu hồ sơ ghi nhận chưa đúng, gửi khiếu nại kèm lý do. Cán bộ sẽ xem lại ảnh và dòng thời gian.
                    </p>
                    <label htmlFor={`${baseId}-kind`}>Lý do khiếu nại</label>
                    <select
                      id={`${baseId}-kind`}
                      value={kind}
                      onChange={event => setKind(event.target.value as ComplaintKind)}
                      disabled={busy}
                    >
                      {COMPLAINT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {complaintKindLabel(option.value)}
                        </option>
                      ))}
                    </select>
                    <p className="cz-hint">
                      {COMPLAINT_OPTIONS.find(option => option.value === kind)?.hint}
                    </p>
                    <label htmlFor={`${baseId}-note`}>Ghi chú thêm (bắt buộc)</label>
                    <textarea
                      ref={noteRef}
                      id={`${baseId}-note`}
                      rows={3}
                      maxLength={COMPLAINT_NOTE_MAX}
                      value={note}
                      onChange={event => {
                        setNote(event.target.value);
                        if (noteError) setNoteError('');
                      }}
                      disabled={busy}
                      required
                      aria-required="true"
                      aria-invalid={noteError ? true : undefined}
                      aria-describedby={`${baseId}-counter ${baseId}-max${noteError ? ` ${baseId}-note-error` : ''}`}
                      placeholder="Thời gian, hoàn cảnh hoặc thông tin giúp cán bộ đối chiếu"
                    />
                    {noteError && (
                      <p id={`${baseId}-note-error`} className="cz-field-error is-inline" role="alert">
                        {noteError}
                      </p>
                    )}
                    <div className="cz-form-foot">
                      <span className="cz-form-count">
                        <span id={`${baseId}-counter`} className="cz-counter">{note.length}/{COMPLAINT_NOTE_MAX} ký tự</span>
                        <span id={`${baseId}-max`} className="cz-max-note" role="status">
                          {note.length >= COMPLAINT_NOTE_MAX ? `Đã đạt ${COMPLAINT_NOTE_MAX} ký tự tối đa.` : ''}
                        </span>
                      </span>
                      <button type="submit" className="cz-btn cz-btn-primary" disabled={busy}>
                        {busy ? 'Đang gửi…' : 'Gửi khiếu nại'}
                      </button>
                    </div>
                  </form>
                )}

                {disputed && !flash?.ok && (
                  <div className="cz-flash is-warn" role="status">
                    <AlertIcon />
                    <span>
                      <strong>Hồ sơ đang khiếu nại.</strong> Hệ thống đã ghi nhận và đang chờ cán bộ xử lý.
                    </span>
                  </div>
                )}

                {finished && !disputed && (
                  <p className="cz-muted">Hồ sơ đã kết thúc, không thể gửi khiếu nại mới.</p>
                )}

                {mode === 'local' && !disputed && !finished && (
                  <div className="cz-lock-note">
                    <LockIcon />
                    <p>
                      <strong>Cần đăng nhập để khiếu nại.</strong> Bản công khai chỉ cho xem hồ sơ. Khiếu nại nằm trong
                      tài khoản công dân để bạn theo dõi kết quả.
                    </p>
                    <button type="button" className="cz-btn cz-btn-outline" onClick={onRequireLogin}>
                      Đăng nhập
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {lightbox !== null && evidence.length > 0 && (
        <EvidenceLightbox
          items={evidence}
          index={lightbox}
          plate={current.plate}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>,
    document.body,
  );
}
