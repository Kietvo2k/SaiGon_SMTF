import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const cookieName = 'smtf_submit_session';
const sessionSeconds = 8 * 60 * 60;
const maxJpeg = 256 * 1024;
const frameTtl = 10_000;
const bucket = 'smtf-submit-20261120';
const cameraPattern = /^CAM-(?:HX|BAC)-[0-9]{3}$/;
const framePattern = /^[A-Za-z0-9_-]{1,80}$/;
// Vi phạm 3D gửi lên: 1 lần/400 ms/phiên, tối đa 500 bản ghi/phiên, 1 ảnh ≤ 256 KiB.
const liveGapMs = 400;
const liveCap = 500;
const liveMaxImage = 256 * 1024;
const liveGate = new Map();   // session → { at, count } (theo instance serverless; sender cũng tự giãn nhịp)
const liveCodeLabels = {
  'RED-LIGHT': 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
  'WRONG-WAY': 'Đi ngược chiều đường một chiều',
  LANE: 'Đi không đúng phần đường, làn đường',
  SPEED: 'Chạy quá tốc độ quy định',
  PARK: 'Dừng, đỗ xe trái quy định',
  'WRONG-TURN': 'Rẽ, quay đầu nơi có biển cấm',
  'NO-HELMET': 'Không đội mũ bảo hiểm khi điều khiển xe máy',
  OVERLOAD: 'Chở quá số người quy định',
  PHONE: 'Sử dụng điện thoại khi đang lái xe',
  'NO-SEATBELT': 'Không thắt dây đai an toàn khi lái xe',
};

class DemoError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new DemoError(503, 'DATA_UNAVAILABLE', 'Dịch vụ dữ liệu demo tạm thời không khả dụng.');
const notFound = () => new DemoError(404, 'NOT_FOUND', 'Không tìm thấy camera hoặc khung ảnh.');
const invalid = () => new DemoError(400, 'INVALID_INPUT', 'Đầu vào camera hoặc khung ảnh không hợp lệ.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (value, status = 200, headers = {}) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

function sign(text) {
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw unavailable();
  return createHmac('sha256', secret).update(text).digest('base64url');
}

function readSession(request) {
  const value = request.headers.get('cookie')?.split(';')
    .map(part => part.trim()).find(part => part.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  const match = value?.match(/^([a-f0-9-]{36})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  const [, id, expiry, signature] = match;
  if (Number(expiry) <= Date.now() / 1000) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(`${id}.${expiry}`)))) return null;
  return id;
}

function startSession(request, url) {
  if (readSession(request)) return json({ ok: true });
  const expiry = Math.floor(Date.now() / 1000) + sessionSeconds;
  const payload = `${randomUUID()}.${expiry}`;
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'Set-Cookie': `${cookieName}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionSeconds}${secure}`,
  });
}

