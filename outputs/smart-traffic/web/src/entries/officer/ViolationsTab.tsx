import { useEffect, useState } from 'react';
import { Api, errorMessage, streamUrl } from '../../lib/api';
import { formatDateTime, formatPenalty } from '../../lib/format';
import { violationLabel, violationStatusLabel } from '../../lib/labels';
import { Pager, pageCount } from '../../components/Pager';
import type { OfficerViolation, Page } from '../../lib/types';

type Filter = 'pending' | 'confirmed' | 'notified' | 'disputed' | 'paid' | 'dismissed' | 'all';
type Action = 'confirm' | 'dismiss' | 'needs-review' | 'notify';

const FILTERS: [Filter, string][] = [
  ['pending', 'Chờ xử lý (mới và cần xác minh)'],
  ['confirmed', 'Đã xác nhận, chờ gửi thông báo'],
  ['notified', 'Đã thông báo'],
  ['disputed', 'Đang khiếu nại'],
  ['paid', 'Đã nộp phạt'],
  ['dismissed', 'Đã gỡ'],
  ['all', 'Tất cả'],
];
const PAGE_SIZE = 50;
const PENDING_LIMIT = 100;   // "Chờ xử lý" gộp hai trạng thái, mỗi trạng thái lấy tối đa 100 mục
const CAMERA_ID = 'CAM-HX-001';

interface Props {
  api: Api;
  tick: number;
  onChanged: () => void;
}

interface Flash {
  ok: boolean;
  text: string;
}

const SUCCESS_TEXT: Record<Action, (status?: string) => string> = {
  confirm: status => (status === 'notified' ? 'Đã xác nhận và gửi thông báo cho chủ xe.' : 'Đã xác nhận vi phạm.'),
  dismiss: () => 'Đã gỡ vi phạm.',
  'needs-review': () => 'Đã chuyển sang cần xác minh.',
  notify: () => 'Đã gửi thông báo cho chủ xe.',
};

export function ViolationsTab({ api, tick, onChanged }: Props) {
  const [camOk, setCamOk] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OfficerViolation[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (filter === 'pending') {
          const [fresh, review] = await Promise.all(['new', 'needs_review'].map(s =>
            api.get<Page<OfficerViolation>>(`/officer/violations?status=${s}&page_size=${PENDING_LIMIT}`)));
          if (!alive) return;
          setItems([...fresh.items, ...review.items].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
          setTotal(fresh.total + review.total);
        } else {
          const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
          if (filter !== 'all') qs.set('status', filter);
          const r = await api.get<Page<OfficerViolation>>(`/officer/violations?${qs}`);
          if (!alive) return;
          setItems(r.items);
          setTotal(r.total);
        }
        setLoadError('');
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      }
    };
    load();
    return () => { alive = false; };
  }, [api, filter, page, tick]);

  const act = async (v: OfficerViolation, action: Action, note: string) => {
    setBusyId(v.id);
    setFlash(null);
    try {
      const r = await api.post<{ status: string }>(`/officer/violations/${v.id}/${action}`, { note });
      setFlash({ ok: true, text: SUCCESS_TEXT[action](r.status) });
      onChanged();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const pages = filter === 'pending' ? 1 : pageCount(total, PAGE_SIZE);

  return (
    <section className="panel" aria-label="Danh sách vi phạm">
      <div className="cam-row">
        <figure className="cam">
          {camOk ? (
            <img
              src={`${streamUrl(CAMERA_ID)}?v=${tick}`}
              alt="Hình ảnh camera Hàng Xanh"
              onLoad={() => setCamOk(true)}
              onError={() => setCamOk(false)}
            />
          ) : (
            <div className="cam-off">Chưa có hình ảnh từ camera này</div>
          )}
          <figcaption>Camera {CAMERA_ID}</figcaption>
        </figure>
        <div className="toolbar">
          <label>Lọc theo trạng thái
            <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setPage(1); }}>
              {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <p className="count">Có {total} vi phạm{filter === 'pending' && total > items.length ? `, đang hiện ${items.length} mục` : ''}.</p>
        </div>
      </div>

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã</th><th>Biển số</th><th>Lỗi</th><th>Thời gian</th><th>Nút</th>
              <th>Mức phạt</th><th>Trạng thái</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id}>
                <td className="mono">{v.id}</td>
                <td>
                  <span className="mono">{v.plate}</span>
                  {v.priority_flag && (
                    <span className="badge warn" title={v.priority_reason ?? undefined}>Nghi nhường xe ưu tiên</span>
                  )}
                </td>
                <td>{violationLabel(v.violation_code)}</td>
                <td>{formatDateTime(v.occurred_at)}</td>
                <td>{v.node_id}</td>
                <td>{formatPenalty(v.penalty)}</td>
                <td><span className={`badge s-${v.status}`}>{violationStatusLabel(v.status)}</span></td>
                <td className="actions">
                  {(v.status === 'new' || v.status === 'needs_review') && (
                    <>
                      <button type="button" disabled={busyId === v.id} onClick={() => act(v, 'confirm', 'xác nhận')}>Xác nhận</button>
                      <button type="button" className="danger" disabled={busyId === v.id} onClick={() => act(v, 'dismiss', 'gỡ')}>Gỡ</button>
                    </>
                  )}
                  {v.status === 'new' && (
                    <button type="button" className="ghost" disabled={busyId === v.id} onClick={() => act(v, 'needs-review', 'cần xác minh')}>Cần xác minh</button>
                  )}
                  {v.status === 'confirmed' && (
                    <button type="button" disabled={busyId === v.id} onClick={() => act(v, 'notify', 'gửi thông báo cho chủ xe')}>Gửi thông báo</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loadError && (
              <tr><td colSpan={8} className="empty">Không có vi phạm nào trong bộ lọc này.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pages={pages} onChange={setPage} />
    </section>
  );
}
