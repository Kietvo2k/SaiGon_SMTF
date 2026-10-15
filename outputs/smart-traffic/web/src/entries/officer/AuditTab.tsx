import { FormEvent, useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { roleLabel, violationStatusLabel } from '../../lib/labels';
import type { AuditRow, Page } from '../../lib/types';

interface Props {
  api: Api;
  tick: number;
}

// Nhật ký thao tác (commander/admin): xem theo mã đối tượng, ví dụ mã vi phạm VP-… hoặc mã khiếu nại CB-….
export function AuditTab({ api, tick }: Props) {
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ limit: '100' });
    if (target) qs.set('target_id', target);
    api.get<Page<AuditRow>>(`/officer/audit?${qs}`)
      .then(r => {
        if (!alive) return;
        setRows(r.items);
        setError('');
      })
      .catch(e => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, target, tick]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTarget(draft.trim());
  };

  return (
    <section className="panel" aria-label="Nhật ký thao tác">
      <form className="toolbar" onSubmit={submit}>
        <label>Mã đối tượng (tùy chọn)
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ví dụ: VP-20261014-000001" />
        </label>
        <button type="submit">Lọc</button>
        {target && <button type="button" className="ghost" onClick={() => { setDraft(''); setTarget(''); }}>Xem tất cả</button>}
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th>
              <th>Đối tượng</th><th>Chuyển trạng thái</th><th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{formatDateTime(r.created_at)}</td>
                <td>{r.actor}<br /><small>{roleLabel(r.role)}</small></td>
                <td>{r.action}</td>
                <td className="mono">{r.target_type ? `${r.target_type} ${r.target_id ?? ''}` : '–'}</td>
                <td>{r.from_state || r.to_state ? `${stateText(r.from_state)} → ${stateText(r.to_state)}` : '–'}</td>
                <td>{r.reason || '–'}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && <tr><td colSpan={6} className="empty">Chưa có nhật ký phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const OTHER_STATE_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  locked: 'Đã khóa',
  bound: 'Đã gắn biển',
  citizen: 'Công dân',
  officer: 'Cán bộ xử lý',
  commander: 'Chỉ huy trực ban',
  open: 'Chờ xử lý',
  resolved: 'Đã gỡ vi phạm',
  rejected: 'Đã giữ vi phạm',
  cancel: 'Hủy ghi đè',
};

// Gọi tên trạng thái (vi phạm, tài khoản, khiếu nại); mã lạ giữ nguyên.
function stateText(state: string | null): string {
  if (!state) return '–';
  const label = OTHER_STATE_LABELS[state] ?? violationStatusLabel(state);
  return label;
}
