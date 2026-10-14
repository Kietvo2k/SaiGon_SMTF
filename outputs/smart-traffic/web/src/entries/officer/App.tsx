import React, { useEffect, useState } from 'react';
import { authHeaders, getKpi, listViolations, login, review, streamUrl } from '../../lib/api';
import { connectSmartWs } from '../../lib/ws';
import { formatPenalty } from '../../lib/format';

export function App() {
  const [token, setToken] = useState(localStorage.getItem('smart_token'));
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>({});
  const [err, setErr] = useState('');

  const refresh = async () => {
    // Danh sách sống: cả `new` lẫn `needs_review` (không chỉ `new`).
    const body = await listViolations({ page: '1', page_size: '50' });
    setItems((body.items || []).filter((v: any) => v.status === 'new' || v.status === 'needs_review'));
    setKpi(await getKpi());
  };

  useEffect(() => {
    if (!token) return;
    refresh();
    const stop = connectSmartWs(token, msg => {
      if (['violation.created', 'violation.updated', 'kpi.update'].includes(msg.event)) refresh();
    });
    const timer = setInterval(refresh, 10000);
    return () => { stop(); clearInterval(timer); };
  }, [token]);

  if (!token) {
    return (
      <form onSubmit={async e => {
        e.preventDefault();
        const body = await login(user, pw);
        if (body.access_token) setToken(body.access_token);
        else setErr('Sai tài khoản hoặc mật khẩu');
      }}>
        <h1>SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc</h1>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Tài khoản" />
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Mật khẩu" />
        <button type="submit">Đăng nhập</button>
        <p>{err}</p>
      </form>
    );
  }

  return (
    <main>
      <h1>SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc</h1>
      <section aria-label="KPI">
        <span>Chờ TB: <b>{kpi.wait_avg_s ?? '–'}</b> s</span>
        <span>Hàng chờ max: <b>{kpi.queue_max ?? '–'}</b></span>
        <span>Lưu lượng: <b>{kpi.flow_per_min ?? '–'}</b>/phút</span>
        <span>Chế độ: <b>{kpi.mode ?? '–'}</b></span>
      </section>
      <section aria-label="Stream">
        <img src={streamUrl('CAM-HX-001')} alt="Camera Hàng Xanh" width={480} />
      </section>
      <section aria-label="Danh sách vi phạm">
        <table>
          <thead><tr><th>Mã</th><th>Biển</th><th>Lỗi</th><th>Thời gian</th><th>Nút</th><th>Mức phạt</th><th>Thao tác</th></tr></thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id}>
                <td>{v.id}</td><td>{v.plate}</td><td>{v.violation_code}</td>
                <td>{v.occurred_at}</td><td>{v.node_id}</td>
                <td>{formatPenalty(v.penalty ?? { verified: false })}</td>
                <td>
                  <button type="button" onClick={() => review(v.id, 'confirm', 'xác nhận')}>Xác nhận</button>
                  <button type="button" onClick={() => review(v.id, 'dismiss', 'gỡ')}>Gỡ</button>
                  <button type="button" onClick={() => review(v.id, 'needs-review', 'cần xác minh')}>Cần xác minh</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
