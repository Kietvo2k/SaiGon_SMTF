import { normalizeLookupPlate } from '../../lib/lookup';

export interface DemoRecord {
  plate: string;
  summary: string;
  status: string;
  occurredAt?: string | null;
  code?: string;
  violationLabel?: string;
  vehicleClass?: 'car' | 'motorbike' | null;
  junctionId?: string;
  cameraId?: string;
  direction?: string;
  penaltyAmountMin?: number;
  penaltyAmountMax?: number;
  penaltyPoints?: number;
  penaltySource?: string;
  priorityFlag?: boolean;
  priorityReason?: string | null;
  [key: string]: unknown;
}

export type DemoEvidenceKind = 'before' | 'after' | 'plate';

export interface DemoEvidence {
  kind: DemoEvidenceKind;
  url: string;
}

export interface DemoRecordDetail extends DemoRecord {
  evidence: DemoEvidence[];
}

export interface DemoTimelineAuditEntry {
  action: 'confirm' | 'dismiss' | 'needs_review' | 'complaint';
  note: string | null;
  at: string;
}

export interface DemoTimelineComplaint {
  id: number;
  kind: 'priority_yield' | 'wrong_plate' | 'other';
  note: string | null;
  status: 'open' | 'accepted' | 'rejected';
  created_at: string;
}

export interface DemoTimeline {
  plate: string;
  status: string;
  occurredAt: string | null;
  audit: DemoTimelineAuditEntry[];
  complaints: DemoTimelineComplaint[];
}

export type DemoDecisionAction = 'confirm' | 'dismiss' | 'needs_review';
export type DemoComplaintKind = 'priority_yield' | 'wrong_plate' | 'other';

export interface DemoKpi {
  source: 'sample' | 'live';
  wait_avg_s: number;
  queue_max: number;
  flow_per_node_min: number;
  [key: string]: unknown;
}

export interface DemoCamera {
  cameraId: string;
  junctionId: string;
  label: string;
}

export interface DemoOfficerSnapshot {
  kpi: DemoKpi;
  records: DemoRecord[];
  cameras: DemoCamera[];
}

export interface DemoCameraFrame extends DemoCamera {
  source: 'sample' | 'live' | 'missing';
  frameId: string;
  capturedAt: string | null;
  imageUrl: string | null;
}

export interface DemoLookup {
  plate: string;
  records: DemoRecord[];
}

export class DemoApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = 'DemoApiError';
  }
}

export type DemoFetch = typeof fetch;

export function resolveApiUrl(path: string): string {
  return path.startsWith('/api/demo/') ? path : '/api/demo/';
}

async function jsonRequest<T>(url: string, init: RequestInit, fetcher: DemoFetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(resolveApiUrl(url), { credentials: 'include', ...init });
  } catch {
    throw new DemoApiError('Không kết nối được dịch vụ. Thử lại sau.', 'DATA_UNAVAILABLE', 503);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    throw new DemoApiError(
      typeof error?.message === 'string' ? error.message : 'Dịch vụ dữ liệu tạm thời không sẵn sàng.',
      typeof error?.code === 'string' ? error.code : response.status === 401 ? 'SESSION_REQUIRED' : 'DATA_UNAVAILABLE',
      response.status,
    );
  }
  return payload as T;
}

export async function startDemoSession(fetcher: DemoFetch = fetch): Promise<void> {
  await jsonRequest<{ ok: true }>('/api/demo/session', { method: 'POST' }, fetcher);
}

export function getOfficerSnapshot(fetcher: DemoFetch = fetch, signal?: AbortSignal): Promise<DemoOfficerSnapshot> {
  return jsonRequest('/api/demo/officer', { method: 'GET', signal }, fetcher);
}

export async function lookupPlate(raw: string, fetcher: DemoFetch = fetch): Promise<DemoLookup> {
  const normalized = normalizeLookupPlate(raw);
  if (!normalized) throw new DemoApiError('Biển số chưa đúng định dạng. Kiểm tra và thử lại.', 'INVALID_PLATE', 400);
  return jsonRequest(`/api/demo/lookup?plate=${encodeURIComponent(normalized.plate)}`, { method: 'GET' }, fetcher);
}

export function requestCamera(camera: DemoCamera, fetcher: DemoFetch = fetch, signal?: AbortSignal): Promise<DemoCameraFrame> {
  const query = new URLSearchParams({ cameraId: camera.cameraId });
  return jsonRequest<DemoCameraFrame>(`/api/demo/camera?${query}`, { method: 'GET', signal }, fetcher)
    .then(frame => {
      if (frame.cameraId !== camera.cameraId || frame.junctionId !== camera.junctionId) {
        throw new DemoApiError('Thông tin ảnh không khớp camera đang chọn.', 'CAMERA_ID_MISMATCH', 502);
      }
      return frame;
    });
}

// submit-v2: hồ sơ chi tiết (kèm đường dẫn bằng chứng), dòng thời gian, duyệt và khiếu nại.
export function getRecordDetail(plate: string, fetcher: DemoFetch = fetch, signal?: AbortSignal): Promise<DemoRecordDetail> {
  return jsonRequest(`/api/demo/record?plate=${encodeURIComponent(plate)}`, { method: 'GET', signal }, fetcher);
}

export function getTimeline(plate: string, fetcher: DemoFetch = fetch, signal?: AbortSignal): Promise<DemoTimeline> {
  return jsonRequest(`/api/demo/timeline?plate=${encodeURIComponent(plate)}`, { method: 'GET', signal }, fetcher);
}

export function postDecision(plate: string, action: DemoDecisionAction, note: string, fetcher: DemoFetch = fetch): Promise<{ ok: true; plate: string; status: string }> {
  return jsonRequest('/api/demo/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, action, note })
  }, fetcher);
}

export function postComplaint(plate: string, kind: DemoComplaintKind, note: string, fetcher: DemoFetch = fetch): Promise<{ ok: true; plate: string; status: string }> {
  return jsonRequest('/api/demo/complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, kind, note })
  }, fetcher);
}

export function createRequestEpoch() {
  let latest = 0;
  return {
    issue: () => ++latest,
    isCurrent: (request: number) => request === latest,
    cancel: () => { latest += 1; },
  };
}
