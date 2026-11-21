// live-violation-32.js (demo-v2) — gửi vi phạm 3D lên /api/demo/violation để cán bộ/dân tra cứu.
//   Chỉ bật ở trang public (cùng origin với API). Nhịp 1 request/10 s, tối đa 50 bản ghi/phiên,
//   tối đa 1 ảnh JPEG ≤ 220 000 ký tự base64. Lỗi mạng/API không ném ra ngoài: sim chạy tiếp.
export const LIVE_SAVE_VERSION_32 = 'live-save-32a';
export const LIVE_SAVE_GAP_MS_32 = 10_000;
export const LIVE_SAVE_MAX_32 = 50;
export const LIVE_SAVE_MAX_IMAGE_CHARS_32 = 220_000;
export const LIVE_SAVE_IMAGE_KINDS_32 = Object.freeze(['after', 'plate_crop']);

const isoOrNow32 = (value, now) => {
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : now().toISOString();
};

// Bản ghi perception → payload tối thiểu của hợp đồng. null = thiếu biển/mã (bỏ qua, không gửi).
export function liveViolationPayload32(rec, camera = null, now = () => new Date()) {
  const plate = typeof rec?.plate === 'string' ? rec.plate.trim() : '';
  const code = typeof rec?.violation_code === 'string' ? rec.violation_code.trim() : '';
  if (!plate || !code) return null;
  const speed = rec?.signal?.speed_kmh;
  const confidence = rec?.confidence;
  return {
    plate,
    code,
    occurredAt: isoOrNow32(rec?.sim?.station_time, now),
    cameraId: rec?.camera_id || null,
    junctionId: camera?.junction_id || rec?.node_id || null,
    direction: rec?.node_label || null,
    vehicleClass: rec?.vehicle_class === 'car' || rec?.vehicle_class === 'motorbike' ? rec.vehicle_class : null,
    ...(Number.isFinite(speed) ? { speed } : {}),
    ...(Number.isFinite(confidence) ? { confidence } : {}),
  };
}

// Ảnh đầu tiên trong hạn mức (ưu tiên khung "sau vượt vạch"); quá lớn thì bỏ ảnh, vẫn gửi hồ sơ.
export function pickLiveImage32(items = []) {
  for (const kind of LIVE_SAVE_IMAGE_KINDS_32) {
    const item = items.find(entry => entry && entry.kind === kind && typeof entry.dataUrl === 'string');
    if (item && item.dataUrl.length <= LIVE_SAVE_MAX_IMAGE_CHARS_32) return item.dataUrl;
  }
  return null;
}

export function createLiveViolationSaver32({
  fetchImpl = null, cameras = [], gapMs = LIVE_SAVE_GAP_MS_32, cap = LIVE_SAVE_MAX_32,
  now = () => Date.now(), log = () => {},
} = {}) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl
    : (typeof fetch === 'function' && typeof globalThis.location !== 'undefined' ? fetch.bind(globalThis) : null);
  const cameraById = new Map(cameras.map(camera => [camera.camera_id || camera.cameraId, camera]).filter(([id]) => id));
  let lastAt = -gapMs, count = 0, sessionReady = false, inFlight = false;

  const post = (url, init) => doFetch(url, { credentials: 'include', ...init });
  const status = () => ({ count, lastAt, sessionReady, inFlight });

  async function ensureSession() {
    if (sessionReady) return true;
    const res = await post('/api/demo/session', { method: 'POST' });
    if (!res || !res.ok) return false;
    sessionReady = true;
    return true;
  }

  // 'saved' | 'throttled' | 'capped' | 'skipped' | 'busy' | 'no-session' | 'http-…' | 'error'
  async function submit(rec, items = []) {
    if (!doFetch || inFlight) return 'busy';
    if (count >= cap) return 'capped';
    const t = now();
    if (t - lastAt < gapMs) return 'throttled';
    const payload = liveViolationPayload32(rec, cameraById.get(rec && rec.camera_id), now);
    if (!payload) return 'skipped';
    const image = pickLiveImage32(items);
    if (image) payload.image = image;
    inFlight = true;
    lastAt = t;   // giãn nhịp cả khi lỗi: không bắn dồn khi API hỏng
    try {
      if (!(await ensureSession())) return 'no-session';
      const res = await post('/api/demo/violation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.status === 401) { sessionReady = false; return 'no-session'; }
      if (!res.ok) return `http-${res.status}`;
      count++;
      return 'saved';
    } catch (error) {
      log(`[live-save] ${error && error.message ? error.message : error}`);
      return 'error';
    } finally {
      inFlight = false;
    }
  }

  return { submit, status };
}
