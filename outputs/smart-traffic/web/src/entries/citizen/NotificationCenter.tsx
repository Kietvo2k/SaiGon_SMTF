import { useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { NotificationPage } from '../../lib/types';

interface Props {
  api: Api;
  tick: number;
  onChanged: () => void;
}

const PAGE_SIZE = 50;

// Chuông thông báo: số chưa đọc luôn hiện; bấm để mở danh sách. Làm mới khi có sự kiện WebSocket (tick).
export function NotificationCenter({ api, tick, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get<NotificationPage>(`/citizen/notifications?page_size=${PAGE_SIZE}`)
      .then(r => {
        if (!alive) return;
        setData(r);
        setError('');
      })
      .catch(e => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, tick]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.post('/citizen/notifications/read', { ids });
      setError('');
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const unread = data?.unread ?? 0;
  const unreadIds = (data?.items ?? []).filter(n => !n.read_at).map(n => n.id);

  return (
    <section className="card notify" aria-label="Thông báo">
      <button
        type="button"
        className="bell"
        aria-expanded={open}
        aria-controls="notify-list"
        onClick={() => setOpen(o => !o)}
      >
        Thông báo
        {unread > 0 && <span className="dot" aria-label={`${unread} thông báo chưa đọc`}>{unread}</span>}
      </button>

      {open && (
        <div id="notify-list" className="notify-body">
          {data && data.items.length === 0 && <p className="hint">Chưa có thông báo nào.</p>}
          {unreadIds.length > 0 && (
            <button type="button" className="ghost" disabled={busy} onClick={() => markRead(unreadIds)}>
              Đánh dấu tất cả đã đọc
            </button>
          )}
          <ul className="list">
            {(data?.items ?? []).map(n => (
              <li key={n.id} className={n.read_at ? 'item' : 'item unread'}>
                <div className="item-head">
                  <b>{n.title}</b>
                  {!n.read_at && <span className="badge new">Mới</span>}
                </div>
                <p>{n.body}</p>
                <p className="meta">
                  {formatDateTime(n.created_at)}{n.violation_id ? ` · Vi phạm ${n.violation_id}` : ''}
                </p>
                {!n.read_at && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => markRead([n.id])}>
                    Đánh dấu đã đọc
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