async function supabase(path, init = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw unavailable();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  if (key.startsWith('eyJ')) headers.set('Authorization', `Bearer ${key}`);
  return fetch(new URL(path, url), { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
}

async function data(path, init) {
  const response = await supabase('/rest/v1/' + path, init);
  if (!response.ok) throw unavailable();
  return response.json();
}

function rpc(name, args) {
  return data('rpc/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

/* ------------------------- vi phạm 3D gửi từ trang public ------------------------- */

// Input tối thiểu từ station 3D; trả bản ghi đã chuẩn hoá hoặc lỗi 400 có mã riêng.
export function validateLiveViolation(input) {
  if (!input || typeof input !== 'object') throw invalid();
  const plate = plateKey(input.plate);
  const code = String(input.code || '').trim().toUpperCase();
  const label = liveCodeLabels[code];
  if (!label) throw new DemoError(400, 'INVALID_CODE', 'Mã vi phạm không thuộc danh mục demo.');
  const at = Date.parse(input.occurredAt);
  if (!Number.isFinite(at) || at < Date.parse('2020-01-01T00:00:00Z') || at > Date.now() + 86_400_000) {
    throw new DemoError(400, 'INVALID_TIME', 'Thời điểm ghi nhận không hợp lệ.');
  }
  const cameraId = input.cameraId == null || input.cameraId === '' ? null : String(input.cameraId);
  if (cameraId && !cameraPattern.test(cameraId)) {
    throw new DemoError(400, 'INVALID_CAMERA', 'Camera không đúng định dạng.');
  }
  const junctionId = typeof input.junctionId === 'string' ? input.junctionId.trim().slice(0, 64) || null : null;
  const direction = typeof input.direction === 'string' ? input.direction.trim().slice(0, 160) || null : null;
  const vehicleClass = ['car', 'motorbike'].includes(input.vehicleClass) ? input.vehicleClass : null;
  const speed = input.speed == null ? null : Number(input.speed);
  if (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 300)) {
    throw new DemoError(400, 'INVALID_SPEED', 'Tốc độ không hợp lệ.');
  }
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new DemoError(400, 'INVALID_CONFIDENCE', 'Độ tin cậy không hợp lệ.');
  }
  return {
    plate, code, label, occurredAt: new Date(at).toISOString(), cameraId, junctionId, direction,
    vehicleClass, speed, confidence,
    status: confidence !== null && confidence >= 0.85 ? 'new' : 'needs_review',
  };
}

// Cửa sổ trượt theo phiên: 'ok' | 'rate' | 'quota'. Hàm thuần để test, không đụng mạng.
export function liveViolationGate(store, session, now, gapMs = liveGapMs, cap = liveCap) {
  const state = store.get(session) || { at: null, count: 0 };
  if (state.count >= cap) return 'quota';
  if (state.at !== null && now - state.at < gapMs) return 'rate';
  store.set(session, { at: now, count: state.count + 1 });
  if (store.size > 1000) {
    for (const [key, value] of store) if (now - value.at > 3_600_000) store.delete(key);
  }
  return 'ok';
}

// 1 ảnh JPEG tuỳ chọn (data URL). Sai định dạng/quá lớn → 400/413; không có → null.
export function parseLiveImage(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !value.startsWith('data:image/jpeg;base64,')) {
    throw new DemoError(400, 'INVALID_IMAGE', 'Ảnh chỉ nhận JPEG dạng data URL.');
  }
  const base64 = value.slice('data:image/jpeg;base64,'.length);
  if (base64.length > Math.ceil(liveMaxImage / 3) * 4 + 8) {
    throw new DemoError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt quá 256 KiB.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 4 || bytes.length > liveMaxImage
      || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new DemoError(400, 'INVALID_IMAGE', 'Ảnh JPEG không hợp lệ.');
  }
  return bytes;
}

const liveFields = 'plate,violation_code,occurred_at,camera_id,junction_id,direction,vehicle_class,status,evidence_path';

// null = bảng chưa được migrate (endpoint dùng đường fallback ghi một hồ sơ mới).
async function liveRows(query) {
  const response = await supabase('/rest/v1/smtf_submit_live_violations?' + query);
  if (response.status === 404) return null;
  if (!response.ok) throw unavailable();
  return response.json();
}

const liveLabel = code => liveCodeLabels[code] || code;
const liveView = row => ({
  plate: row.plate,
  summary: liveLabel(row.violation_code),
  status: row.status,
  occurredAt: row.occurred_at,
  code: row.violation_code,
  violationLabel: liveLabel(row.violation_code),
  ...(row.vehicle_class ? { vehicleClass: row.vehicle_class } : {}),
  ...(row.junction_id ? { junctionId: row.junction_id } : {}),
  ...(row.camera_id ? { cameraId: row.camera_id } : {}),
  ...(row.direction ? { direction: row.direction } : {}),
});

// UI hiện một dòng theo biển: hồ sơ seed thắng; nếu chưa có seed thì lấy vi phạm mới nhất.
async function newestLiveByPlate(plate) {
  const rows = await liveRows(`select=${liveFields}&plate=eq.${encodeURIComponent(plate)}&order=occurred_at.desc&limit=10`);
  return rows || [];
}

async function insertLiveViolation(record, session) {
  const response = await supabase('/rest/v1/smtf_submit_live_violations?on_conflict=plate,violation_code,occurred_at', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({
      plate: record.plate, violation_code: record.code, occurred_at: record.occurredAt,
      camera_id: record.cameraId, junction_id: record.junctionId, direction: record.direction,
      vehicle_class: record.vehicleClass, speed_kmh: record.speed, confidence: record.confidence,
      status: record.status, session_id: session,
    }),
  });
  if (response.status === 404) return { missing: true };
  if (!response.ok) throw unavailable();
  const rows = await response.json();
  return rows.length ? { id: rows[0].id } : { duplicate: true };
}

