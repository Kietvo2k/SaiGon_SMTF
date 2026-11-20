// Danh sách camera giao lộ để chọn trình chiếu trên web công an.
// Nguồn: GET /officer/streams (mỗi mục có camera_id, url, label).

export interface CameraStream {
  camera_id?: string;
  label?: string;
  active?: boolean;
}

export interface CameraOption {
  value: string;
  label: string;   // "CAM-HX-001 · Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng Điện Biên Phủ"
}

export function cameraOptions(streams: CameraStream[] | null | undefined): CameraOption[] {
  const seen = new Set<string>();
  const out: CameraOption[] = [];
  for (const s of streams || []) {
    const id = (s && s.camera_id ? String(s.camera_id) : '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ value: id, label: s.label ? `${id} · ${s.label}` : id });
  }
  return out;
}

export type CameraGridSize = 1 | 4 | 9;

export function cameraDefault(streams: CameraStream[] | null | undefined): string | null {
  const opts = cameraOptions(streams);
  return opts.length > 0 ? opts[0].value : null;
}

export function cameraGridSlice<T>(items: T[], gridSize: CameraGridSize, page: number): {
  page: number;
  totalPages: number;
  items: T[];
} {
  const totalPages = Math.max(1, Math.ceil(items.length / gridSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (safePage - 1) * gridSize;
  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + gridSize),
  };
}

export function cameraPageForId<T extends { value: string }>(items: T[], id: string, gridSize: CameraGridSize): number {
  const idx = items.findIndex(item => item.value === id);
  return idx >= 0 ? Math.floor(idx / gridSize) + 1 : 1;
}
