import { useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime, formatPenalty } from '../../lib/format';
import { violationLabel, violationStatusLabel } from '../../lib/labels';
import { Pager, pageCount } from '../../components/Pager';
import type { CitizenViolationItem, Page } from '../../lib/types';
import { ViolationDetail } from './ViolationDetail';

type Filter = '' | 'confirmed' | 'notified' | 'disputed' | 'paid';
const FILTERS: [Filter, string][] = [
  ['', 'Tất cả'],
  ['confirmed', 'Đã xác nhận'],
  ['notified', 'Đã thông báo, chờ nộp phạt'],
  ['disputed', 'Đang khiếu nại'],
  ['paid', 'Đã nộp phạt'],
];
const PAGE_SIZE = 20;

interface Props {
  api: Api;
  tick: number;
  hasPlates: boolean;
  onChanged: () => void;
}

// Vi phạm của các biển đã gắn cho tài khoản. Bấm một dòng để xem chi tiết và thao tác.
export function ViolationsPanel({ api, tick, hasPlates, onChanged }: Props) {
  const [filter, setFilter] = useState<Filter>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CitizenViolationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (filter) qs.set('status', filter);
    api.get<Page<CitizenViolationItem>>(`/citizen/violations?${qs}`)
      .then(r => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
        setError('');
      })
      .catch(e => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, filter, page, tick]);

  if (selected) {
    return (
      <ViolationDetail
        api={api}
        id={selected}
        tick={tick}
        onBack={() => setSelected(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <section className="card" aria-label="Vi phạm của tôi">
      <h2>Vi phạm của tôi</h2>
      <div className="toolbar">
        <label>Lọc theo trạng thái
          <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(1); }}>
            {FILTERS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="count">Có {total} vi phạm.</p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!hasPlates && <p className="hint">Gắn biển số ở mục trên để xem vi phạm của xe.</p>}

      <ul className="list">
        {items.map(v => (
          <li key={v.id} className="item">
            <div className="item-head">
              <b>{violationLabel(v.violation_code)}</b>
              <span className={`badge s-${v.status}`}>{violationStatusLabel(v.status)}</span>
            </div>
            <p className="meta">Biển <span className="mono">{v.plate}</span> · {formatDateTime(v.occurred_at)}</p>
            <p className="meta">{v.node_label || '–'}</p>
            <p>{formatPenalty(v.penalty)}</p>
            <button type="button" className="ghost" onClick={() => setSelected(v.id)}>Xem chi tiết</button>
          </li>
        ))}
        {items.length === 0 && !error && hasPlates && <li className="hint">Không có vi phạm nào trong bộ lọc này.</li>}
      </ul>

      <Pager page={page} pages={pageCount(total, PAGE_SIZE)} onChange={setPage} />
    </section>
  );
}
