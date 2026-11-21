import { formatDateTime, formatPenalty } from '../../lib/format';
import { violationStatusLabel, violationStatusTone } from '../../lib/labels';
import type { CitizenRecord } from './citizenApi';
import { CameraIcon, ChevronRightIcon } from './icons';
import { citizenPenaltyContext } from './penalty';
import { PlateChip } from './PlateChip';
import { StatusTrack } from './StatusTrack';

interface Props {
  record: CitizenRecord;
  onOpen: () => void;
}

export function RecordCard({ record, onOpen }: Props) {
  const tone = violationStatusTone(record.status);
  const context = citizenPenaltyContext(record.penalty);
  const uncertain = record.status === 'needs_review' || record.status === 'pending';

  return (
    <article className={`cz-record cz-tone-${tone}`} aria-labelledby="record-title">
      <div className="cz-record-top">
        <div className="cz-record-identity">
          <p className="cz-kicker">Hồ sơ mới nhất</p>
          <PlateChip plate={record.plate} size="lg" />
        </div>
        <span className={`cz-status cz-status-${tone}`}>
          <span className="cz-status-dot" aria-hidden="true" />
          {violationStatusLabel(record.status)}
        </span>
      </div>

      <h3 className="cz-record-title" id="record-title">{record.label}</h3>

      <dl className="cz-facts">
        <div>
          <dt>Thời gian</dt>
          <dd>{formatDateTime(record.occurredAt)}</dd>
        </div>
        <div>
          <dt>Địa điểm</dt>
          <dd>{record.place || 'Chưa có thông tin nút giao'}</dd>
        </div>
        <div>
          <dt>Mức phạt</dt>
          <dd className={record.penalty.verified ? '' : 'is-muted'}>{formatPenalty(record.penalty)}</dd>
          {context && <dd className="cz-fact-note">{context}</dd>}
          {uncertain && <dd className="cz-fact-note">Hồ sơ chưa chốt, mức phạt có thể thay đổi.</dd>}
        </div>
        <div>
          <dt>Camera</dt>
          <dd className="cz-evidence-fact">
            <CameraIcon width={17} height={17} />
            {record.cameraId || 'Chưa có thông tin camera'}
          </dd>
        </div>
      </dl>

      {record.priorityFlag && (
        <p className="cz-priority">
          <strong>Nghi nhường xe ưu tiên.</strong> {record.priorityReason || 'Cán bộ sẽ xem lại trước khi kết luận.'}
        </p>
      )}

      <StatusTrack status={record.status} />

      <div className="cz-record-foot">
        <p className="cz-record-hint">
          {record.code && <span className="cz-code">{record.code}</span>}
          {record.cameraId && <span>Camera {record.cameraId}</span>}
        </p>
        <button type="button" className="cz-btn cz-btn-primary" onClick={onOpen}>
          Xem chi tiết &amp; bằng chứng
          <ChevronRightIcon width={18} height={18} />
        </button>
      </div>
    </article>
  );
}