// Bảng mới chưa có: ghi vào smtf_submit_records CHỈ khi biển chưa tồn tại (không đè hồ sơ seed).
async function insertRecordFallback(record) {
  const existing = await data(`smtf_submit_records?select=plate&plate=eq.${encodeURIComponent(record.plate)}&limit=1`);
  if (existing.length) throw new DemoError(409, 'PLATE_EXISTS', 'Biển số đã có hồ sơ; bản ghi mẫu được giữ nguyên.');
  const response = await supabase('/rest/v1/smtf_submit_records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      plate: record.plate, summary: record.label, status: record.status, occurred_at: record.occurredAt,
      violation_code: record.code, violation_label: record.label, vehicle_class: record.vehicleClass,
      junction_id: record.junctionId, camera_id: record.cameraId, direction: record.direction,
    }),
  });
  if (response.status === 409) throw new DemoError(409, 'PLATE_EXISTS', 'Biển số đã có hồ sơ; bản ghi mẫu được giữ nguyên.');
  if (!response.ok) throw unavailable();
  return { ok: true, mode: 'record' };
}

// Ảnh lỗi không làm hỏng bản ghi: hồ sơ vẫn lưu, chỉ thiếu ảnh.
async function attachLiveImage(id, bytes) {
  const path = `live/${id}.jpg`;
  const upload = await supabase(storagePath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'no-store' },
    body: bytes,
  });
  if (!upload.ok) return null;
  const patch = await supabase(`/rest/v1/smtf_submit_live_violations?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ evidence_path: path }),
  });
  return patch.ok ? path : null;
}

async function saveLiveViolation(request, session) {
  const body = await readJsonBody(request);
  const record = validateLiveViolation(body);
  const verdict = liveViolationGate(liveGate, session, Date.now());
  if (verdict !== 'ok') {
    const message = verdict === 'quota'
      ? 'Phiên này đã ghi đủ 500 vi phạm; tải lại trang để bắt đầu phiên mới.'
      : 'Chờ ít nhất 10 giây giữa hai vi phạm.';
    return json({ error: { code: verdict === 'quota' ? 'SESSION_QUOTA' : 'RATE_LIMIT', message } }, 429,
      verdict === 'quota' ? {} : { 'Retry-After': String(Math.ceil(liveGapMs / 1000)) });
  }
  const image = parseLiveImage(body?.image);
  // Hồ sơ seed là nguồn sự thật: không tạo bản ghi live trùng biển, cũng không sửa hồ sơ mẫu.
  const seeded = await data(`smtf_submit_records?select=plate&plate=eq.${encodeURIComponent(record.plate)}&limit=1`);
  if (seeded.length) return json({ ok: true, mode: 'seed', skipped: true });
  const saved = await insertLiveViolation(record, session);
  if (saved.missing) return json(await insertRecordFallback(record));
  if (saved.duplicate) return json({ ok: true, mode: 'live', duplicate: true });
  if (image) await attachLiveImage(saved.id, image).catch(() => null);
  return json({ ok: true, mode: 'live', id: saved.id });
}

function plateKey(input) {
  const text = input?.trim().toUpperCase();
  const normalized = text && /^[0-9A-Z.\-\s]+$/.test(text)
    ? /^(\d{2})([A-Z]\d?)(\d{3})(\d{2})$/.exec(text.replace(/[.\-\s]/g, ''))
    : null;
  if (!normalized) throw new DemoError(400, 'INVALID_PLATE', 'Biển số không đúng định dạng.');
  const [, province, series, first, last] = normalized;
  if (/^\d{2}-/.test(text) && series.length === 2) return `${province}-${series} ${first}.${last}`;
  return `${province}${series}-${first}.${last}`;
}

const cameraFields = 'camera_id,junction_id,label,sample_path';
const cameraView = row => ({ cameraId: row.camera_id, junctionId: row.junction_id, label: row.label });
// demo-v2: hồ sơ trả thêm trường nghiệp vụ (ngược tương thích — không bỏ trường cũ).
const recordFields = 'plate,summary,status,occurred_at,violation_code,violation_label,vehicle_class,junction_id,camera_id,direction,penalty_amount_min,penalty_amount_max,penalty_points,penalty_source,priority_flag,priority_reason';
const recordView = row => ({
  plate: row.plate, summary: row.summary, status: row.status,
  ...(row.occurred_at ? { occurredAt: row.occurred_at } : {}),
  ...(row.violation_code ? { code: row.violation_code } : {}),
  ...(row.violation_label ? { violationLabel: row.violation_label } : {}),
  ...(row.vehicle_class ? { vehicleClass: row.vehicle_class } : {}),
  ...(row.junction_id ? { junctionId: row.junction_id } : {}),
  ...(row.camera_id ? { cameraId: row.camera_id } : {}),
  ...(row.direction ? { direction: row.direction } : {}),
  ...(Number.isFinite(row.penalty_amount_min) ? { penaltyAmountMin: row.penalty_amount_min } : {}),
  ...(Number.isFinite(row.penalty_amount_max) ? { penaltyAmountMax: row.penalty_amount_max } : {}),
  ...(Number.isFinite(row.penalty_points) ? { penaltyPoints: row.penalty_points } : {}),
  ...(row.penalty_source ? { penaltySource: row.penalty_source } : {}),
  ...(row.priority_flag ? { priorityFlag: true, priorityReason: row.priority_reason || null } : {}),
});
const recordQuery = `smtf_submit_records?select=${recordFields}&order=plate&limit=100`;
const filters = 'select=camera_id,frame_id,captured_at,slot,sha256';

async function findCamera(id) {
  if (!id || !cameraPattern.test(id)) throw invalid();
  const [camera] = await data(`smtf_submit_cameras?select=${cameraFields}&camera_id=eq.${id}&limit=1`);
  if (!camera) throw notFound();
  return camera;
}

async function latestFrame(session, cameraId) {
  const [row] = await data(`smtf_submit_sessions?${filters}&session_id=eq.${session}&camera_id=eq.${cameraId}&limit=1`);
  return row?.frame_id && Date.now() - Date.parse(row.captured_at) <= frameTtl ? row : null;
}

async function describeCamera(camera, live) {
  let frameId = '';
  let source = 'missing';
  if (live) {
    frameId = live.frame_id;
    source = 'live';
  } else if (camera.sample_path) {
    const sample = await supabase(storagePath(camera.sample_path), { method: 'HEAD' });
    if (sample.ok) {
      frameId = 'sample-' + camera.camera_id;
      source = 'sample';
    } else if (sample.status !== 404) {
      throw unavailable();
    }
  }
  return {
    ...cameraView(camera),
    source,
    frameId,
    capturedAt: live?.captured_at ?? null,
    imageUrl: frameId ? '/api/demo/media?' + new URLSearchParams({ cameraId: camera.camera_id, frameId }) : null,
  };
}

function storagePath(path) {
  return `/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function livePath(session, slot) {
  return `live/${session}/${slot}.jpg`;
}

async function media(camera, session, frameId) {
  if (!frameId || !framePattern.test(frameId)) throw invalid();
  let path = camera.sample_path;
  let live = null;
  if (frameId !== 'sample-' + camera.camera_id) {
    live = await latestFrame(session, camera.camera_id);
    if (live?.frame_id !== frameId) throw notFound();
    path = livePath(session, live.slot);
  }
  if (!path) throw notFound();
  const nonce = live ? '?cacheNonce=' + encodeURIComponent(live.sha256) : '';
  const response = await supabase(storagePath(path) + nonce);
  if (response.status === 404) throw notFound();
  if (!response.ok) throw unavailable();
  const bytes = Buffer.from(await response.arrayBuffer());
  // Slot được tái sử dụng, vì vậy ảnh tải về phải có hash đúng của frame được yêu cầu.
  if (live && (Date.now() - Date.parse(live.captured_at) > frameTtl || digest(bytes) !== live.sha256)) throw notFound();
  return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function jpegBody(request) {
  const size = Number(request.headers.get('content-length'));
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg'
      || size > maxJpeg || !request.body) throw invalid();
  const chunks = [];
  let length = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxJpeg) {
        await reader.cancel();
        throw invalid();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, length);
  if (length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw invalid();
  let dimensionsFound = false;
  for (let offset = 2; offset + 3 < length;) {
    if (bytes[offset++] !== 0xff) throw invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > length) throw invalid();
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength >= length) throw invalid();
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (segmentLength < 8) throw invalid();
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (height * width === 0 || height * width > 8_388_608) throw invalid();
      dimensionsFound = true;
    }
    if (marker === 0xda && dimensionsFound) return bytes;
    offset += segmentLength;
  }
  throw invalid();
}

