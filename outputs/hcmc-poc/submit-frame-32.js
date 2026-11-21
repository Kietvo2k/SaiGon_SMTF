// submit-frame-32.js (demo-v2) — đẩy khung hình sống từ trạm 3D lên hợp đồng /api/demo/frame.
//   Hợp đồng: POST /api/demo/session (cookie HttpOnly same-origin) → POST /api/demo/frame?cameraId&frameId
//   tối đa 1 frame / 3 s cho phiên đang xem, JPEG ≤ 256 KiB, tối đa 2 slot/phiên (server quản slot).
//   Camera đang xem nhận qua BroadcastChannel 'smtf-submit-camera' {type:'camera', cameraId} từ web cán bộ
//   (kênh chỉ truyền tín hiệu chọn, không mang dữ liệu nghiệp vụ — đúng DEMO-VERCEL-SUPABASE).
//   Tab ẩn → dừng gửi (visibilitychange); lỗi 429/409/503 → đợi thêm một gap rồi thử lại.
// Thuần logic tách hàm để test trong Node; DOM/fetch chỉ chạm khi start() trong trình duyệt.

export const SUBMIT_FRAME_VERSION_32 = 'submit-frame-32a';
export const SUBMIT_FRAME_GAP_MS_32 = 4200;   // chậm hơn nhịp hợp đồng 3 s để tránh 429 khi đồng hồ server/DB lệch
export const SUBMIT_FRAME_MAX_BYTES_32 = 256 * 1024;
export const SUBMIT_FRAME_CHANNEL_32 = 'smtf-submit-camera';
const FRAME_ID_RE_32 = /^[A-Za-z0-9_-]{1,80}$/;

// frameId hợp đồng: [A-Za-z0-9_-]{1,80}, không được bắt đầu bằng "sample-".
export function frameIdOf32(cameraId, seq) {
  const id = `live-${String(cameraId).replace(/[^A-Za-z0-9_-]/g, '')}-${Number(seq) || 0}`;
  if (!FRAME_ID_RE_32.test(id)) throw new RangeError('frameId không hợp lệ cho hợp đồng frame');
  return id;
}

// Bậc nén JPEG: thử lần lượt (quality, chiều rộng). Trả về null khi đã cạn bậc.
export const SUBMIT_ENCODE_STEPS_32 = Object.freeze([
  Object.freeze({ quality: 0.82, width: 1280 }),
  Object.freeze({ quality: 0.62, width: 1280 }),
  Object.freeze({ quality: 0.45, width: 960 }),
  Object.freeze({ quality: 0.35, width: 800 })
]);

export function nextEncodeStep32(index, steps = SUBMIT_ENCODE_STEPS_32) {
  return index >= 0 && index < steps.length ? steps[index] : null;
}

// Chọn bậc nén kế tiếp theo bytes của bậc vừa thử: còn vượt hạn mức thì hạ bậc, đạt thì giữ nguyên.
export function pickEncodeStep32(lastBytes, lastIndex, maxBytes = SUBMIT_FRAME_MAX_BYTES_32, steps = SUBMIT_ENCODE_STEPS_32) {
  if (lastIndex == null) return { index: 0, step: steps[0] };
  if (lastBytes != null && lastBytes <= maxBytes) return { index: lastIndex, step: steps[lastIndex] };
  const next = lastIndex + 1;
  return next < steps.length ? { index: next, step: steps[next] } : { index: -1, step: null };
}

// Lỗi HTTP nào nên đợi thêm một gap trước khi thử lại (đúng nghĩa hợp đồng: 429 RATE_LIMIT, 503 DATA_UNAVAILABLE).
export function shouldBackoff32(status) {
  return status === 429 || status === 503 || status === 409;
}

// Ép blob JPEG ≤ maxBytes từ canvas: thử từng bậc nén; cạn bậc → null (bỏ khung, thử lại khung sau).
export async function encodeFrameBlob32(canvas, maxBytes = SUBMIT_FRAME_MAX_BYTES_32, encodeImpl = null) {
  const toBlob = encodeImpl || ((cv, quality) => new Promise(resolve => cv.toBlob(resolve, 'image/jpeg', quality)));
  let index = null, lastBytes = null;
  for (let guard = 0; guard <= SUBMIT_ENCODE_STEPS_32.length; guard++) {
    const pick = pickEncodeStep32(lastBytes, index, maxBytes);
    if (!pick.step) return null;
    index = pick.index;
    let blob = await toBlob(canvas, pick.step.quality);
    if (!blob) return null;
    if (blob.size > maxBytes && pick.step.width < canvas.width) {
      // Thu nhỏ khung rồi nén lại; môi trường không có DOM (Node) thì coi bậc này không đạt, thử bậc kế.
      if (typeof document === 'undefined') { lastBytes = blob.size; continue; }
      const small = document.createElement('canvas');
      const k = pick.step.width / canvas.width;
      small.width = Math.max(2, Math.round(canvas.width * k));
      small.height = Math.max(2, Math.round(canvas.height * k));
      small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
      blob = await toBlob(small, pick.step.quality);
    }
    if (!blob) return null;
    if (blob.size <= maxBytes) return { blob, bytes: blob.size, step: index };
    lastBytes = blob.size;
  }
  return null;
}

