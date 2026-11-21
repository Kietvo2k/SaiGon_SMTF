// Cầu nối dữ liệu cho trang công dân. Hai chế độ:
// - public: endpoint công khai của bản Vercel và server QA 8890, dùng dữ liệu công khai chung
// - local: /public/lookup + /citizen/* (FastAPI/SQLite của bản nội bộ)
// Không đổi hợp đồng API, chỉ ánh xạ về một kiểu chung cho giao diện.

import { API_BASE, mediaUrl } from '../../lib/api';
import { complaintKindLabel, complaintStatusLabel, violationLabel } from '../../lib/labels';
import { displayNodeLabel } from '../../lib/labels';
import { normalizeLookupPlate } from '../../lib/lookup';
import type { Penalty } from '../../lib/types';

export type CitizenMode = 'public' | 'local';

export interface CitizenEvidence {
  kind: string;
  url: string;
}

export interface CitizenRecord {
  id: string;
  plate: string;
  code: string;
  label: string;
  status: string;
  occurredAt: string | null;
  place: string | null;
  node: string | null;
  cameraId: string | null;
  direction: string | null;
  summary: string | null;
  penalty: Penalty;
  evidence: CitizenEvidence[];
  priorityFlag: boolean;
  priorityReason: string | null;
}

export interface CitizenLookup {
  plate: string;
  records: CitizenRecord[];
  total: number;
}

export type TimelineTone = 'info' | 'ok' | 'warn' | 'risk' | 'muted';

export interface TimelineEvent {
  id: string;
  at: string | null;
  title: string;
  detail: string | null;
  tone: TimelineTone;
}

export interface CitizenDetail {
  record: CitizenRecord;
  timeline: TimelineEvent[];
  timelineError: string;
  canComplain: boolean;
}

export class CitizenApiError extends Error {
  constructor(message: string, readonly code: string = 'UNKNOWN', readonly status: number = 0) {
    super(message);
    this.name = 'CitizenApiError';
  }
}

export const CITIZEN_REQUEST_TIMEOUT_MS = 12_000;
export const COMPLAINT_NOTE_MAX = 500;

// Chỉ các trạng thái còn mở mới nhận khiếu nại. `dismissed`/`paid` đã kết thúc,
// `disputed` đang chờ xử lý — giữ đúng thông điệp mà giao diện hiển thị.
const COMPLAINABLE_STATUSES = new Set(['new', 'pending', 'needs_review', 'confirmed', 'notified']);

export function citizenCanComplain(status: string, mode: CitizenMode): boolean {
  return mode === 'public' && COMPLAINABLE_STATUSES.has(status);
}

export function complaintNoteError(note: string): string {
  return note.trim() ? '' : 'Vui lòng ghi rõ lý do hoặc thông tin để cán bộ đối chiếu.';
}

/* ------------------------------ kiểu dữ liệu công khai ------------------------------ */

const EVIDENCE_ORDER: Record<string, number> = { before: 0, after: 1, plate: 2, plate_crop: 2 };

export function sortEvidence(items: CitizenEvidence[]): CitizenEvidence[] {
  return [...items].sort((a, b) => (EVIDENCE_ORDER[a.kind] ?? 9) - (EVIDENCE_ORDER[b.kind] ?? 9));
}

interface PublicRecordRow {
  plate: string;
  summary?: string;
  status: string;
  occurredAt?: string | null;
  code?: string;
  violationLabel?: string;
  vehicleClass?: string | null;
  junctionId?: string;
  cameraId?: string;
  direction?: string;
  penaltyAmountMin?: number;
  penaltyAmountMax?: number;
  penaltyPoints?: number;
  penaltySource?: string;
  priorityFlag?: boolean;
  priorityReason?: string | null;
  evidence?: { kind: string; url: string }[];
}

interface PublicTimelineRow {
  plate: string;
  status: string;
  occurredAt: string | null;
  audit?: { action: string; note: string | null; at: string }[];
  complaints?: { id: number; kind: string; note: string | null; status: string; created_at: string }[];
}

interface PublicLookupItem {
  id: string;
  violation_code: string;
  violation_label?: string;
  status: string;
  plate: string;
  occurred_at: string;
  node_label: string | null;
  camera_id: string | null;
  penalty?: Penalty | null;
  evidence?: { kind: string; url: string }[];
}

