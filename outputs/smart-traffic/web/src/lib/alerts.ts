// Chữ hiển thị cho cảnh báo kẹt (M4c). Hàm thuần, có test; không gọi mạng.
import { LEVEL_LABELS, HeatAlert } from './heat';

// Bản công khai từ GET /public/alerts: chỉ tên đường, mức, xác suất làm tròn và số phút.
export interface PublicAlert {
  name: string;
  level: number;
  level_label: string;
  prob_pct: number;
  horizon_min: number;
}

export interface PublicAlertsView {
  items: PublicAlert[];
  total: number;
  updated_at: string | null;
}

// Gom các đoạn cùng đường/thời hạn; khóa UI không phụ thuộc xác suất thay đổi.
export function groupPublicAlerts(items: PublicAlert[]): PublicAlert[] {
  const groups = new Map<string, PublicAlert>();
  for (const item of items) {
    const key = JSON.stringify([item.name, item.horizon_min]);
    const previous = groups.get(key);
    if (!previous || item.prob_pct > previous.prob_pct ||
      (item.prob_pct === previous.prob_pct && item.level > previous.level)) groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => b.prob_pct - a.prob_pct || a.horizon_min - b.horizon_min);
}

export function probPercent(prob: number): number {
  return Math.round(Math.min(1, Math.max(0, prob)) * 100);
}

export function horizonText(minutes: number): string {
  return `sau khoảng ${Math.round(minutes)} phút`;
}

export function levelLabel(band: number): string {
  const i = Math.min(LEVEL_LABELS.length - 1, Math.max(0, Math.floor(band)));
  return LEVEL_LABELS[i];
}

// Chi tiết cho cán bộ: xác suất, độ tin cậy, thời gian.
export function alertDetail(a: HeatAlert): string {
  return `khả năng kẹt ${probPercent(a.prob)}%, độ tin cậy ${probPercent(a.reliability)}%, ${horizonText(a.horizon_min)}`;
}

// Dòng tóm tắt cho cán bộ: tên đường kèm chi tiết.
export function alertSummary(a: HeatAlert): string {
  return `${a.name}: ${alertDetail(a)}`;
}

// Dòng cho người dân: tên đường, mức, xác suất, thời gian (không có số liệu nội bộ).
export function publicAlertSummary(a: PublicAlert): string {
  return `${a.name}: mức hiện tại ${a.level_label.toLowerCase()}, khả năng kẹt ${a.prob_pct}%, ${horizonText(a.horizon_min)}`;
}
