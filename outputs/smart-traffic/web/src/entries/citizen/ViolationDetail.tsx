import { FormEvent, useEffect, useState } from 'react';
import { Api, errorMessage, mediaUrl } from '../../lib/api';
import { formatDateTime, formatPenalty } from '../../lib/format';
import {
  complaintKindLabel,
  complaintStatusLabel,
  evidenceKindLabel,
  violationLabel,
  violationStatusLabel,
} from '../../lib/labels';
import type { CitizenComplaintDetail, CitizenViolationDetail } from '../../lib/types';

type Kind = 'priority_vehicle' | 'wrong_plate' | 'other';
const KIND_OPTIONS: Kind[] = ['priority_vehicle', 'wrong_plate', 'other'];

interface Props {
  api: Api;
  id: string;
  tick: number;
  onBack: () => void;
  onChanged: () => void;
}

interface Flash {
  ok: boolean;
  text: string;
}

export function ViolationDetail({ api, id, tick, onBack, onChanged }: Props) {
  const [detail, setDetail] = useState<CitizenViolationDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const [openComplaint, setOpenComplaint] = useState<Record<string, CitizenComplaintDetail>>({});

  const [kind, setKind] = useState<Kind>('wrong_plate');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    api.get<CitizenViolationDetail>(`/citizen/violations/${id}`)
      .then(d => {
        if (!alive) return;
        setDetail(d);
        setLoadError('');
      })
      .catch(e => { if (alive) setLoadError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, id, tick]);

  // Có cập nhật mới thì bỏ kết quả khiếu nại đã mở; bấm "Xem tiến độ" lại để lấy bản mới.
  useEffect(() => {
    setOpenComplaint({});
  }, [tick]);

  // Nộp phạt chỉ đổi trạng thái notified → paid; không có ô nhập thẻ hay tài khoản ngân hàng.
  const pay = async () => {
    setBusy(true);
    setFlash(null);
    try {
      await api.post(`/citizen/violations/${id}/pay`, { confirm: true });
      setFlash({ ok: true, text: 'Đã ghi nhận trạng thái đã nộp phạt cho vi phạm này.' });
      onChanged();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const complain = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const r = await api.post<{ id: string }>('/citizen/complaints', {
        violation_id: id,
        kind,
        reason: reason.trim(),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setFlash({ ok: true, text: `Đã gửi khiếu nại ${r.id}. Vi phạm đang chờ cán bộ xử lý.` });
      setReason('');
      setMessage('');
      onChanged();
    } catch (err) {
      setFlash({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const showComplaint = async (cid: string) => {
    try {
      const c = await api.get<CitizenComplaintDetail>(`/citizen/complaints/${cid}`);
      setOpenComplaint(prev => ({ ...prev, [cid]: c }));
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <section className="card" aria-label="Chi tiết vi phạm">
      <button type="button" className="ghost back" onClick={onBack}>← Quay lại danh sách</button>

      {loadError && <p className="error" role="alert">{loadError}</p>}
      {!detail && !loadError && <p className="hint" role="status">Đang tải…</p>}

      {detail && (
        <>
          <h2>{violationLabel(detail.violation_code)}</h2>
          <dl className="facts">
            <dt>Biển số</dt><dd className="mono">{detail.plate}</dd>
            <dt>Thời gian</dt><dd>{formatDateTime(detail.occurred_at)}</dd>
            <dt>Nút giao</dt><dd>{detail.node_label || '–'}</dd>
            <dt>Trạng thái</dt><dd><span className={`badge s-${detail.status}`}>{violationStatusLabel(detail.status)}</span></dd>
            <dt>Mức phạt</dt><dd>{formatPenalty(detail.penalty)}</dd>
          </dl>

          <h3>Bằng chứng</h3>
          {detail.evidence.length === 0 ? (
            <p className="hint">Chưa có bằng chứng hình ảnh cho vi phạm này.</p>
          ) : (
            <div className="evidence">
              {detail.evidence.map(ev => (
                <figure key={ev.url}>
                  <img src={mediaUrl(ev.url)} alt={evidenceKindLabel(ev.kind)} loading="lazy" />
                  <figcaption>{evidenceKindLabel(ev.kind)}</figcaption>
                </figure>
              ))}
            </div>
          )}

          {detail.status === 'disputed' && (
            <p className="notice">Vi phạm đang được khiếu nại. Bạn chưa nộp phạt được cho đến khi cán bộ xử lý xong.</p>
          )}

          {detail.can_pay && (
            <div className="block">
              <h3>Nộp phạt</h3>
              <p className="hint">
                Bấm xác nhận để ghi nhận vi phạm này đã được nộp phạt. Thao tác này chỉ cập nhật trạng thái,
                không nhập thông tin thẻ hay tài khoản ngân hàng tại đây.
              </p>
              <button type="button" disabled={busy} onClick={pay}>Xác nhận đã nộp phạt</button>
            </div>
          )}

          {detail.can_complain && (
            <form className="block stack" onSubmit={complain}>
              <h3>Gửi khiếu nại</h3>
              <label>Loại khiếu nại
                <select value={kind} onChange={e => setKind(e.target.value as Kind)}>
                  {KIND_OPTIONS.map(k => <option key={k} value={k}>{complaintKindLabel(k)}</option>)}
                </select>
              </label>
              <label>Lý do (bắt buộc, tối đa 200 ký tự)
                <input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} required />
              </label>
              <label>Mô tả thêm (tùy chọn, tối đa 1000 ký tự)
                <textarea value={message} maxLength={1000} rows={3} onChange={e => setMessage(e.target.value)} />
              </label>
              <button type="submit" disabled={busy || !reason.trim()}>Gửi khiếu nại</button>
            </form>
          )}

          {detail.complaints.length > 0 && (
            <div className="block">
              <h3>Khiếu nại của tôi</h3>
              <ul className="list">
                {detail.complaints.map(c => {
                  const full = openComplaint[c.id];
                  return (
                    <li key={c.id} className="item">
                      <div className="item-head">
                        <b>{complaintKindLabel(c.kind)}</b>
                        <span className={`badge c-${c.status}`}>{complaintStatusLabel(c.status, 'citizen')}</span>
                      </div>
                      <p className="meta">Mã <span className="mono">{c.id}</span> · gửi lúc {formatDateTime(c.created_at)}</p>
                      {full ? (
                        <p>
                          <b>Lý do:</b> {full.reason}
                          {full.resolution && <><br /><b>Kết quả xử lý:</b> {full.resolution}</>}
                          {full.resolved_at && <><br /><small>Xử lý lúc {formatDateTime(full.resolved_at)}</small></>}
                        </p>
                      ) : (
                        <button type="button" className="ghost" onClick={() => showComplaint(c.id)}>Xem tiến độ</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
    </section>
  );
}
