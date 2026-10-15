import { useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { complaintKindLabel, complaintStatusLabel, violationStatusLabel } from '../../lib/labels';
import { Pager, pageCount } from '../../components/Pager';
import type { OfficerComplaint, Page } from '../../lib/types';

type Filter = 'open' | 'resolved' | 'rejected' | 'all';
type Resolve = 'confirm' | 'dismiss';

const FILTERS: [Filter, string][] = [
  ['open', 'Chờ xử lý'],
  ['resolved', 'Đã gỡ vi phạm'],
  ['rejected', 'Đã giữ vi phạm'],
  ['all', 'Tất cả'],
];
const PAGE_SIZE = 20;

interface Props {
  api: Api;
  tick: number;
  onChanged: () => void;
}

export function ComplaintsTab({ api, tick, onChanged }: Props) {
  const [filter, setFilter] = useState<Filter>('open');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OfficerComplaint[]>([]);
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (filter !== 'all') qs.set('status', filter);
    api.get<Page<OfficerComplaint>>(`/officer/complaints?${qs}`)
      .then(r => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
        setLoadError('');
      })
      .catch(e => { if (alive) setLoadError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, filter, page, tick]);

  const resolve = async (c: OfficerComplaint, action: Resolve) => {
    const note = (notes[c.id] ?? '').trim();
    if (!note) return;
    setBusyId(c.id);
    setFlash(null);
    try {
      await api.post(`/officer/complaints/${c.id}/resolve`, { action, note });
      setFlash({
        ok: true,
        text: action === 'confirm'
          ? `Đã giữ vi phạm ${c.violation_id}; chủ xe vẫn có thể nộp phạt.`
          : `Đã gỡ vi phạm ${c.violation_id}.`,
      });
      setNotes(prev => ({ ...prev, [c.id]: '' }));
      onChanged();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel" aria-label="Khiếu nại">
      <div className="toolbar">
        <label>Trạng thái khiếu nại
          <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(1); }}>
            {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="count">Có {total} khiếu nại.</p>
      </div>

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      <ul className="cards">
        {items.map(c => {
          const note = notes[c.id] ?? '';
          return (
            <li key={c.id} className="card">
              <div className="card-head">
                <b>{complaintKindLabel(c.kind)}</b>
                <span className={`badge c-${c.status}`}>{complaintStatusLabel(c.status, 'officer')}</span>
                {c.priority_flag && <span className="badge warn" title={c.priority_reason ?? undefined}>Nghi nhường xe ưu tiên</span>}
              </div>
              <p className="meta">
                Mã <span className="mono">{c.id}</span> · Biển <span className="mono">{c.plate}</span> ·
                Vi phạm <span className="mono">{c.violation_id}</span> ({violationStatusLabel(c.violation_status)}) · {formatDateTime(c.created_at)}
              </p>
              <p><b>Lý do:</b> {c.reason}</p>
              {c.message && <p><b>Mô tả thêm:</b> {c.message}</p>}

              {c.status === 'open' ? (
                <div className="resolve">
                  <label>Lý do xử lý (bắt buộc)
                    <input
                      value={note}
                      maxLength={1000}
                      onChange={e => setNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Ví dụ: đã đối chiếu hình ảnh và dữ liệu biển số"
                    />
                  </label>
                  <div className="actions">
                    <button type="button" disabled={!note.trim() || busyId === c.id} onClick={() => resolve(c, 'confirm')}>
                      Giữ vi phạm
                    </button>
                    <button type="button" className="danger" disabled={!note.trim() || busyId === c.id} onClick={() => resolve(c, 'dismiss')}>
                      Gỡ vi phạm
                    </button>
                  </div>
                </div>
              ) : (
                <p className="meta">
                  Ghi chú xử lý: {c.resolution || '–'} · Xử lý lúc {formatDateTime(c.resolved_at)}
                </p>
              )}
            </li>
          );
        })}
        {items.length === 0 && !loadError && <li className="empty">Không có khiếu nại nào trong bộ lọc này.</li>}
      </ul>

      <Pager page={page} pages={pageCount(total, PAGE_SIZE)} onChange={setPage} />
    </section>
  );
}
