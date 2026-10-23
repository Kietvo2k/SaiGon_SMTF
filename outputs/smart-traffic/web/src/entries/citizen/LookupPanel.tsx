import { FormEvent, useState } from 'react';
import { API_BASE, mediaUrl } from '../../lib/api';
import { formatDateTime, formatPenalty, penaltyContext } from '../../lib/format';
import { evidenceKindLabel, violationLabel, violationStatusLabel } from '../../lib/labels';
import type { CitizenViolationItem } from '../../lib/types';
import { normalizeLookupPlate } from '../../lib/lookup';

interface PublicItem extends CitizenViolationItem {
  evidence?: { kind: string; url: string }[];
}

// Tra cứu công khai theo biển số: không cần đăng nhập, chỉ hiện vi phạm từ trạng thái đã xác nhận trở lên.
export function LookupPanel() {
  const [plate, setPlate] = useState('');
  const [items, setItems] = useState<PublicItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeLookupPlate(plate);
    if (!normalized) {
      setItems([]); setFailed(true);
      setMessage('Biển số chưa đúng định dạng. Ví dụ: 51K-888.88 hoặc 59-X1 234.56.');
      return;
    }
    setPlate(normalized.plate);
    setBusy(true);
    setFailed(false);
    setItems([]);
    setMessage('Đang tra cứu…');
    try {
      const qs = new URLSearchParams({ plate: normalized.plate, vehicle_class: normalized.vehicleClass });
      const res = await fetch(`${API_BASE}/public/lookup?${qs}`);
      const body = await res.json();
      if (!res.ok) {
        setFailed(true);
        setMessage(body?.error?.message || 'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại.');
        return;
      }
      const list: PublicItem[] = body.items || [];
      setItems(list);
      setMessage(list.length ? `${body.total ?? list.length} kết quả` : 'Không tìm thấy vi phạm nào cho biển số này.');
    } catch {
      setItems([]);
      setFailed(true);
      setMessage('Không kết nối được hệ thống tra cứu. Vui lòng thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card lookup-card" aria-label="Tra cứu công khai" aria-busy={busy}>
      <h2>Tra cứu vi phạm theo biển số</h2>
      <form className="row-form" onSubmit={lookup}>
        <label>Biển số
          <input
            value={plate}
            onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="Ví dụ: 51K-123.45"
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="plate-help lookup-status"
            required
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Đang tra cứu…' : 'Tra cứu biển số'}</button>
      </form>
      <p className="hint" id="plate-help">Ô tô và xe máy · Có thể nhập liền hoặc kèm dấu phân cách.</p>
      <p id="lookup-status" className={failed ? 'error' : 'status-line'} role={failed ? 'alert' : 'status'}>{message}</p>

      <ul className="list">
        {items.map(v => (
          <li key={v.id} className="item">
            <div className="item-head">
              <b>{violationLabel(v.violation_code)}</b>
              <span className="badge">{violationStatusLabel(v.status)}</span>
            </div>
            <p className="meta">{formatDateTime(v.occurred_at)} · {v.node_label || '–'}</p>
            <p>{formatPenalty(v.penalty)}</p>
            {penaltyContext(v.penalty) && <small className="penalty-context">{penaltyContext(v.penalty)}</small>}
            {(v.evidence || []).length > 0 && (
              <div className="evidence">
                {(v.evidence || []).map(ev => (
                  <figure key={ev.url}>
                    <img src={mediaUrl(ev.url)} alt={evidenceKindLabel(ev.kind)} loading="lazy" />
                    <figcaption>{evidenceKindLabel(ev.kind)}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
