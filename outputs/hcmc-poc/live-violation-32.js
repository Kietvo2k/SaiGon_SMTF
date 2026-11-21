// live-violation-32.js (demo-v2) — gửi vi phạm 3D lên /api/demo/violation để cán bộ/dân tra cứu.
//   Chỉ bật ở trang public (cùng origin với API). Mọi vi phạm được xếp hàng và gửi lần lượt
//   (không bỏ sự kiện khi có 2 vi phạm sát nhau), nhịp tối thiểu 400 ms, tối đa 500 bản ghi/phiên,
//   tối đa 50 ảnh JPEG ≤ 220 000 ký tự base64. Lỗi mạng/API không ném ra ngoài: sim chạy tiếp.
export const LIVE_SAVE_VERSION_32 = 'live-save-32b';
export const LIVE_SAVE_GAP_MS_32 = 400;
export const LIVE_SAVE_MAX_32 = 500;
export const LIVE_SAVE_MAX_IMAGE_CHARS_32 = 220_000;
export const LIVE_SAVE_MAX_IMAGES_32 = 50;
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
  maxImages = LIVE_SAVE_MAX_IMAGES_32, now = () => Date.now(), log = () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl
    : (typeof fetch === 'function' && typeof globalThis.location !== 'undefined' ? fetch.bind(globalThis) : null);
  const cameraById = new Map(cameras.map(camera => [camera.camera_id || camera.cameraId, camera]).filter(([id]) => id));
  let lastAt = -gapMs, count = 0, imageCount = 0, sessionReady = false, draining = false;
  const queue = [];

  const post = (url, init) => doFetch(url, { credentials: 'include', ...init });
  const status = () => ({ count, lastAt, sessionReady, inFlight: draining, queued: queue.length, imageCount });

  async function ensureSession() {
    if (sessionReady) return true;
    const res = await post('/api/demo/session', { method: 'POST' });
    if (!res || !res.ok) return false;
    sessionReady = true;
    return true;
  }

  // Gửi lần lượt toàn bộ queue; trả kết quả từng job. Không bỏ job khi 2 vi phạm sát nhau.
  async function drain() {
    if (draining || !doFetch) return [];
    draining = true;
    const results = [];
    try {
      while (queue.length && count < cap) {
        const job = queue.shift();
        const wait = gapMs - (now() - lastAt);
        if (wait > 0) await sleep(wait);
        let attempt = 0;
        let done = false;
        while (!done && attempt < 3) {
          attempt++;
          try {
            if (!(await ensureSession())) { job.result = 'no-session'; break; }
            const res = await post('/api/demo/violation', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
            });
            if (res.status === 401) {
              sessionReady = false;
              job.result = 'no-session';
              if (attempt < 3) continue;
              break;
            }
            if (res.status === 429) {
              const retryAfter = Number(res.headers.get('Retry-After'));
              job.result = 'http-429';
              await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : gapMs * 2);
              continue;
            }
            if (!res.ok) {
              job.result = `http-${res.status}`;
              if (res.status >= 500 && attempt < 3) { await sleep(gapMs); continue; }
              break;
            }
            job.result = 'saved';
            count++;
            if (job.payload.image) imageCount++;
            done = true;
          } catch (error) {
            job.result = 'error';
            log(`[live-save] ${error && error.message ? error.message : error}`);
            if (attempt < 3) await sleep(gapMs);
          }
        }
        lastAt = now();
        results.push(job.result);
      }
    } finally {
      draining = false;
    }
    return results;
  }

  // 'queued' | 'saved' | 'capped' | 'skipped' | 'busy' | 'no-session' | 'http-…' | 'error'
  // Vi phạm được xếp hàng; nếu queue đang trống thì chờ gửi xong để trả kết quả thật.
  async function submit(rec, items = []) {
    if (!doFetch) return 'busy';
    if (count >= cap && queue.length === 0) return 'capped';
    const payload = liveViolationPayload32(rec, cameraById.get(rec && rec.camera_id), now);
    if (!payload) return 'skipped';
    const image = imageCount < maxImages ? pickLiveImage32(items) : null;
    if (image) payload.image = image;
    queue.push({ payload, result: null });
    if (draining) return 'queued';
    const results = await drain();
    return results[0] || 'queued';
  }

  return { submit, flush: drain, status };
}
