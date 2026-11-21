import { useMemo, useState } from 'react';
import type { DemoCamera } from '../api';
import type { StationEvent } from '../../../lib/events';
import { useNow } from './hooks';
import {
  eventCameraId, eventCategoryLabel, eventKey, eventMeta, formatClock, formatDateTime, formatRelativeTime,
  type DemoNodeMapEntry, type EventCategory,
} from './ops-model';

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Nghiêm trọng',
  warning: 'Cảnh báo',
  info: 'Thông tin',
  resolved: 'Đã xử lý',
};

const FILTERS: { value: 'all' | EventCategory; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'incident', label: 'Sự cố' },
  { value: 'violation', label: 'Vi phạm' },
  { value: 'control', label: 'Điều khiển' },
];

export function EventFeed({ events, cameras, nodes, handled, onViewCamera, onToggleHandled }: {
  events: StationEvent[];
  cameras: DemoCamera[];
  nodes: DemoNodeMapEntry[] | null;
  handled: Set<string>;
  onViewCamera: (cameraId: string) => void;
  onToggleHandled: (key: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | EventCategory>('all');
  const now = useNow(5_000);
  const ordered = useMemo(() => [...events].sort((left, right) => right.at - left.at), [events]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: ordered.length, incident: 0, violation: 0, control: 0 };
    for (const event of ordered) result[eventMeta(event).category] += 1;
    return result;
  }, [ordered]);
  const visible = filter === 'all' ? ordered : ordered.filter(event => eventMeta(event).category === filter);

  return <section className="ops-panel ops-feed" aria-labelledby="ops-feed-title">
    <header className="ops-panel-head ops-feed-head">
      <div>
        <p className="ops-eyebrow">LUỒNG SỰ KIỆN · TRẠM 3D</p>
        <h2 id="ops-feed-title">Tín hiệu hiện trường</h2>
      </div>
      <span className="ops-count-pill" aria-label={`${ordered.length} sự kiện trong phiên`}>{ordered.length} sự kiện</span>
    </header>

    <div className="ops-feed-filters" role="group" aria-label="Lọc sự kiện">
      {FILTERS.map(item => <button key={item.value} type="button" className={`ops-chip${filter === item.value ? ' is-active' : ''}`}
        aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
        {item.label} <span>{counts[item.value] ?? 0}</span>
      </button>)}
    </div>

    {visible.length
      ? <ol className="ops-feed-list" role="log" aria-live="polite" aria-relevant="additions" aria-label="Sự kiện từ trạm 3D">
          {visible.map(event => {
            const key = eventKey(event);
            const meta = eventMeta(event);
            const cameraId = eventCameraId(event, cameras, nodes);
            const isHandled = handled.has(key);
            return <li key={key} className={`ops-event ops-event-${meta.severity}${isHandled ? ' is-handled' : ''}`}>
              <div className="ops-event-top">
                <time dateTime={new Date(event.at).toISOString()} title={formatDateTime(event.at)}>{formatClock(event.at)}</time>
                <span className="ops-event-relative">{formatRelativeTime(event.at, now)}</span>
                <span className={`ops-severity ops-severity-${meta.severity}`}>{SEVERITY_LABELS[meta.severity]}</span>
              </div>
              <p className="ops-event-category">{eventCategoryLabel(meta.category)}</p>
              <h3>{meta.title}</h3>
              <p className="ops-event-detail">{meta.detail}</p>
              <div className="ops-event-actions">
                <button type="button" className="ops-button ops-button-small" onClick={() => cameraId && onViewCamera(cameraId)}
                  disabled={!cameraId} title={cameraId ? `Chọn ${cameraId} và mở khung lớn` : 'Sự kiện không kèm camera; không tự đoán camera.'}>
                  Xem camera
                </button>
                <button type="button" className={`ops-button ops-button-small ops-button-ghost${isHandled ? ' is-active' : ''}`}
                  aria-pressed={isHandled} onClick={() => onToggleHandled(key)}
                  title="Chỉ đánh dấu trong phiên này; không ghi trạng thái lên server.">
                  {isHandled ? 'Đã đánh dấu' : 'Đã xử lý'}
                </button>
              </div>
              {!cameraId && <p className="ops-event-hint">Không suy ra camera cho tín hiệu này.</p>}
              {isHandled && <p className="ops-event-handled">Đã đánh dấu trên phiên này · không gửi lên server.</p>}
            </li>;
          })}
        </ol>
      : ordered.length
        ? <div className="ops-empty ops-empty-inline" role="status"><strong>Không có sự kiện thuộc nhóm này</strong><span>Chọn “Tất cả” để xem {ordered.length} sự kiện đã nhận.</span></div>
        : <div className="ops-feed-empty">
            <span className="ops-feed-empty-mark" aria-hidden="true" />
            <strong>Chưa có tín hiệu từ trạm 3D</strong>
            <p>Bảng này chỉ hiển thị sự kiện thật phát qua kênh cùng origin. Mở trạm 3D, chạy kịch bản va chạm hoặc dùng bàn cưỡng chế (ghim đèn, bơm xe, triệu hồi xe ưu tiên) để tín hiệu xuất hiện.</p>
            <a className="ops-link-button" href="/hcmc-poc/">Mở trạm 3D</a>
          </div>}
  </section>;
}
