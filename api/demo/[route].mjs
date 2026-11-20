import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const cookieName = 'smtf_submit_session';
const sessionSeconds = 8 * 60 * 60;
const maxJpeg = 256 * 1024;
const frameTtl = 10_000;
const bucket = 'smtf-submit-20261120';
const cameraPattern = /^CAM-(?:HX|BAC)-[0-9]{3}$/;
const framePattern = /^[A-Za-z0-9_-]{1,80}$/;

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
  ['decision', 'POST'], ['complaint', 'POST'],
]);

// Hồ sơ theo biển (công khai như lookup): trả đầy đủ trường + đường dẫn bằng chứng.
async function recordDetail(plate) {
  const [row] = await data(`smtf_submit_records?select=${recordFields}&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) throw notFound();
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
  if (!kind || !['before', 'after', 'plate'].includes(kind)) throw invalid();
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
  if (!row) throw notFound();
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
  if (!row) throw notFound();
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

async function createComplaint(plate, kind, note) {
  if (!complaintKinds.has(kind)) throw invalid();
  const [row] = await data(`smtf_submit_records?select=plate,status&plate=eq.${encodeURIComponent(plate)}&limit=1`);
  if (!row) throw notFound();
  if (row.status === 'disputed') throw new DemoError(409, 'STATE_CONFLICT', 'Hồ sơ đã có khiếu nại đang chờ xử lý.');
  const created = await rpc('smtf_submit_complaint', {
    p_plate: row.plate, p_kind: kind, p_note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null
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
      return json({ plate, records: rows.map(recordView) });
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
    if (route === 'officer') {
      const [[kpi], records, cameras] = await Promise.all([
        data('smtf_submit_kpi?select=source,wait_avg_s,queue_max,flow_per_node_min&id=eq.1&limit=1'),
        data(recordQuery),
        data(`smtf_submit_cameras?select=${cameraFields}&order=camera_id&limit=100`),
      ]);
      if (!kpi || !cameras.length) throw unavailable();
      return json({ kpi, records: records.map(recordView), cameras: cameras.map(cameraView) });
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
