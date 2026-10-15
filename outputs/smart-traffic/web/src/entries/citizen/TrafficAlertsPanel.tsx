import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';
import { PublicAlertsView, publicAlertSummary } from '../../lib/alerts';
import { formatDateTime } from '../../lib/format';

const REFRESH_MS = 30000;

// Cảnh báo giao thông công khai: không cần đăng nhập, làm mới mỗi 30 giây.
export function TrafficAlertsPanel() {
  const [data, setData] = useState<PublicAlertsView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${API_BASE}/public/alerts`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<PublicAlertsView>;
        })
        .then(body => {
          if (!alive) return;
          setData(body);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="card" aria-labelledby="traffic-alerts-title">
      <h2 id="traffic-alerts-title">Cảnh báo giao thông</h2>
      {failed && !data && <p className="hint" role="status">Chưa tải được cảnh báo giao thông. Hệ thống sẽ thử lại sau 30 giây.</p>}
      {!data && !failed && <p className="hint" role="status">Đang tải cảnh báo…</p>}
      {data && data.items.length === 0 && <p className="hint">Hiện chưa có cảnh báo</p>}
      {data && data.items.length > 0 && (
        <ul className="alert-list">
          {data.items.map(item => (
            <li key={`${item.name}-${item.horizon_min}-${item.prob_pct}`}>{publicAlertSummary(item)}</li>
          ))}
        </ul>
      )}
      {data?.updated_at && <p className="hint">Cập nhật lúc {formatDateTime(data.updated_at)}</p>}
    </section>
  );
}
