import { useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { violationLabel, violationStatusLabel } from '../../lib/labels';
import type { Stats } from '../../lib/types';

interface Props {
  api: Api;
  tick: number;
}

export function StatsTab({ api, tick }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api.get<Stats>(`/officer/stats?${qs}`)
      .then(s => {
        if (!alive) return;
        setStats(s);
        setError('');
      })
      .catch(e => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, from, to, tick]);

  const maxHour = Math.max(1, ...(stats?.by_hour.map(h => h.count) ?? [0]));

  return (
    <section className="panel" aria-label="Thống kê vi phạm">
      <div className="toolbar">
        <label>Từ ngày
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label>Đến ngày
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </label>
        <button type="button" className="ghost" disabled={!from && !to} onClick={() => { setFrom(''); setTo(''); }}>
          Xóa bộ lọc ngày
        </button>
        <p className="count">Ngày theo giờ Việt Nam. Tổng số vi phạm: <b>{stats?.total ?? '–'}</b></p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {stats && (
        <>
          <h2>Vi phạm theo giờ trong ngày</h2>
          <div className="hours" role="img" aria-label="Biểu đồ cột số vi phạm theo giờ, từ 0 đến 23 giờ">
            {stats.by_hour.map(h => (
              <div className="hour" key={h.hour} title={`${h.hour} giờ: ${h.count} vi phạm`}>
                <span className="bar-val">{h.count > 0 ? h.count : ''}</span>
                <div className="bar" style={{ height: `${(h.count / maxHour) * 100}%` }} />
                <span className="bar-label">{h.hour % 3 === 0 ? `${h.hour}h` : ''}</span>
              </div>
            ))}
          </div>

          <div className="stats-grid">
            <div>
              <h2>Theo trạng thái</h2>
              <table>
                <thead><tr><th>Trạng thái</th><th>Số lượng</th></tr></thead>
                <tbody>
                  {stats.by_status.map(r => (
                    <tr key={r.status}><td>{violationStatusLabel(r.status)}</td><td>{r.count}</td></tr>
                  ))}
                  {stats.by_status.length === 0 && <tr><td colSpan={2} className="empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>

            <div>
              <h2>Theo loại lỗi</h2>
              <table>
                <thead><tr><th>Loại lỗi</th><th>Số lượng</th></tr></thead>
                <tbody>
                  {stats.by_code.map(r => (
                    <tr key={r.violation_code}><td>{violationLabel(r.violation_code)}</td><td>{r.count}</td></tr>
                  ))}
                  {stats.by_code.length === 0 && <tr><td colSpan={2} className="empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <h2>Theo nút giao</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nút</th><th>Mã nút</th><th>Số lượng</th></tr></thead>
              <tbody>
                {stats.by_node.map(r => (
                  <tr key={r.node_id}>
                    <td>{r.node_label || r.node_id}</td>
                    <td className="mono">{r.node_id}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
                {stats.by_node.length === 0 && <tr><td colSpan={3} className="empty">Chưa có dữ liệu</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
