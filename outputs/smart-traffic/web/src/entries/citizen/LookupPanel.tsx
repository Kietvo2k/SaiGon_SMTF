import { FormEvent, useState } from 'react';
import { API_BASE, mediaUrl } from '../../lib/api';
import { formatDateTime, formatPenalty } from '../../lib/format';
import { evidenceKindLabel, violationLabel, violationStatusLabel } from '../../lib/labels';
import type { CitizenViolationItem } from '../../lib/types';

interface PublicItem extends CitizenViolationItem {
  evidence?: { kind: string; url: string }[];
}

// Tra cứu công khai theo biển số: không cần đăng nhập, chỉ hiện vi phạm từ trạng thái đã xác nhận trở lên.
export function LookupPanel() {
  const [plate, setPlate] = useState('');
  const [vehicleClass, setVehicleClass] = useState<'car' | 'motorbike'>('car');
  const [items, setItems] = useState<PublicItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('Đang tra cứu…');
    try {
      const qs = new URLSearchParams({ plate: plate.trim().toUpperCase(), vehicle_class: vehicleClass });
      const res = await fetch(`${API_BASE}/public/lookup?${qs}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Không tra cứu được');
      const list: PublicItem[] = body.items || [];
      setItems(list);
      setMessage(list.length ? `${body.total ?? list.length} kết quả` : 'Không tìm thấy vi phạm nào cho biển số này.');
    } catch {
      setItems([]);
      setMessage('Không kết nối được hệ thống tra cứu. Vui lòng thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label="Tra cứu công khai">
      <h2>Tra cứu vi phạm theo biển số</h2>
      <form className="row-form" onSubmit={lookup}>
        <label>Biển số
          <input
            value={plate}
            onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="Ví dụ: 51K-123.45"
            maxLength={16}
            required
          />
        </label>
        <label>Loại xe
          <select value={vehicleClass} onChange={e => setVehicleClass(e.target.value as 'car' | 'motorbike')}>
            <option value="car">Ô tô</option>
            <option value="motorbike">Xe máy</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>Tra cứu</button>
      </form>
      <p className="status-line" role="status">{message}</p>

      <ul className="list">
        {items.map(v => (
          <li key={v.id} className="item">
            <div className="item-head">
              <b>{violationLabel(v.violation_code)}</b>
              <span className="badge">{violationStatusLabel(v.status)}</span>
            </div>
            <p className="meta">{formatDateTime(v.occurred_at)} · {v.node_label || '–'}</p>
            <p>{formatPenalty(v.penalty)}</p>
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
