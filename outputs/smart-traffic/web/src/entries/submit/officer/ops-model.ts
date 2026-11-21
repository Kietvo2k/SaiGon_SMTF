import type { DemoCamera, DemoCameraFrame, DemoRecord } from '../api';
import type { StationEvent } from '../../../lib/events';

export type RecordSort = 'newest' | 'oldest' | 'status' | 'plate';
export type CameraSourceFilter = 'all' | 'live' | 'sample' | 'missing' | 'pending';
export type EventCategory = 'incident' | 'violation' | 'control';
export type EventSeverity = 'critical' | 'warning' | 'info' | 'resolved';

export interface DemoNodeMapEntry {
  node_id: string;
  junction_id: string;
  label: string;
  x: number;
  z: number;
  camera_id?: string | null;
}

export interface MapRoadEdge {
  edge: number;
  name: string;
  highway: string;
  coords: [number, number][];
}

export interface MapRoadData {
  bbox: [number, number, number, number];
  nodes: { id: string; x: number; z: number }[];
  edges: MapRoadEdge[];
}

export interface JunctionMarker {
  junctionId: string;
  label: string;
  x: number;
  z: number;
  cameraIds: string[];
}

export interface TrendInfo {
  delta: number | null;
  text: string;
  tone: 'good' | 'bad' | 'flat';
  direction: 'up' | 'down' | 'flat';
  samples: number;
}

export interface EventMeta {
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  detail: string;
}

const NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const CLOCK = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium',
});
const HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23',
});

const STATUS_RANK: Record<string, number> = {
  disputed: 0, needs_review: 1, pending: 2, new: 3, confirmed: 4, notified: 5, paid: 6, dismissed: 7,
};

export const STATUS_FILTER_ORDER = ['new', 'pending', 'needs_review', 'disputed', 'confirmed', 'notified', 'paid', 'dismissed'] as const;

export const SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất trước' },
  { value: 'oldest', label: 'Cũ nhất trước' },
  { value: 'status', label: 'Ưu tiên xử lý' },
  { value: 'plate', label: 'Biển số A–Z' },
];

/** Chuẩn hoá để tìm được cả chữ có dấu, không dấu, biển viết liền và mã nút. */
export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function buildLabelMaps(cameras: DemoCamera[], nodes: DemoNodeMapEntry[] | null): { junctionLabels: Record<string, string>; cameraLabels: Record<string, string> } {
  const junctionLabels: Record<string, string> = {};
  const cameraLabels: Record<string, string> = {};
  for (const node of nodes ?? []) {
    if (!junctionLabels[node.junction_id]) junctionLabels[node.junction_id] = node.label;
  }
  for (const camera of cameras) {
    cameraLabels[camera.cameraId] = camera.label;
    if (!junctionLabels[camera.junctionId]) junctionLabels[camera.junctionId] = camera.label.split(' · ')[0] ?? camera.junctionId;
  }
  return { junctionLabels, cameraLabels };
}

export function recordSearchText(record: DemoRecord, maps?: { junctionLabels: Record<string, string>; cameraLabels: Record<string, string> }): string {
  return normalizeKey([
    record.plate, record.summary, record.violationLabel, record.code, record.junctionId,
    record.junctionId ? maps?.junctionLabels[record.junctionId] : '',
    record.cameraId, record.cameraId ? maps?.cameraLabels[record.cameraId] : '',
    record.direction, record.status,
  ].join(' '));
}

export function filterRecords(
  records: DemoRecord[],
  query: string,
  status: string,
  maps?: { junctionLabels: Record<string, string>; cameraLabels: Record<string, string> },
): DemoRecord[] {
  const needle = normalizeKey(query);
  return records.filter(record => {
    if (status !== 'all' && record.status !== status) return false;
    if (!needle) return true;
    return recordSearchText(record, maps).includes(needle);
  });
}

const occurred = (record: DemoRecord): number => {
  const value = Date.parse(record.occurredAt ?? '');
  return Number.isFinite(value) ? value : 0;
};

export function sortRecords(records: DemoRecord[], sort: RecordSort): DemoRecord[] {
  const copy = [...records];
  copy.sort((left, right) => {
    if (sort === 'newest') return occurred(right) - occurred(left);
    if (sort === 'oldest') return occurred(left) - occurred(right);
    if (sort === 'plate') return left.plate.localeCompare(right.plate, 'vi');
    const rank = (STATUS_RANK[left.status] ?? 9) - (STATUS_RANK[right.status] ?? 9);
    return rank || occurred(right) - occurred(left);
  });
  return copy;
}

