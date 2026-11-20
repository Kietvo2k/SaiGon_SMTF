// submit-v2 — parse/validate tin BroadcastChannel 'smtf-submit-events' từ trạm 3D.
// Kênh chỉ truyền tín hiệu sống (không mang dữ liệu nghiệp vụ) — đúng hợp đồng bản nộp Vercel.
// Trạm phát 2 loại: incident (va chạm + phương án điều tiết) và violation (khung nhận diện tự động).

export interface IncidentEvent {
  type: 'incident';
  node: string;
  lane: string;
  plan: string;
  status: 'before' | 'after';
  at: number;
}

export interface ViolationEvent {
  type: 'violation';
  code: string;
  label: string;
  plate: string;
  cameraId: string;
  confidence: number | null;
  at: number;
}

export type StationEvent = IncidentEvent | ViolationEvent;

const EVENT_CHANNEL = 'smtf-submit-events';
const str = (value: unknown, max = 160): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length && trimmed.length <= max ? trimmed : null;
};

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export function parseStationEvent(raw: unknown, now = Date.now()): StationEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const at = num(data.at) ?? now;
  if (data.type === 'incident') {
    const node = str(data.node, 40);
    const lane = str(data.lane, 80);
    const plan = str(data.plan, 160);
    const status = data.status === 'before' || data.status === 'after' ? data.status : null;
    if (!node || !lane || !plan || !status) return null;
    return { type: 'incident', node, lane, plan, status, at };
  }
  if (data.type === 'violation') {
    const code = str(data.code, 40);
    const label = str(data.label, 80);
    const plate = str(data.plate, 40);
    const cameraId = str(data.cameraId, 40);
    if (!code || !label || !plate || !cameraId) return null;
    const confidence = num(data.confidence);
    return { type: 'violation', code, label, plate, cameraId, confidence: confidence === null ? null : Math.min(1, Math.max(0, confidence)), at };
  }
  return null;
}

// Nghe kênh sự kiện; trả về hàm bỏ nghe. Không có BroadcastChannel (trình duyệt cũ/test) → không nghe.
export function subscribeStationEvents(onEvent: (event: StationEvent) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(EVENT_CHANNEL);
  channel.onmessage = message => {
    const event = parseStationEvent(message?.data);
    if (event) onEvent(event);
  };
  return () => channel.close();
}
