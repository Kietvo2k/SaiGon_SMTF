// Danh sách camera giao lộ để chọn trình chiếu trên web công an.
// Nguồn: GET /officer/streams (mỗi mục có camera_id, url, label).
import { displayNodeLabel } from './labels';

export interface CameraStream {
  camera_id?: string;
  label?: string;
  junction_id?: string | null;
  node_id?: string | null;
  active?: boolean;
}

export interface CameraOption {
  value: string;
  label: string;   // "CAM-HX-001 · Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng Điện Biên Phủ"
}

export interface GroupedCameraOption extends CameraOption {
  junction: string;
  direction: string;
}

export interface CameraJunctionGroup {
  junction: string;
  items: GroupedCameraOption[];
}

export interface CameraJunctionCount {
  junction: string;
  count: number;
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

function parseCameraMeta(stream: CameraStream): { junction: string; direction: string } {
  const rawLabel = (stream.label ?? '').trim();
  const fallbackJunction = displayNodeLabel(stream.junction_id || stream.node_id || '').trim();
  if (!rawLabel) {
    return { junction: fallbackJunction || 'Nút khác', direction: '' };
  }
  const parts = rawLabel.split(/\s*·\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      junction: displayNodeLabel(parts[0]),
      direction: displayNodeLabel(parts.slice(1).join(' · ')),
    };
  }
  if (fallbackJunction) {
    return { junction: fallbackJunction, direction: displayNodeLabel(rawLabel) };
  }
  return { junction: displayNodeLabel(rawLabel), direction: '' };
}

export function cameraGroups(streams: CameraStream[] | null | undefined): CameraJunctionGroup[] {
  const seen = new Set<string>();
  const byJunction = new Map<string, GroupedCameraOption[]>();
  for (const s of streams || []) {
    const id = (s && s.camera_id ? String(s.camera_id) : '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const { junction, direction } = parseCameraMeta(s);
    const label = s.label ? `${id} · ${displayNodeLabel(s.label)}` : id;
    const item: GroupedCameraOption = { value: id, label, junction, direction };
    const list = byJunction.get(junction);
    if (list) list.push(item);
    else byJunction.set(junction, [item]);
  }
  return Array.from(byJunction, ([junction, items]) => ({ junction, items }));
}

export function cameraJunctions(streams: CameraStream[] | null | undefined): CameraJunctionCount[] {
  return cameraGroups(streams).map(group => ({
    junction: group.junction,
    count: group.items.length,
  }));
}

export function filterCamerasByJunction(
  groups: CameraJunctionGroup[],
  junction: string,
): GroupedCameraOption[] {
  if (!junction) return groups.flatMap(g => g.items);
  return groups.find(g => g.junction === junction)?.items ?? [];
}