export function statusCounts(records: DemoRecord[]): { status: string; count: number }[] {
  return STATUS_FILTER_ORDER.map(status => ({ status, count: records.filter(record => record.status === status).length }));
}

export function openRecordCount(records: DemoRecord[]): number {
  return records.filter(record => ['new', 'pending', 'needs_review', 'disputed'].includes(record.status)).length;
}

export function paginateRecords(records: DemoRecord[], page: number, pageSize: number) {
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: records.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(total, start + pageSize),
  };
}

export function formatClock(value: Date | number): string {
  return CLOCK.format(value instanceof Date ? value : new Date(value));
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : '—';
}

export function formatRelativeTime(value: string | number | null | undefined, now = Date.now()): string {
  if (value == null) return '—';
  const at = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(at)) return '—';
  const diff = Math.max(0, now - at);
  if (diff < 5_000) return 'vừa xong';
  if (diff < 60_000) return `${Math.floor(diff / 1_000)} giây trước`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  return `${Math.floor(diff / 3_600_000)} giờ trước`;
}

export type Shift = { code: 'A' | 'B' | 'C'; label: string; range: string };

/** Ca trực suy ra từ giờ máy, hiển thị kèm ghi chú "theo giờ máy" ở UI. */
export function shiftFor(value: Date = new Date()): Shift {
  const hour = Number(HOUR.format(value));
  if (hour >= 6 && hour < 14) return { code: 'A', label: 'Ca A', range: '06:00–14:00' };
  if (hour >= 14 && hour < 22) return { code: 'B', label: 'Ca B', range: '14:00–22:00' };
  return { code: 'C', label: 'Ca C', range: '22:00–06:00' };
}