async function uploadFrame(request, camera, session, frameId) {
  if (!frameId || !framePattern.test(frameId) || frameId.startsWith('sample-')) throw invalid();
  const bytes = await jpegBody(request);
  const claimId = randomUUID();
  const slot = await rpc('smtf_submit_claim_frame', { p_session: session, p_claim: claimId });
  if (slot === null) throw new DemoError(429, 'RATE_LIMIT', 'Chờ ít nhất 3 giây giữa hai khung ảnh.');
  if (slot !== 0 && slot !== 1) throw unavailable();
  const args = { p_session: session, p_claim: claimId, p_camera: camera.camera_id, p_frame: frameId };
  try {
    const upload = await supabase(storagePath(livePath(session, slot)), {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'no-store' },
      body: bytes,
    });
    if (!upload.ok) throw unavailable();
    if (!await rpc('smtf_submit_finish_frame', { ...args, p_sha: digest(bytes) })) throw unavailable();
  } catch (error) {
    await rpc('smtf_submit_finish_frame', { ...args, p_sha: null }).catch(() => {});
    throw error;
  }
  return json({ ok: true });
}

const routes = new Map([
  ['session', 'POST'], ['officer', 'GET'], ['lookup', 'GET'],
  ['camera', 'GET'], ['media', 'GET'], ['frame', 'POST'],
  ['record', 'GET'], ['record-media', 'GET'], ['timeline', 'GET'],
  ['decision', 'POST'], ['complaint', 'POST'], ['violation', 'POST'],
]);