/* -------------------------------- ánh xạ dữ liệu ------------------------------- */

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function mapPublicRecord(row: PublicRecordRow): CitizenRecord {
  const min = numberOrNull(row.penaltyAmountMin);
  const max = numberOrNull(row.penaltyAmountMax);
  const verified = min !== null && max !== null;
  return {
    id: `${row.plate}|${row.code ?? ''}|${row.occurredAt ?? ''}`,
    plate: row.plate,
    code: row.code ?? '',
    label: row.violationLabel || (row.code ? violationLabel(row.code) : '') || row.summary || 'Vi phạm giao thông',
    status: row.status,
    occurredAt: row.occurredAt ?? null,
    place: row.direction || row.junctionId || null,
    node: row.junctionId ?? null,
    cameraId: row.cameraId ?? null,
    direction: row.direction ?? null,
    summary: row.summary ?? null,
    penalty: {
      vnd_min: min,
      vnd_max: max,
      verified,
      source: row.penaltySource,
      license_deduction_points: numberOrNull(row.penaltyPoints),
    },
    evidence: sortEvidence((row.evidence ?? []).map(item => ({ kind: item.kind, url: item.url }))),
    priorityFlag: Boolean(row.priorityFlag),
    priorityReason: row.priorityReason ?? null,
  };
}

export function mapPublicItem(item: PublicLookupItem): CitizenRecord {
  return {
    id: item.id,
    plate: item.plate,
    code: item.violation_code,
    label: item.violation_label || violationLabel(item.violation_code),
    status: item.status,
    occurredAt: item.occurred_at ?? null,
    place: item.node_label ? displayNodeLabel(item.node_label) : null,
    node: item.node_label ? displayNodeLabel(item.node_label) : null,
    cameraId: item.camera_id ?? null,
    direction: null,
    summary: null,
    penalty: item.penalty ?? { vnd_min: null, vnd_max: null, verified: false },
    evidence: sortEvidence((item.evidence ?? []).map(ev => ({ kind: ev.kind, url: mediaUrl(ev.url) }))),
    priorityFlag: false,
    priorityReason: null,
  };
}

const AUDIT_TITLES: Record<string, { title: string; tone: TimelineTone }> = {
  confirm: { title: 'Cán bộ xác nhận hồ sơ', tone: 'ok' },
  dismiss: { title: 'Cán bộ gỡ hồ sơ', tone: 'muted' },
  needs_review: { title: 'Chuyển hồ sơ sang bước xác minh', tone: 'warn' },
  complaint: { title: 'Công dân gửi khiếu nại', tone: 'risk' },
};

function complaintTone(status: string): TimelineTone {
  if (status === 'accepted' || status === 'resolved') return 'ok';
  if (status === 'rejected') return 'muted';
  return 'risk';
}

function complaintCitizenLabel(status: string): string {
  return complaintStatusLabel(status === 'accepted' ? 'resolved' : status, 'citizen');
}

export function buildPublicTimeline(payload: PublicTimelineRow, record: CitizenRecord): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (payload.occurredAt) {
    events.push({
      id: 'occurred',
      at: payload.occurredAt,
      title: 'Hệ thống ghi nhận vi phạm',
      detail: record.code ? violationLabel(record.code) : record.label,
      tone: 'info',
    });
  }
  const complaints = payload.complaints ?? [];
  for (const [index, audit] of (payload.audit ?? []).entries()) {
    if (audit.action === 'complaint' && complaints.length) continue;
    const meta = AUDIT_TITLES[audit.action] ?? { title: audit.action, tone: 'info' as TimelineTone };
    events.push({
      id: `audit-${index}`,
      at: audit.at,
      title: meta.title,
      detail: audit.note,
      tone: meta.tone,
    });
  }
  for (const complaint of complaints) {
    events.push({
      id: `complaint-${complaint.id}`,
      at: complaint.created_at,
      title: `Khiếu nại: ${complaintKindLabel(complaint.kind)}`,
      detail: [complaint.note, complaintCitizenLabel(complaint.status)].filter(Boolean).join(' · ') || null,
      tone: complaintTone(complaint.status),
    });
  }
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const a = left.event.at ? Date.parse(left.event.at) : Number.POSITIVE_INFINITY;
      const b = right.event.at ? Date.parse(right.event.at) : Number.POSITIVE_INFINITY;
      return a === b ? left.index - right.index : a - b;
    })
    .map(({ event }) => event);
}

/* --------------------------------- gọi mạng ---------------------------------- */

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorText(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const direct = (body as { error?: { message?: unknown } }).error;
    if (direct && typeof direct.message === 'string') return direct.message;
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const nested = (detail as { error?: { message?: unknown } }).error;
      if (nested && typeof nested.message === 'string') return nested.message;
    }
  }
  return fallback;
}