export function formatMetric(value: number | null | undefined, unit = ''): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const formatted = NUMBER.format(Number(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

export function trendFor(
  values: (number | null | undefined)[],
  lowerIsBetter: boolean,
  unit: string,
  format: (value: number) => string = value => NUMBER.format(value),
): TrendInfo {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return { delta: null, text: 'chờ mẫu kế tiếp', tone: 'flat', direction: 'flat', samples: clean.length };
  const delta = clean[clean.length - 1] - clean[0];
  if (Math.abs(delta) < 1e-9) return { delta: 0, text: 'không đổi', tone: 'flat', direction: 'flat', samples: clean.length };
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    delta,
    text: `${delta > 0 ? '+' : ''}${format(delta)} ${unit}`.trim(),
    tone: good ? 'good' : 'bad',
    direction: delta > 0 ? 'up' : 'down',
    samples: clean.length,
  };
}

export function sparklinePoints(values: (number | null | undefined)[], width = 120, height = 34, pad = 3): { x: number; y: number }[] {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min;
  return clean.map((value, index) => ({
    x: pad + (index * (width - pad * 2)) / (clean.length - 1),
    y: span < 1e-9 ? height / 2 : height - pad - ((value - min) / span) * (height - pad * 2),
  }));
}

export function sparklinePath(values: (number | null | undefined)[], width = 120, height = 34, pad = 3): string {
  const points = sparklinePoints(values, width, height, pad);
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

export function frameSourceLabel(frame: DemoCameraFrame | undefined): string {
  if (!frame) return 'Đang tải';
  if (frame.source === 'live') return 'Trực tiếp';
  if (frame.source === 'sample') return 'Tệp';
  return 'Mất nguồn';
}

export function isFrameStale(frame: DemoCameraFrame | null | undefined, now = Date.now()): boolean {
  if (!frame || frame.source !== 'live' || !frame.capturedAt) return false;
  const at = Date.parse(frame.capturedAt);
  return Number.isFinite(at) && now - at > 10_000;
}

export function filterCameras(
  cameras: DemoCamera[],
  frames: Record<string, DemoCameraFrame | undefined>,
  query: string,
  junctionId: string,
  source: CameraSourceFilter,
): DemoCamera[] {
  const needle = normalizeKey(query);
  return cameras.filter(camera => {
    if (junctionId !== 'all' && camera.junctionId !== junctionId) return false;
    if (source !== 'all') {
      const frame = frames[camera.cameraId];
      if (source === 'pending' ? frame != null : frame?.source !== source) return false;
    }
    if (!needle) return true;
    return normalizeKey(`${camera.cameraId} ${camera.junctionId} ${camera.label}`).includes(needle);
  });
}

export function uniqueJunctions(cameras: DemoCamera[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const camera of cameras) counts.set(camera.junctionId, (counts.get(camera.junctionId) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function buildJunctionMarkers(cameras: DemoCamera[], nodes: DemoNodeMapEntry[] | null): JunctionMarker[] {
  const markers = new Map<string, JunctionMarker>();
  for (const node of nodes ?? []) {
    if (!markers.has(node.junction_id)) {
      markers.set(node.junction_id, { junctionId: node.junction_id, label: node.label, x: node.x, z: node.z, cameraIds: [] });
    }
  }
  for (const camera of cameras) {
    const marker = markers.get(camera.junctionId);
    if (marker && !marker.cameraIds.includes(camera.cameraId)) marker.cameraIds.push(camera.cameraId);
  }
  return [...markers.values()].sort((a, b) => a.junctionId.localeCompare(b.junctionId, 'en'));
}

export function eventKey(event: StationEvent): string {
  switch (event.type) {
    case 'incident': return `incident:${event.node}:${event.lane}:${event.status}:${event.at}`;
    case 'violation': return `violation:${event.cameraId}:${event.plate}:${event.code}:${event.at}`;
    case 'pin': return `pin:${event.node}:${event.group}:${event.at}`;
    case 'spawn': return `spawn:${event.count}:${event.at}`;
    case 'ambulance': return `ambulance:${event.kind}:${event.at}`;
  }
}

const EMERGENCY_LABELS: Record<string, string> = {
  ambulance: 'xe cứu thương',
  fire: 'xe cứu hỏa',
  police: 'xe công an',
};

export function eventMeta(event: StationEvent): EventMeta {
  switch (event.type) {
    case 'incident':
      return event.status === 'before'
        ? { category: 'incident', severity: 'critical', title: 'Va chạm chặn làn', detail: `${event.node} · ${event.lane}. Phương án: ${event.plan}` }
        : { category: 'incident', severity: 'resolved', title: 'Đã điều tiết xong', detail: `${event.node} · ${event.lane}. ${event.plan}` };
    case 'violation':
      return {
        category: 'violation',
        severity: 'warning',
        title: `Phát hiện vi phạm: ${event.label}`,
        detail: `Camera ${event.cameraId} · biển ${event.plate}${event.confidence == null ? '' : ` · tin cậy ${Math.round(event.confidence * 100)}%`}`,
      };
    case 'ambulance':
      return {
        category: 'control',
        severity: 'critical',
        title: `Triệu hồi ${EMERGENCY_LABELS[event.kind] ?? event.kind}`,
        detail: 'Xe ưu tiên đang chạy tuyến; trạng thái thực tế xem trên trạm 3D.',
      };
    case 'pin':
      return {
        category: 'control',
        severity: 'info',
        title: `Ghim đèn ${event.node} · nhóm ${event.group}`,
        detail: `Giữ ${event.seconds} giây; thao tác từ bàn cưỡng chế trạm 3D.`,
      };
    case 'spawn':
      return {
        category: 'control',
        severity: 'info',
        title: `Bơm ${event.count} xe vào khu`,
        detail: 'Thao tác từ bàn cưỡng chế trạm 3D.',
      };
  }
}

export function eventCategoryLabel(category: EventCategory): string {
  return category === 'incident' ? 'Sự cố' : category === 'violation' ? 'Vi phạm' : 'Điều khiển';
}

/** Chỉ trả về camera có thật trong danh sách; không đoán camera cho sự kiện không kèm dữ liệu. */
export function eventCameraId(event: StationEvent, cameras: DemoCamera[], nodes: DemoNodeMapEntry[] | null): string | null {
  const exists = (id: string) => cameras.some(camera => camera.cameraId === id);
  if (event.type === 'violation') return exists(event.cameraId) ? event.cameraId : null;
  let junctionId: string | null = null;
  if (event.type === 'incident') junctionId = (nodes ?? []).find(node => node.node_id === event.node)?.junction_id ?? null;
  if (event.type === 'pin') junctionId = event.node;
  if (!junctionId) return null;
  return cameras.find(camera => camera.junctionId === junctionId)?.cameraId ?? null;
}