// Hồ sơ theo biển (công khai như lookup): trả đầy đủ trường + đường dẫn bằng chứng.
async function recordDetail(plate) {
  const [row] = await data(`smtf_submit_records?select=${recordFields}&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) {
    const live = await newestLiveByPlate(plate);
    if (!live.length) throw notFound();
    return {
      ...liveView(live[0]),
      evidence: live[0].evidence_path
        ? [{ kind: 'after', url: `/api/demo/record-media?plate=${encodeURIComponent(plate)}&kind=live` }]
        : [],
    };
  }
  const evidence = await data(`smtf_submit_evidence?select=kind,path&plate=eq.${encodeURIComponent(plate)}`);
  return {
    ...recordView(row),
    evidence: evidence.map(item => ({
      kind: item.kind,
      url: `/api/demo/record-media?plate=${encodeURIComponent(plate)}&kind=${encodeURIComponent(item.kind)}`
    }))
  };
}

async function recordMedia(plate, kind) {
  if (!kind || !['before', 'after', 'plate', 'live'].includes(kind)) throw invalid();
  if (kind === 'live') {
    const rows = await newestLiveByPlate(plate);
    const path = rows.find(row => row.evidence_path)?.evidence_path;
    if (!path) throw notFound();
    const live = await supabase(storagePath(path));
    if (live.status === 404) throw notFound();
    if (!live.ok) throw unavailable();
    const bytes = Buffer.from(await live.arrayBuffer());
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const [row] = await data(`smtf_submit_evidence?select=path&plate=eq.${encodeURIComponent(plate)}&kind=eq.${encodeURIComponent(kind)}&limit=1`);
  if (!row) throw notFound();
  const response = await supabase(storagePath(row.path));
  if (response.status === 404) throw notFound();
  if (!response.ok) throw unavailable();
  const bytes = Buffer.from(await response.arrayBuffer());
  return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function timeline(plate) {
  const [row] = await data(`smtf_submit_records?select=plate,status,occurred_at&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) {
    const live = await newestLiveByPlate(plate);
    if (!live.length) throw notFound();
    return { plate, status: live[0].status, occurredAt: live[0].occurred_at, audit: [], complaints: [] };
  }
  const [audit, complaints] = await Promise.all([
    data(`smtf_submit_audit?select=action,note,at&plate=eq.${encodeURIComponent(plate)}&order=at.asc&limit=50`),
    data(`smtf_submit_complaints?select=id,kind,note,status,created_at&plate=eq.${encodeURIComponent(plate)}&order=created_at.asc&limit=50`),
  ]);
  return { plate: row.plate, status: row.status, occurredAt: row.occurred_at, audit, complaints };
}