// Gắn timeout cho mọi request và vẫn nhường quyền huỷ cho nơi gọi (đóng drawer, đổi biển).
async function citizenFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const external = init.signal;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let onExternalAbort: (() => void) | null = null;

  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, CITIZEN_REQUEST_TIMEOUT_MS);
    if (external) {
      if (external.aborted) controller.abort();
      else {
        onExternalAbort = () => controller?.abort();
        external.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller?.signal ?? external ?? null,
    });
  } catch {
    if (timedOut) {
      throw new CitizenApiError('Tra cứu quá lâu. Kiểm tra kết nối rồi thử lại.', 'TIMEOUT', 0);
    }
    if (external?.aborted) {
      throw new CitizenApiError('Đã huỷ yêu cầu tra cứu.', 'ABORTED', 0);
    }
    throw new CitizenApiError('Không kết nối được dịch vụ tra cứu. Kiểm tra mạng rồi thử lại.', 'NETWORK', 0);
  } finally {
    if (timer) clearTimeout(timer);
    if (external && onExternalAbort) external.removeEventListener('abort', onExternalAbort);
  }
}

async function publicJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await citizenFetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new CitizenApiError(
      errorText(body, 'Dịch vụ tra cứu tạm thời không sẵn sàng. Vui lòng thử lại.'),
      (body as { error?: { code?: string } } | null)?.error?.code ?? 'DATA_UNAVAILABLE',
      response.status,
    );
  }
  return body as T;
}

async function lookupPublic(plate: string): Promise<CitizenLookup> {
  const body = await publicJson<{ plate?: string; records?: PublicRecordRow[] }>(
    `/api/demo/lookup?plate=${encodeURIComponent(plate)}`,
  );
  const records = (body.records ?? []).map(mapPublicRecord);
  return { plate: body.plate || plate, records, total: records.length };
}

async function lookupLocal(plate: string, vehicleClass: 'car' | 'motorbike'): Promise<CitizenLookup> {
  const query = new URLSearchParams({ plate, vehicle_class: vehicleClass });
  const response = await citizenFetch(`${API_BASE}/public/lookup?${query}`, {
    headers: { Accept: 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new CitizenApiError(
      errorText(body, 'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại.'),
      'LOOKUP_FAILED',
      response.status,
    );
  }
  const items = (body as { items?: PublicLookupItem[] } | null)?.items ?? [];
  const records = items.map(mapPublicItem);
  return { plate, records, total: records.length };
}

export async function lookupCitizen(mode: CitizenMode, raw: string): Promise<CitizenLookup> {
  const normalized = normalizeLookupPlate(raw);
  if (!normalized) {
    throw new CitizenApiError(
      'Biển số chưa đúng định dạng. Ví dụ: 51K-123.45 hoặc 59-X1 234.56.',
      'INVALID_PLATE',
      400,
    );
  }
  return mode === 'public' ? lookupPublic(normalized.plate) : lookupLocal(normalized.plate, normalized.vehicleClass);
}

async function loadPublicDetail(record: CitizenRecord, signal?: AbortSignal): Promise<CitizenDetail> {
  const raw = await publicJson<PublicRecordRow>(`/api/demo/record?plate=${encodeURIComponent(record.plate)}`, { signal });
  const detailed = mapPublicRecord({ ...raw, plate: raw.plate || record.plate });
  if (!detailed.evidence.length && record.evidence.length) detailed.evidence = record.evidence;
  let timeline: TimelineEvent[] = [];
  let timelineError = '';
  try {
    const payload = await publicJson<PublicTimelineRow>(`/api/demo/timeline?plate=${encodeURIComponent(record.plate)}`, { signal });
    timeline = buildPublicTimeline(payload, detailed);
  } catch (error) {
    timelineError = error instanceof Error ? error.message : 'Chưa tải được dòng thời gian.';
  }
  return {
    record: detailed,
    timeline,
    timelineError,
    canComplain: citizenCanComplain(detailed.status, 'public'),
  };
}

export async function loadCitizenDetail(
  mode: CitizenMode,
  record: CitizenRecord,
  signal?: AbortSignal,
): Promise<CitizenDetail> {
  if (mode === 'public') return loadPublicDetail(record, signal);
  return {
    record,
    timeline: [],
    timelineError: '',
    // Bản công khai không có endpoint khiếu nại; người dân đăng nhập để gửi trong hồ sơ của mình.
    canComplain: citizenCanComplain(record.status, 'local'),
  };
}

export interface ComplaintResult {
  status: string;
  message: string;
}

export async function sendCitizenComplaint(
  mode: CitizenMode,
  plate: string,
  kind: string,
  note: string,
): Promise<ComplaintResult> {
  if (mode !== 'public') {
    throw new CitizenApiError('Cần đăng nhập tài khoản công dân để gửi khiếu nại.', 'AUTH_REQUIRED', 401);
  }
  await publicJson('/api/demo/session', { method: 'POST' });
  await publicJson('/api/demo/complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, kind, note: note.trim() || undefined }),
  });
  return {
    status: 'disputed',
    message: 'Đã gửi khiếu nại. Hồ sơ chuyển sang trạng thái đang khiếu nại và chờ cán bộ xử lý.',
  };
}
