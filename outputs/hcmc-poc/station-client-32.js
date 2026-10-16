// Client trạm (M1 T11): REST/WS tới backend, vi phạm + bằng chứng, metrics, khung stream, lệnh đèn.
// Hợp đồng theo backend thật (app/routers/station.py, app/schemas.py, app/ws.py):
//   - lỗi có dạng {"error": {...}}; vi phạm vào qua POST /station/violations (thiếu trường → 422);
//   - 409 = đã gửi (xóa khỏi hàng đợi); 401/429/5xx giữ lại + backoff 1→30 s; 4xx khác → dead-letter;
//   - bằng chứng POST multipart /station/violations/{id}/evidence (trùng kind → 409);
//   - WS: tin nhắn đầu {"type":"auth","token"} trong 5 s; lệnh cmd.* đến từ backend qua WS.
// Không dùng `process`; chạy được trong Node (test) và trình duyệt.
import { TRAFFIC_KINDS, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
export const TRANSPORT_32_VERSION = 'transport-32a';
export const STATION_ID_32 = 'STATION-3D-01';
export const HEARTBEAT_S = 15;
export const BACKOFF_MIN_S = 1;
export const BACKOFF_MAX_S = 30;
export const METRICS_S = 5;
export const FRAME_FPS_32 = 2;          // khung stream cho camera đang mở: ≤ 2 fps (≤ 120 req/phút)
// Tài khoản trạm trong seed DEV (app/seed/accounts.json). Chỉ dùng trên máy cục bộ; đổi trước khi trình bày.
export const STATION_LOGIN_32 = Object.freeze({ username: 'station-3d', password: 'SaiGon@2026' });
export const STATION_TOKEN_KEY_32 = 'smart_station_token_32';
const DEFAULT_API_32 = 'http://127.0.0.1:8900';
const LOOPBACK_HOSTS_32 = ['127.0.0.1', 'localhost', '[::1]'];
// Trường của ViolationIn (mục 4.4). Perception còn sinh thêm trường giao diện (status, review…) — không gửi.
const VIOLATION_FIELDS_32 = [
  'violation_code', 'plate', 'plate_format', 'vehicle_class', 'vehicle_id', 'node_id', 'camera_id',
  'signal', 'confidence', 'penalty', 'sim', 'cycle_id', 'occurred_at', 'node_osm_id', 'node_label',
  'road_index', 'lane_index', 'vehicle_color', 'owner_name', 'owner_phone', 'is_scenario_plate',
  'priority_flag', 'priority_reason', 'ocr_confidence', 'detection'
];

// Địa chỉ backend: ?api= nếu là máy cục bộ, không thì mặc định. Tài khoản trạm KHÔNG được gửi tới máy khác.
export function resolveApiBase32(search = '') {
  const raw = new URLSearchParams(String(search || '')).get('api') || DEFAULT_API_32;
  let u = null;
  try { u = new URL(raw); } catch (e) { u = null; }
  const ok = !!u && (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTS_32.includes(u.hostname);
  if (!ok) u = new URL(DEFAULT_API_32);
  return { baseUrl: u.origin, wsUrl: `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/ws/v1`, fallback: !ok };
}

export function readStoredToken32(storage) {
  try { return (storage && storage.getItem(STATION_TOKEN_KEY_32)) || null; } catch (e) { return null; }
}
function writeStoredToken32(storage, token) {
  try { if (storage) storage.setItem(STATION_TOKEN_KEY_32, token); } catch (e) { /* chế độ riêng tư: không lưu được */ }
}

// Đăng nhập tài khoản trạm → access_token (vai trò bắt buộc là station). Không đưa mật khẩu vào thông báo lỗi.
export async function loginStation32({ baseUrl, username = STATION_LOGIN_32.username, password = STATION_LOGIN_32.password,
  fetchImpl = globalThis.fetch, storage = null } = {}) {
  const res = await fetchImpl(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error(`đăng nhập trạm lỗi (HTTP ${res.status})`);
  const data = await res.json();
  if (!data || data.role !== 'station' || !data.access_token) throw new Error('tài khoản đăng nhập không có vai trò station');
  writeStoredToken32(storage, data.access_token);
  return data.access_token;
}

export function base64OfDataUrl32(dataUrl) {
  const s = String(dataUrl || '');
  const i = s.indexOf(',');
  return i >= 0 ? s.slice(i + 1) : s;
}

export function dataUrlToBlob32(dataUrl) {
  const s = String(dataUrl || '');
  const i = s.indexOf(',');
  const mime = (s.slice(0, Math.max(0, i)).match(/^data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(i >= 0 ? s.slice(i + 1) : s);
  const arr = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
  return new Blob([arr], { type: mime });
}

// Thân gửi lên backend: chỉ các trường của ViolationIn; cycle_id lấy từ signal nếu thiếu cấp gốc.
export function toViolationBody32(rec) {
  const body = {};
  for (const k of VIOLATION_FIELDS_32) if (rec[k] !== undefined) body[k] = rec[k];
  if (body.cycle_id === undefined && rec.signal && rec.signal.cycle_id !== undefined) body.cycle_id = rec.signal.cycle_id;
  return body;
}

// Khóa nhận diện vi phạm trên trạm (trùng với (vehicle_id, node_id, cycle_id, code) của backend).
export function violationKey32(rec) {
  const cycle = rec.cycle_id !== undefined ? rec.cycle_id : (rec.signal ? rec.signal.cycle_id : undefined);
  return [rec.vehicle_id, rec.node_id, cycle, rec.violation_code].join('|');
}

const retriable32 = status => status === 401 || status === 429 || status >= 500;
const defaultLog32 = msg => { try { console.warn(msg); } catch (e) { /* bỏ qua */ } };

export function createTransport32({
  baseUrl, wsUrl = '', token = null, login = null, stationId = STATION_ID_32, queue,
  fetchImpl = globalThis.fetch, wsImpl = null, uptimeS = () => 0, fpsOf = () => 0, log = defaultLog32
} = {}) {
  if (!queue) throw new TypeError('createTransport32 cần queue');
  let curToken = token || null;
  let stopped = false, started = false;
  let backoffS = BACKOFF_MIN_S, wsBackoffS = BACKOFF_MIN_S;
  let online = false, wsOpen = false;
  let hbTimer = null, retryTimer = null, wsTimer = null, ws = null;
  let flushing = null, rerun = false;
  const listeners = [];
  const deadLetter = [];
  const evidenceByKey = new Map();    // bằng chứng của vi phạm đang xếp hàng (chỉ trong bộ nhớ)
  const pendingEvidence = [];         // {violationId, items:[{kind,dataUrl}]} chờ gửi/gửi lại
  const nowIso = () => new Date().toISOString();
  const readJson = async res => {
    try { return res && typeof res.json === 'function' ? await res.json() : null; } catch (e) { return null; }
  };

  // Nhiều yêu cầu đồng thời khi chưa có token (heartbeat, metrics, WS) dùng chung MỘT lần đăng nhập.
  let loginP = null;
  const ensureToken = async () => {
    if (!curToken) {
      if (!login) throw new Error('station: chưa có token');
      if (!loginP) loginP = Promise.resolve().then(login).finally(() => { loginP = null; });
      curToken = await loginP;
    }
    return curToken;
  };
  // Mọi REST của trạm đi qua đây: gắn token; 401 → đăng nhập lại đúng một lần rồi gửi lại.
  const request = async (path, { method = 'POST', body, form } = {}) => {
    const send = async () => {
      const tok = await ensureToken();
      const headers = { Authorization: `Bearer ${tok}` };
      let payload;
      if (form) payload = form;   // không đặt Content-Type: fetch tự thêm boundary multipart
      else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      return fetchImpl(baseUrl + path, { method, headers, body: payload });
    };
    let res = await send();
    if (res && res.status === 401 && login) { curToken = null; res = await send(); }
    return res;
  };

  const postEvidence = (violationId, item) => {
    const form = new FormData();
    form.append('kind', item.kind);
    form.append('file', dataUrlToBlob32(item.dataUrl), `${item.kind}.jpg`);
    return request(`/api/v1/station/violations/${encodeURIComponent(violationId)}/evidence`, { form });
  };

  // true = đã gửi hoặc bỏ hết; false = gặp lỗi có thể thử lại (giữ lại).
  const drainEvidence = async () => {
    while (pendingEvidence.length) {
      const entry = pendingEvidence[0];
      while (entry.items.length) {
        if (stopped) return false;
        const item = entry.items[0];
        let res;
        try { res = await postEvidence(entry.violationId, item); } catch (e) { return false; }
        if (res.ok || res.status === 409) { entry.items.shift(); continue; }   // 409: đã có bằng chứng cùng kind
        if (retriable32(res.status)) return false;
        deadLetter.push({ record: { violation_id: entry.violationId, kind: item.kind }, status: res.status });
        entry.items.shift();
      }
      pendingEvidence.shift();
    }
    return true;
  };

  // true = hàng đợi đã rỗng; false = dừng vì lỗi có thể thử lại.
  const drainQueue = async () => {
    for (;;) {
      if (stopped) return false;
      const [rec] = await queue.peekAll();
      if (!rec) return true;
      let res;
      try { res = await request('/api/v1/station/violations', { body: rec }); } catch (e) { online = false; return false; }
      const key = violationKey32(rec);
      if (res.ok) {
        const data = await readJson(res);
        online = true;
        await queue.shift();
        const ev = evidenceByKey.get(key);
        evidenceByKey.delete(key);
        if (ev && ev.length && data && data.id) pendingEvidence.push({ violationId: data.id, items: ev });
        continue;
      }
      if (res.status === 409) { online = true; await queue.shift(); evidenceByKey.delete(key); continue; }   // đã gửi trước đó
      if (retriable32(res.status)) { online = false; return false; }
      deadLetter.push({ record: rec, status: res.status });
      await queue.shift();
      evidenceByKey.delete(key);
    }
  };

  const scheduleRetry = () => {
    if (stopped) return;
    const waitS = backoffS;
    backoffS = Math.min(BACKOFF_MAX_S, backoffS * 2);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; flush(); }, waitS * 1000);   // 1 → 2 → … → 30 s
  };
  const runFlush = async () => {
    let ok = false;
    try { ok = (await drainQueue()) && (await drainEvidence()); } catch (e) { ok = false; log(`[station] gửi lại lỗi: ${e && e.message}`); }
    if (ok) { backoffS = BACKOFF_MIN_S; clearTimeout(retryTimer); retryTimer = null; } else scheduleRetry();
    return ok;
  };
  // Tuần tự hóa: chỉ một vòng chạy tại một thời điểm; yêu cầu tới trong lúc chạy được gộp vào vòng kế tiếp.
  const flush = () => {
    if (flushing) { rerun = true; return flushing; }
    flushing = (async () => {
      let ok = false;
      do { rerun = false; ok = await runFlush(); } while (rerun && ok && !stopped);
    })().finally(() => { flushing = null; });
    return flushing;
  };

  const sendViolation = async (record, evidence = []) => {
    const body = toViolationBody32(record);
    const key = violationKey32(body);
    let res = null;
    try { res = await request('/api/v1/station/violations', { body }); } catch (e) { res = null; }
    if (res && res.ok) {
      const data = await readJson(res);
      online = true;
      if (evidence.length && data && data.id) {
        pendingEvidence.push({ violationId: data.id, items: evidence.slice() });
        await flush();
      }
      return data || { id: null };
    }
    if (res && res.status === 409) { online = true; return { id: null, duplicate: true }; }
    if (res && !retriable32(res.status)) { deadLetter.push({ record: body, status: res.status }); return null; }
    // Mất mạng / 401 / 429 / 5xx: xếp hàng, giữ bằng chứng trong bộ nhớ, thử lại có backoff.
    online = false;
    if (evidence.length) evidenceByKey.set(key, evidence.slice());
    try {
      const dropped = await queue.push(body);
      if (dropped) log(`[station] hàng đợi đầy: bỏ ${dropped} bản ghi cũ nhất`);
    } catch (e) { log(`[station] không ghi được hàng đợi: ${e && e.message}`); }
    scheduleRetry();
    return null;
  };

  const sendEvidence = async (violationId, kind, dataUrl) => {
    try {
      const res = await postEvidence(violationId, { kind, dataUrl });
      return res.ok ? await readJson(res) : null;
    } catch (e) { return null; }
  };

  const sendMetrics = async payload => {
    try { const res = await request('/api/v1/station/metrics', { body: payload }); return !!res.ok; } catch (e) { return false; }
  };

  // M4b1: ảnh nhiệt + cảnh báo kẹt (mỗi 10 s). Không xếp hàng IndexedDB: snapshot cũ bị thay ngay sau 10 s, và lỗi 404
  // (backend chưa có endpoint) không được đẩy vào dead-letter như lỗi dữ liệu. Mọi lỗi → false, không ném.
  const sendHeat = async payload => {
    try { const res = await request('/api/v1/station/heat', { body: payload }); return !!(res && res.ok); } catch (e) { return false; }
  };

  const sendFrame = async (cameraId, seq, jpegBase64, w, h) => {
    try {
      const res = await request('/api/v1/station/frames', {
        body: { camera_id: cameraId, seq, t: nowIso(), jpeg_base64: jpegBase64, w, h }
      });
      return !!res.ok;
    } catch (e) { return false; }   // khung hình cũ không đáng xếp hàng: bỏ qua
  };

  const dispatch = msg => {
    for (const fn of listeners) {
      try { fn(msg); } catch (e) { log(`[station] lệnh lỗi: ${e && e.message}`); }
    }
  };

  const beat = async () => {
    if (stopped) return;
    try {
      const res = await request('/api/v1/station/heartbeat', {
        body: { station_id: stationId, app_version: TRANSPORT_32_VERSION, t: nowIso(),
          uptime_s: Math.floor(uptimeS()), fps: fpsOf(), webgpu: true }
      });
      online = !!res.ok;
      if (res.ok && !wsOpen) {   // WS rớt: lấy lệnh dự phòng từ heartbeat
        const data = await readJson(res);
        if (data && Array.isArray(data.commands)) for (const c of data.commands) if (c && c.event) dispatch(c);
      }
    } catch (e) { online = false; }
    if (!stopped) { clearTimeout(hbTimer); hbTimer = setTimeout(beat, HEARTBEAT_S * 1000); }
  };

  const scheduleWs = () => {
    if (stopped || !wsImpl || !wsUrl) return;
    const waitS = wsBackoffS;
    wsBackoffS = Math.min(BACKOFF_MAX_S, wsBackoffS * 2);
    clearTimeout(wsTimer);
    wsTimer = setTimeout(connectWs, waitS * 1000);
  };
  const connectWs = async () => {
    wsTimer = null;
    if (stopped || !wsImpl || !wsUrl) return;
    let tok;
    try { tok = await ensureToken(); } catch (e) { scheduleWs(); return; }
    let sock;
    try { sock = new wsImpl(wsUrl); } catch (e) { scheduleWs(); return; }
    ws = sock;
    sock.onopen = () => {
      wsOpen = true;
      wsBackoffS = BACKOFF_MIN_S;
      sock.send(JSON.stringify({ type: 'auth', token: tok }));
    };
    sock.onmessage = ev => {
      let msg = null;
      try { msg = JSON.parse(String(ev.data)); } catch (e) { return; }
      if (msg && typeof msg.event === 'string') dispatch(msg);
    };
    sock.onclose = ev => {
      wsOpen = false;
      if (ws === sock) ws = null;
      if (ev && ev.code === 4401) curToken = null;   // token hết hạn: đăng nhập lại trước lần nối sau
      scheduleWs();
    };
    sock.onerror = () => {};   // onclose xử lý nối lại
  };

  const start = () => {
    if (started && !stopped) return;
    started = true;
    stopped = false;
    beat();
    connectWs();
    flush();
  };
  const stop = () => {
    stopped = true;
    clearTimeout(hbTimer); clearTimeout(retryTimer); clearTimeout(wsTimer);
    hbTimer = retryTimer = wsTimer = null;
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* bỏ qua */ } }
  };

  return {
    start, stop, flush, sendViolation, sendEvidence, sendMetrics, sendFrame, sendHeat,
    onCommand(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    connectionState: () => (online ? 'online' : 'offline'),
    wsState: () => (wsOpen ? 'open' : 'closed'),
    deadLetterCount: () => deadLetter.length,
    pendingCount: async () => queue.size(),
    dispatch
  };
}

// Trạng thái pha từng nút trong cụm (gửi kèm /station/metrics → signal_state_log phía backend).
export function buildSignalStates32(controller, net, tSim) {
  const out = [];
  const clusters = (net && net.signalPlan && net.signalPlan.clusters) || [];
  const t = +Number(tSim).toFixed(1);
  for (const c of clusters) {
    for (const n of c.nodeIds) {
      const st = controller.stateOf(n, tSim);
      const active = st.phases.find(p => p.phase === 'green') || st.phases.find(p => p.phase === 'yellow') || null;
      out.push({
        node_id: st.node_id, cluster_id: st.cluster_id, t_sim: t,
        phase: active ? active.phase : 'red', group: active ? active.group : null, mode: st.mode,
        override_by: st.override ? st.override.by : null, reason: st.override ? st.override.reason : null
      });
    }
  }
  return out;
}

// Vị trí xe (x, z) theo polyline cạnh và tiến độ s của xe trong sim (đủ cho cắt biển theo camera).
// M5b-1: kèm hướng đi (hx, hz) theo đoạn đầu–cuối của cạnh và kích thước (len, wid, h) để vẽ khung bằng chứng.
const poseGeoCache32 = new WeakMap();   // sim → createTrafficGeometry31 (một lần cho mỗi sim)
export function vehiclePose32(traffic, rec) {
  const sim = traffic.sim, net = traffic.net;
  const i = Number(String(rec.vehicle_id).replace(/\D/g, '')) - 1;
  if (!(i >= 0) || !sim.active[i]) return null;
  const l = sim.lane[i];
  const K = TRAFFIC_KINDS[sim.kind ? sim.kind[i] : 1] || TRAFFIC_KINDS[1];
  const size = { len: K.length, wid: K.width, h: K.height };
  if (net.geo && sim.jit) {   // đúng vị trí 3D (có lệch làn và độ cong), cùng hình học với perception
    let geo = poseGeoCache32.get(sim);
    if (!geo) { geo = createTrafficGeometry31(net, sim); poseGeoCache32.set(sim, geo); }
    const P = {};
    geo.poseAt(i, l, sim.s[i], sim.next[i], sim.prevLane ? sim.prevLane[i] : -1, P);
    return { x: P.x, z: P.z, hx: P.tx, hz: P.tz, ...size };
  }
  const e = net.lanes.edge[l], c = net.E[e].c, n = c.length / 2;
  const k = sim.s[i] / Math.max(0.01, net.lanes.length[l]);
  return {
    x: c[0] + (c[n * 2 - 2] - c[0]) * k, z: c[1] + (c[n * 2 - 1] - c[1]) * k,
    hx: c[n * 2 - 2] - c[0], hz: c[n * 2 - 1] - c[1], ...size
  };
}
const pad2_32 = n => String(n).padStart(2, '0');
// Giờ ghi nhận trên ảnh bằng chứng: dd/mm/yyyy hh:mm:ss theo giờ máy trạm.
export function stampOf32(d = new Date()) {
  return `${pad2_32(d.getDate())}/${pad2_32(d.getMonth() + 1)}/${d.getFullYear()} ${pad2_32(d.getHours())}:${pad2_32(d.getMinutes())}:${pad2_32(d.getSeconds())}`;
}
// Chú thích bằng chứng từ bản ghi vi phạm (chỉ phần hiển thị; dữ liệu gửi backend không đổi).
export function evidenceMetaOf32(rec, pose, now = new Date()) {
  const phase = rec.signal && rec.signal.phase_for_vehicle;
  const PHASE_TXT = { red: 'Đèn: ĐỎ', yellow: 'Đèn: VÀNG', green: 'Đèn: XANH' };
  return {
    code: rec.violation_code, label: rec.violation_label, plate: rec.plate, plate_format: rec.plate_format,
    confidence: rec.confidence, persons: rec.detection && rec.detection.persons,
    timeText: stampOf32(now),
    phaseText: rec.violation_code === 'RED-LIGHT' ? (PHASE_TXT[phase] || '') : '',
    speedText: rec.signal ? `${rec.signal.speed_kmh} km/h` : '',
    cameraText: `${rec.camera_id} · ${rec.node_label || rec.node_id || ''}`.trim(),
    len: pose && pose.len, wid: pose && pose.wid, h: pose && pose.h, hx: pose && pose.hx, hz: pose && pose.hz
  };
}

// M5a — lệnh từ backend (WS cmd.*, cùng dạng {event, data}). Giá trị sai bị bỏ qua, không làm dừng vòng chạy.
//   cmd.scenario {key, params?}: 'none' → dừng; khác → scenarios.start(key, params) (khóa lạ bị từ chối, ví dụ priority-run).
//   cmd.vms {vms_id, mode, text, lines?}: manual → đặt chữ (tối đa 2 dòng, ≤ 60 ký tự/dòng); auto → trở về hệ thống.
export const VMS_IDS_32 = Object.freeze(['VMS-01', 'VMS-02', 'VMS-03', 'VMS-04']);
export const VMS_LINE_MAX_32 = 60;
export function createCommandRouter32({ scenarios = null, vms = null, log = defaultLog32 } = {}) {
  return function routeCommand32(msg) {
    if (!msg || typeof msg.event !== 'string') return null;
    const d = msg.data && typeof msg.data === 'object' ? msg.data : {};
    if (msg.event === 'cmd.scenario') {
      if (!scenarios) return { ok: false, reason: 'chưa có kịch bản' };
      const key = String(d.key ?? '');
      try {
        if (key === 'none') scenarios.stop();
        else scenarios.start(key, d.params && typeof d.params === 'object' ? d.params : {});
        return { ok: true, key };
      } catch (e) {
        log(`[station] kịch bản "${key.slice(0, 40)}" bị từ chối: ${e && e.message}`);
        return { ok: false, reason: e && e.message };
      }
    }
    if (msg.event === 'cmd.vms') {
      const id = String(d.vms_id ?? '');
      if (!vms || !VMS_IDS_32.includes(id)) return { ok: false, reason: 'bảng VMS không hợp lệ' };
      if (d.mode === 'auto') { vms.clearManual(id); return { ok: true, vms_id: id, mode: 'auto' }; }
      if (d.mode !== 'manual') return { ok: false, reason: 'mode phải là auto hoặc manual' };
      const raw = Array.isArray(d.lines) && d.lines.length ? d.lines : [d.text];
      const lines = raw.map(x => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, VMS_LINE_MAX_32)).filter(Boolean).slice(0, 2);
      if (!lines.length) { vms.clearManual(id); return { ok: true, vms_id: id, mode: 'auto' }; }
      vms.setManual(id, lines);
      return { ok: true, vms_id: id, mode: 'manual', lines };
    }
    return null;
  };
}

// Vòng trạm: quét vi phạm 0,5 s → chụp bằng chứng → gửi (có bằng chứng kèm); ảnh "trước vạch" ~1 fps
// cho camera không stream; khung stream ≤ 2 fps cho camera đang mở (mặc định camera đầu registry).
export function startStationLoop32(app, { perception, capture, transport, cameras = [], scanMs = 500, beforeMs = 1000,
  openCamera = null, log = defaultLog32 } = {}) {
  if (!perception || !capture || !transport) throw new TypeError('startStationLoop32 cần perception, capture, transport');
  const camIds = cameras.map(c => c.camera_id);
  const frameGapMs = 1000 / FRAME_FPS_32 - 50;   // chừa biên để nhịp 0,5 s không bỏ mất khung
  let running = true, busy = false, timer = null, open = null, lastSeq = null, lastFrameMs = 0;
  const lastBeforeMs = new Map();
  const setOpen = id => {
    const next = id && camIds.includes(id) ? id : null;
    if (open === next) return open;
    if (open && capture.setStream) capture.setStream(open, false, FRAME_FPS_32);
    open = next;
    lastSeq = null;
    if (open && capture.setStream) capture.setStream(open, true, FRAME_FPS_32);
    return open;
  };
  setOpen(openCamera || camIds[0] || null);

  const sendOpenFrame = () => {
    if (!open) return;
    const f = capture.latestFrame(open);
    if (!f || !f.jpeg || f.seq === lastSeq) return;
    const now = Date.now();
    if (now - lastFrameMs < frameGapMs) return;
    lastSeq = f.seq;
    lastFrameMs = now;
    transport.sendFrame(open, f.seq, base64OfDataUrl32(f.jpeg), f.w, f.h);
  };

  const handleViolation = async (rec, tSim) => {
    const cam = cameras.find(c => c.camera_id === rec.camera_id);
    const before = capture.latestFrame(rec.camera_id);
    // Tác nhân WRONG-WAY (rec._pose, không gửi lên backend): vẽ và chụp theo tư thế HIỆN TẠI của nó (đã đi tiếp từ lúc phát hiện).
    // Xe trong mô phỏng tra theo vehicle_id.
    const ghosts = app.traffic && app.traffic.ghosts;
    const live = rec._pose && ghosts ? ghosts.activeAt(app.traffic.sim.counters.t).find(g => g.slot === rec._pose.slot) : null;
    const pose = live || rec._pose || vehiclePose32(app.traffic, rec) || (cam ? { x: cam.x, z: cam.z } : { x: 0, z: 0 });
    const ev = await capture.captureEvidence(rec.camera_id, pose, tSim, before, evidenceMetaOf32(rec, pose));
    const items = [ev && ev.before, ev && ev.after, ev && ev.plate_crop]
      .filter(p => p && p.jpeg)
      .map(p => ({ kind: p.kind, dataUrl: p.jpeg }));
    await transport.sendViolation(rec, items);
  };

  const tick = async () => {
    if (!running) return;
    if (!busy) {
      busy = true;
      try {
        const tSim = app.traffic.sim.counters.t;
        const now = Date.now();
        for (const id of camIds) {
          if (id === open || now - (lastBeforeMs.get(id) || 0) < beforeMs) continue;
          lastBeforeMs.set(id, now);
          await capture.captureFrame(id);
        }
        perception.scan(tSim);
        for (const rec of perception.drainViolations()) {
          try { await handleViolation(rec, tSim); } catch (e) { log(`[station] vi phạm ${rec.vehicle_id}: ${e && e.message}`); }
        }
        sendOpenFrame();
      } catch (e) {
        log(`[station] vòng trạm lỗi: ${e && e.message}`);
      } finally {
        busy = false;
      }
    }
    if (running) timer = setTimeout(tick, scanMs);
  };
  tick();

  return {
    stop() { running = false; clearTimeout(timer); setOpen(null); },
    openCamera: id => setOpen(id),
    currentOpen: () => open
  };
}