const decisionActions = new Map([
  ['confirm', 'confirmed'], ['dismiss', 'dismissed'], ['needs_review', 'needs_review']
]);

async function applyDecision(plate, action, note) {
  const next = decisionActions.get(action);
  if (!next) throw invalid();
  const [row] = await data(`smtf_submit_records?select=plate,status&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) {
    if ((await newestLiveByPlate(plate)).length) {
      throw new DemoError(409, 'STATE_CONFLICT', 'Hồ sơ do trạm 3D ghi trong phiên demo: chỉ tra cứu, chưa nhận duyệt.');
    }
    throw notFound();
  }
  if (row.status === 'disputed') {
    throw new DemoError(409, 'STATE_CONFLICT', 'Hồ sơ đang khiếu nại; cần xử lý khiếu nại trước.');
  }
  const updated = await rpc('smtf_submit_decision', {
    p_plate: row.plate, p_status: next, p_action: action, p_note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null
  });
  if (updated !== true) throw unavailable();
  return json({ ok: true, plate: row.plate, status: next });
}

const complaintKinds = new Set(['priority_yield', 'wrong_plate', 'other']);
// Chỉ hồ sơ còn mở mới nhận khiếu nại; khớp whitelist COMPLAINABLE_STATUSES của citizenApi.ts.
const complainableStatuses = new Set(['new', 'pending', 'needs_review', 'confirmed', 'notified']);

export function validateComplaintKind(kind) {
  if (!complaintKinds.has(kind)) throw invalid();
}

// Hàm thuần: note bắt buộc 1–500 ký tự sau trim; hồ sơ phải còn mở.
export function validateComplaintInput(status, note) {
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  if (!text) throw new DemoError(400, 'NOTE_REQUIRED', 'Vui lòng ghi rõ lý do hoặc thông tin để cán bộ đối chiếu.');
  if (!complainableStatuses.has(status)) {
    throw new DemoError(409, 'STATE_CONFLICT', status === 'disputed'
      ? 'Hồ sơ đã có khiếu nại đang chờ xử lý.'
      : status === 'dismissed' || status === 'paid'
        ? 'Hồ sơ đã kết thúc, không thể gửi khiếu nại mới.'
        : 'Hồ sơ không còn ở trạng thái nhận khiếu nại.');
  }
  return text;
}

async function createComplaint(plate, kind, note) {
  validateComplaintKind(kind);
  const [row] = await data(`smtf_submit_records?select=plate,status&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) {
    if ((await newestLiveByPlate(plate)).length) {
      throw new DemoError(409, 'STATE_CONFLICT', 'Hồ sơ do trạm 3D ghi trong phiên demo: chỉ tra cứu, chưa nhận khiếu nại.');
    }
    throw notFound();
  }
  const text = validateComplaintInput(row.status, note);
  const created = await rpc('smtf_submit_complaint', {
    p_plate: row.plate, p_kind: kind, p_note: text
  });
  if (created !== true) throw unavailable();
  return json({ ok: true, plate: row.plate, status: 'disputed' });
}

