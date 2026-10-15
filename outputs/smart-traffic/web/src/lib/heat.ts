// Bản đồ nhiệt khu Bắc (M4c): bảng màu 5 nấc chép từ outputs/hcmc-poc/heat-32.js (test heat.test.ts đối chiếu),
// kiểu dữ liệu đường và cảnh báo, hàm đổi mức sang nấc màu.

// Chép nguyên từ HEAT_COLORS_32 của heat-32.js: thấp → cao.
export const HEAT_COLORS_32 = ['#1976d2', '#fbc02d', '#f57c00', '#d32f2f', '#7b1fa2'];

// Nhãn cho từng nấc (nấc 0 = thông thoáng, nấc 4 = kẹt nặng).
export const LEVEL_LABELS = ['Thông thoáng', 'Đông nhẹ', 'Đông', 'Ùn ứ', 'Kẹt nặng'];

// Khoảng mức của từng nấc theo phần trăm, dùng cho chú giải.
export const LEVEL_RANGES = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'];

export const NO_DATA_COLOR = '#b8bec7';

// Nấc màu 0–4 của một mức 0–1, cùng quy tắc với bandOf trong backend (app/heat.py).
export function bandOf(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(HEAT_COLORS_32.length - 1, Math.floor(level * HEAT_COLORS_32.length));
}

// Màu theo mức, giống hệt colorOf() trong heat-32.js.
export function colorOf(level: number): string {
  return HEAT_COLORS_32[bandOf(level)];
}

// Độ dày nét theo cấp đường (px ở mức thu phóng 1). Đường nối (_link) mảnh hơn đường chính.
const WIDTH_BY_HIGHWAY: Record<string, number> = {
  motorway: 5,
  trunk: 4.5,
  primary: 3.8,
  secondary: 3,
  tertiary: 2.4,
};

export function roadWidth(highway: string): number {
  const base = highway.endsWith('_link') ? highway.slice(0, -5) : highway;
  const w = WIDTH_BY_HIGHWAY[base];
  if (w === undefined) return 2;
  return highway.endsWith('_link') ? Math.max(1.6, w - 1) : w;
}

export interface NorthRoad {
  edge: number;
  name: string;
  highway: string;
  coords: [number, number][];
}

export interface NorthRoadsDoc {
  version: string;
  attribution: string;
  bbox: [number, number, number, number];
  nodes: { id: string; x: number; z: number }[];
  edges: NorthRoad[];
}

// Cảnh báo kẹt đầy đủ (cán bộ): cạnh, tên, xác suất 0–1, độ tin cậy 0–1, số phút, mức 0–1, nấc 0–4.
export interface HeatAlert {
  edge: number;
  name: string;
  prob: number;
  reliability: number;
  horizon_min: number;
  level: number;
  band: number;
}

// Dữ liệu bản đồ nhiệt (GET /officer/heat và sự kiện heat.update).
export interface HeatView {
  t_sim: number | null;
  updated_at: string | null;
  stale?: boolean;
  levels: [number, number][];
  alerts: HeatAlert[];
  hourly?: { hour: number; mean_level: number | null; samples: number }[];
  history_count?: number;
}
