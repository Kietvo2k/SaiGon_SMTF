// Điều khiển thủ công (M6c): nhãn kịch bản, nhãn pha đèn, kiểm tra đầu vào. Hàm thuần, có test; không gọi mạng.

export type ScenarioKey = 'peak-hang-xanh' | 'lane-block' | 'flood-nhc' | 'priority-run';
export type ScenarioChoice = ScenarioKey | 'none';

export const SCENARIO_OPTIONS: { key: ScenarioChoice; label: string; hint: string }[] = [
  { key: 'peak-hang-xanh', label: 'Giờ cao điểm Hàng Xanh', hint: 'Tăng nhu cầu xe quanh nút Hàng Xanh.' },
  { key: 'lane-block', label: 'Sự cố chặn làn', hint: 'Một làn bị chặn, xe phải chuyển làn.' },
  { key: 'flood-nhc', label: 'Ngập Nguyễn Hữu Cảnh', hint: 'Đoạn Nguyễn Hữu Cảnh bị ngập nước.' },
  { key: 'priority-run', label: 'Xe ưu tiên chạy qua', hint: 'Xe ưu tiên đi qua tuyến, xe khác nhường đường.' },
  { key: 'none', label: 'Không (dừng kịch bản đang chạy)', hint: 'Trả hệ thống về vận hành bình thường.' },
];

export function scenarioLabel(key: string | null | undefined): string {
  if (!key) return 'Không có kịch bản';
  return SCENARIO_OPTIONS.find(o => o.key === key)?.label ?? key;
}

export const VMS_TEXT_MAX = 60;
export const OVERRIDE_MIN_S = 5;
export const OVERRIDE_MAX_S = 600;

// Nhãn pha: xanh/vàng kèm nhóm đang được cấp; đỏ là cả hai nhóm dừng.
export function phaseLabel(phase: string | null | undefined, group: number | null | undefined): string {
  if (!phase) return 'Chưa có dữ liệu';
  if (phase === 'red') return 'Đỏ';
  const name = phase === 'green' ? 'Xanh' : phase === 'yellow' ? 'Vàng' : phase;
  return group === null || group === undefined ? name : `${name} (nhóm ${group})`;
}

// Gọn khoảng trắng như phía máy chủ trước khi đếm ký tự (máy chủ còn lọc ký tự điều khiển).
export function normalizeVmsText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// '' nếu hợp lệ; ngược lại là thông báo để hiển thị cạnh ô nhập. Chế độ Tự động bỏ qua nội dung đang nhập.
export function vmsTextError(text: string, mode: 'auto' | 'manual'): string {
  if (mode === 'auto') return '';
  const t = normalizeVmsText(text);
  if (t === '') return 'Chọn Thủ công thì cần nhập nội dung.';
  if (t.length > VMS_TEXT_MAX) return `Nội dung tối đa ${VMS_TEXT_MAX} ký tự.`;
  return '';
}

export function overrideDurationError(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < OVERRIDE_MIN_S || seconds > OVERRIDE_MAX_S) {
    return `Thời gian ghi đè từ ${OVERRIDE_MIN_S} đến ${OVERRIDE_MAX_S} giây.`;
  }
  return '';
}

// Số giây còn lại của một ghi đè (làm tròn lên, không âm); thời điểm không đọc được → 0.
export function remainingSeconds(untilAt: string | null | undefined, nowMs: number): number {
  const end = untilAt ? Date.parse(untilAt) : NaN;
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}