async function readJsonBody(request) {
  try { return await request.json(); } catch { throw invalid(); }
}

async function handle(request) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.split('/').at(-1);
    const expectedMethod = routes.get(route);
    if (!expectedMethod) throw notFound();
    if (request.method !== expectedMethod) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' } }, 405, { Allow: expectedMethod });
    }
    const origin = request.headers.get('origin');
    if (request.method === 'POST' && origin && origin !== url.origin) throw invalid();
    if (route === 'session') return startSession(request, url);
    if (route === 'lookup') {
      const plate = plateKey(url.searchParams.get('plate'));
      const rows = await data(`${recordQuery}&plate=eq.${encodeURIComponent(plate)}`);
      // Hồ sơ seed thắng; biển chỉ có trong bảng live thì hiện vi phạm mới nhất (UI một dòng/biển).
      const live = rows.length ? [] : await newestLiveByPlate(plate);
      return json({ plate, records: [...rows.map(recordView), ...(live.length ? [liveView(live[0])] : [])] });
    }
    if (route === 'record') return json(await recordDetail(plateKey(url.searchParams.get('plate'))));
    if (route === 'record-media') return await recordMedia(plateKey(url.searchParams.get('plate')), url.searchParams.get('kind'));
    if (route === 'timeline') return json(await timeline(plateKey(url.searchParams.get('plate'))));
    const session = readSession(request);
    if (!session) throw new DemoError(401, 'SESSION_REQUIRED', 'Vui lòng vào demo để bắt đầu phiên.');
    if (route === 'decision') {
      const body = await readJsonBody(request);
      return await applyDecision(plateKey(body?.plate), String(body?.action || ''), body?.note);
    }
    if (route === 'complaint') {
      const body = await readJsonBody(request);
      return await createComplaint(plateKey(body?.plate), String(body?.kind || ''), body?.note);
    }
    if (route === 'violation') return await saveLiveViolation(request, session);
    if (route === 'officer') {
      const [[kpi], records, cameras, live] = await Promise.all([
        data('smtf_submit_kpi?select=source,wait_avg_s,queue_max,flow_per_node_min&id=eq.1&limit=1'),
        data(recordQuery),
        data(`smtf_submit_cameras?select=${cameraFields}&order=camera_id&limit=100`),
        liveRows(`select=${liveFields}&order=occurred_at.desc&limit=100`),
      ]);
      if (!kpi || !cameras.length) throw unavailable();
      const plates = new Set(records.map(row => row.plate));
      const merged = records.map(recordView);
      for (const row of live || []) {
        if (plates.has(row.plate)) continue;
        plates.add(row.plate);
        merged.push(liveView(row));
      }
      merged.sort((a, b) => a.plate.localeCompare(b.plate, 'en'));
      return json({ kpi, records: merged, cameras: cameras.map(cameraView) });
    }
    const camera = await findCamera(url.searchParams.get('cameraId'));
    const frameId = url.searchParams.get('frameId');
    if (route === 'media') return await media(camera, session, frameId);
    if (route === 'frame') return await uploadFrame(request, camera, session, frameId);
    return json(await describeCamera(camera, await latestFrame(session, camera.camera_id)));
  } catch (error) {
    const fault = error instanceof DemoError ? error : unavailable();
    return json({ error: { code: fault.code, message: fault.message } }, fault.status);
  }
}

export default { fetch: handle };
