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

export function cameraDefault(streams: CameraStream[] | null | undefined): string | null {
  const opts = cameraOptions(streams);
  return opts.length > 0 ? opts[0].value : null;
}
