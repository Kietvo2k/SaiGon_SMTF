import { useEffect, useMemo, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { displayNodeLabel, violationLabel, violationStatusLabel } from '../../lib/labels';
import { barPercent, summarizeStats } from '../../lib/stats';
import { DateField } from '../../components/DateField';
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
  const maxStatus = Math.max(1, ...(stats?.by_status.map(r => r.count) ?? [0]));
  const maxCode = Math.max(1, ...(stats?.by_code.map(r => r.count) ?? [0]));
  const maxNode = Math.max(1, ...(stats?.by_node.map(r => r.count) ?? [0]));
  const summary = useMemo(() => summarizeStats(stats), [stats]);

  return (
    <section className="panel stats-panel" aria-label="Thống kê vi phạm">
      <div className="toolbar">
        <DateField label="Từ ngày" value={from} onChange={setFrom} />
        <DateField label="Đến ngày" value={to} onChange={setTo} />
        <button type="button" className="ghost" disabled={!from && !to} onClick={() => { setFrom(''); setTo(''); }}>
          Xóa bộ lọc ngày
        </button>
        <p className="count">Ngày theo giờ Việt Nam. Tổng số vi phạm: <b>{stats?.total ?? '–'}</b></p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {stats && (
        <>
          <div className="stats-summary" aria-label="Tóm tắt số liệu">
            <div className="stats-kpi">
              <span className="stats-kpi-label">Tổng số vi phạm</span>
              <strong className="stats-kpi-val">{summary.total.toLocaleString('vi-VN')}</strong>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Giờ cao điểm</span>
              <strong className="stats-kpi-val">
                {summary.peakHour ? `${summary.peakHour.hour}h` : '–'}
              </strong>
              <small>{summary.peakHour ? `${summary.peakHour.count} vi phạm` : 'Chưa có dữ liệu'}</small>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Nút nhiều vi phạm nhất</span>
              <strong className="stats-kpi-val stats-kpi-text">
                {summary.topNode ? (displayNodeLabel(summary.topNode.node_label) || summary.topNode.node_id) : '–'}
              </strong>
              <small>{summary.topNode ? `${summary.topNode.count} vi phạm` : 'Chưa có dữ liệu'}</small>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Lỗi phổ biến nhất</span>
              <strong className="stats-kpi-val stats-kpi-text">
                {summary.topCode ? violationLabel(summary.topCode.violation_code) : '–'}
              </strong>
              <small>{summary.topCode ? `${summary.topCode.count} vi phạm` : 'Chưa có dữ liệu'}</small>
            </div>
          </div>

          <div className="stats-card">
            <div className="stats-card-head">
              <h2>Vi phạm theo giờ trong ngày</h2>
              <span className="stats-sub">Giờ cao điểm được tô đậm</span>
            </div>
            <div className="hours" role="img" aria-label="Biểu đồ cột số vi phạm theo giờ, từ 0 đến 23 giờ">
              {stats.by_hour.map(h => {
                const isPeak = h.count > 0 && h.count === maxHour;
                return (
                  <div className="hour" key={h.hour} title={`${h.hour} giờ: ${h.count} vi phạm`}>
                    <span className={isPeak ? 'bar-val peak' : 'bar-val'}>{h.count > 0 ? h.count : ''}</span>
                    <div
                      className={isPeak ? 'bar peak' : 'bar'}
                      style={{ height: `${(h.count / maxHour) * 100}%` }}
                    />
                    <span className="bar-label">{h.hour % 3 === 0 ? `${h.hour}h` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stats-grid">
            <div className="stats-card">
              <div className="stats-card-head">
                <h2 id="stats-status-heading">Theo trạng thái</h2>
                <span className="stats-sub">{stats.by_status.length} trạng thái</span>
              </div>
              <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="stats-status-heading">
                <table className="stats-table">
                  <thead>
                    <tr><th scope="col">Trạng thái</th><th scope="col" className="num">Số lượng</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_status.map(r => (
                      <tr key={r.status}>
                        <td><span className={`badge s-${r.status}`}>{violationStatusLabel(r.status)}</span></td>
                        <td className="num">
                          <div className="stat-meter">
                            <span className="stat-bar" aria-hidden="true">
                              <i style={{ width: `${barPercent(r.count, maxStatus)}%` }} />
                            </span>
                            <span className="stat-num">{r.count}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {stats.by_status.length === 0 && <tr><td colSpan={2} className="empty">Chưa có dữ liệu</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stats-card">
              <div className="stats-card-head">
                <h2 id="stats-code-heading">Theo loại lỗi</h2>
                <span className="stats-sub">{stats.by_code.length} loại lỗi</span>
              </div>
              <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="stats-code-heading">
                <table className="stats-table">
                  <thead>
                    <tr><th scope="col">Loại lỗi</th><th scope="col" className="num">Số lượng</th></tr>
                  </thead>
                  <tbody>
                    {stats.by_code.map(r => (
                      <tr key={r.violation_code}>
                        <td>{violationLabel(r.violation_code)}</td>
                        <td className="num">
                          <div className="stat-meter">
                            <span className="stat-bar" aria-hidden="true">
                              <i style={{ width: `${barPercent(r.count, maxCode)}%` }} />
                            </span>
                            <span className="stat-num">{r.count}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {stats.by_code.length === 0 && <tr><td colSpan={2} className="empty">Chưa có dữ liệu</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="stats-card">
            <div className="stats-card-head">
              <h2 id="stats-node-heading">Theo nút giao</h2>
              <span className="stats-sub">{stats.by_node.length} nút giao</span>
            </div>
            <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="stats-node-heading">
              <table className="stats-table">
                <thead>
                  <tr><th scope="col">Nút</th><th scope="col">Mã nút</th><th scope="col" className="num">Số lượng</th></tr>
                </thead>
                <tbody>
                  {stats.by_node.map(r => (
                    <tr key={r.node_id}>
                      <td>{displayNodeLabel(r.node_label) || r.node_id}</td>
                      <td><span className="mono node-chip">{r.node_id}</span></td>
                      <td className="num">
                        <div className="stat-meter">
                          <span className="stat-bar" aria-hidden="true">
                            <i style={{ width: `${barPercent(r.count, maxNode)}%` }} />
                          </span>
                          <span className="stat-num">{r.count}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {stats.by_node.length === 0 && <tr><td colSpan={3} className="empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