// Vòng đẩy frame. deps: { app (initSmartApp32), capture (app.modules.capture), cameras [{camera_id}…],
//   fetchImpl, channelImpl (BroadcastChannel), doc, now, gapMs }.
export function installSubmitFrame32({
  app, capture, cameras = [], fetchImpl = null, channelImpl = null, doc = null, gapMs = SUBMIT_FRAME_GAP_MS_32,
  maxBytes = SUBMIT_FRAME_MAX_BYTES_32, encodeImpl = null, now = () => Date.now(), log = () => {}
} = {}) {
  if (!app || !capture) throw new TypeError('installSubmitFrame32 cần app và capture');
  if (typeof fetchImpl !== 'function' && typeof fetch !== 'function') throw new TypeError('installSubmitFrame32 cần fetch');
  const doFetch = fetchImpl || fetch.bind(globalThis);
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  const ids = cameras.map(c => c.camera_id || c.cameraId).filter(Boolean);
  const camOf = id => (id && ids.includes(id) ? id : null);

  let running = false, started = false;
  let open = camOf(null) ?? ids[0] ?? null;
  let lastSentAt = -gapMs, backoffUntil = 0, seq = 0, sent = 0, failed = 0, lastError = '';
  let sessionReady = false, channel = null, timer = 0, sendInFlight = false;

  const status = () => ({ running, cameraId: open, sent, failed, lastError, sessionReady });

  const post = (url, init) => doFetch(url, { credentials: 'include', ...init });

  async function ensureSession() {
    if (sessionReady) return true;
    try {
      const res = await post('/api/demo/session', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sessionReady = true;
    } catch (e) {
      lastError = `phiên: ${e && e.message ? e.message : String(e)}`;
      // Không spam endpoint phiên khi đích chưa sẵn sàng: chờ thêm 2 gap rồi thử lại.
      backoffUntil = now() + gapMs * 2;
      return false;
    }
    return true;
  }

  async function pushFrame() {
    if (!open) return;
    const frame = capture.latestFrame(open);
    if (!frame || !frame.canvas) return;
    seq = Math.max(seq, frame.seq || 0);
    const encoded = await encodeFrameBlob32(frame.canvas, maxBytes, encodeImpl);
    if (!encoded) { failed++; lastError = 'khung vượt hạn mức 256 KiB sau khi nén'; return; }
    const frameId = frameIdOf32(open, seq);
    const query = new URLSearchParams({ cameraId: open, frameId });
    try {
      const res = await post(`/api/demo/frame?${query}`, {
        method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: encoded.blob
      });
      if (res.ok) { sent++; lastError = ''; return; }
      failed++;
      lastError = `HTTP ${res.status}`;
      if (shouldBackoff32(res.status)) backoffUntil = now() + gapMs * 2;
      if (res.status === 401) sessionReady = false;
    } catch (e) {
      failed++;
      lastError = e && e.message ? e.message : String(e);
      backoffUntil = now() + gapMs * 2;
    }
  }

  const tick = async () => {
    if (!running) return;
    const t = now();
    if (sendInFlight || t < backoffUntil || t - lastSentAt < gapMs) return;
    if (documentRef && documentRef.hidden) return;   // không người xem → không gửi (đúng hợp đồng)
    sendInFlight = true;
    try {
      if (await ensureSession()) {
        lastSentAt = t;
        await pushFrame();
      }
    } finally { sendInFlight = false; }
  };

  function watchChannel() {
    const BC = channelImpl || (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);
    if (!BC) return null;
    channel = new BC(SUBMIT_FRAME_CHANNEL_32);
    channel.onmessage = event => {
      const data = event && event.data;
      if (!data || data.type !== 'camera') return;
      const next = camOf(data.cameraId);
      if (next && next !== open) { open = next; log(`[submit-frame] camera đang xem: ${next}`); }
    };
    return channel;
  }

  return {
    status,
    async start() {
      if (started) return status();
      started = true; running = true;
      watchChannel();
      if (documentRef && typeof documentRef.addEventListener === 'function') {
        documentRef.addEventListener('visibilitychange', () => { if (!documentRef.hidden) tick(); });
      }
      if (typeof setInterval === 'function') timer = setInterval(() => void tick(), Math.max(500, gapMs / 3));
      await ensureSession();
      await tick();   // khung đầu (nếu đủ điều kiện) đẩy xong trước khi start() trả về
      log(`[submit-frame] bắt đầu đẩy khung theo hợp đồng /api/demo/frame (mỗi ${Math.round(gapMs / 1000)} s)`);
      return status();
    },
    stop() { running = false; started = false; if (timer) clearInterval(timer); timer = 0; if (channel) channel.close(); channel = null; return status(); },
    selectCamera(id) { const next = camOf(id); if (next) open = next; return open; },
    dispose() { this.stop(); }
  };
}
