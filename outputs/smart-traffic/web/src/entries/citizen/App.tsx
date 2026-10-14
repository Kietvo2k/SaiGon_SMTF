import React, { useState } from 'react';
import { formatPenalty } from '../../lib/format';

const BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8900/api/v1';

export function App() {
  const [plate, setPlate] = useState('');
  const [vehicleClass, setVehicleClass] = useState('car');
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('Đang tra cứu…');
    try {
      const res = await fetch(`${BASE}/public/lookup?plate=${encodeURIComponent(plate)}&vehicle_class=${vehicleClass}`);
      const body = await res.json();
      const list = body.items || [];
      setItems(list);
      setMsg(list.length ? `${body.total ?? list.length} kết quả` : 'Không tìm thấy bản ghi nào');
    } catch {
      setItems([]);
      setMsg('Không kết nối được hệ thống tra cứu');
    }
  };

  return (
    <main>
      <h1>Tra cứu vi phạm giao thông</h1>
      <form onSubmit={lookup}>
        <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Biển số, ví dụ 51K-123.45" required />
        <select value={vehicleClass} onChange={e => setVehicleClass(e.target.value)}>
          <option value="car">Ô tô</option>
          <option value="motorbike">Xe máy</option>
        </select>
        <button type="submit">Tra cứu</button>
      </form>
      <p>{msg}</p>
      <ul>
        {items.map(v => (
          <li key={v.id}>
            <b>{v.violation_code}</b> — {v.violation_label} — {v.occurred_at} — {v.node_label} — {v.status}
            <div>{formatPenalty(v.penalty)}</div>
            <div>
              {(v.evidence || []).map((ev: any) => (
                <img key={ev.url} src={BASE.replace('/api/v1', '') + ev.url} alt={ev.kind} width={160} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
