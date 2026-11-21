interface Step {
  label: string;
  state: 'done' | 'current' | 'todo' | 'risk';
}

function stepsFor(status: string): Step[] {
  switch (status) {
    case 'paid':
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Xác nhận', state: 'done' },
        { label: 'Thông báo', state: 'done' },
        { label: 'Đã nộp phạt', state: 'current' },
      ];
    case 'notified':
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Xác nhận', state: 'done' },
        { label: 'Thông báo', state: 'current' },
        { label: 'Nộp phạt', state: 'todo' },
      ];
    case 'disputed':
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Xác nhận', state: 'done' },
        { label: 'Khiếu nại', state: 'risk' },
        { label: 'Chờ xử lý', state: 'todo' },
      ];
    case 'needs_review':
    case 'pending':
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Cần xác minh', state: 'current' },
        { label: 'Thông báo', state: 'todo' },
        { label: 'Kết luận', state: 'todo' },
      ];
    case 'dismissed':
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Đã xem xét', state: 'done' },
        { label: 'Gỡ hồ sơ', state: 'current' },
      ];
    default:
      return [
        { label: 'Ghi nhận', state: 'done' },
        { label: 'Xác nhận', state: 'current' },
        { label: 'Thông báo', state: 'todo' },
        { label: 'Nộp phạt', state: 'todo' },
      ];
  }
}

// Tiến trình suy ra từ trạng thái hồ sơ, không bịa mốc thời gian.
export function StatusTrack({ status }: { status: string }) {
  const steps = stepsFor(status);
  return (
    <ol className="cz-track" aria-label="Tiến trình hồ sơ">
      {steps.map(step => (
        <li
          key={step.label}
          className={`cz-track-step is-${step.state}`}
          {...(step.state === 'current' || step.state === 'risk' ? { 'aria-current': 'step' as const } : {})}
        >
          <span className="cz-track-dot" aria-hidden="true" />
          <span className="cz-track-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
