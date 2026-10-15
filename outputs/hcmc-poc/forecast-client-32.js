// forecast-client-32.js - glue M4b2 trên trang: giữ MỘT Web Worker tua trước (forecast-worker-32.js).
// Cứ FORECAST_REQ_EVERY_S_32 giây sim gửi ảnh trạng thái (exportState) + mức nhiệt hiện có + danh sách cạnh cảnh báo;
// Worker chạy bản sao tới 30 phút sim rồi trả mức nhiệt 10/20/30 phút → heat-live-32.applyLookahead.
// Worker đang bận thì bỏ lượt đó (không xếp hàng). Nhảy thời gian gọi reset(): kết quả đợt cũ bị loại.
// Dòng trạng thái ghi ngay dưới danh sách cảnh báo (số giây thực, tỉ lệ xe) để người xem biết tua đang dùng gì.
export const FORECAST_CLIENT_32_VERSION = 'forecast-client-32a';
export const FORECAST_REQ_EVERY_S_32 = 60;   // s sim giữa hai lần gửi
export const FORECAST_TICK_MS_32 = 1000;     // ms thực: nhịp kiểm tra có cần gửi không
export const FORECAST_START_DELAY_MS_32 = 1500; // ms: trì hoãn khởi tạo Worker (đưa việc clone đồ thị ra sau các khung đầu)

// Gom mọi ArrayBuffer trong ảnh trạng thái để chuyển quyền sở hữu (không sao chép lần hai).
export function collectBuffers32(o, out = new Set()) {
  if (!o || typeof o !== 'object') return out;
  if (ArrayBuffer.isView(o)) { out.add(o.buffer); return out; }
  if (Array.isArray(o)) { for (const x of o) collectBuffers32(x, out); return out; }
  for (const k of Object.keys(o)) collectBuffers32(o[k], out);
  return out;
}

export function installForecast32(app, { G, roads, widths, drawn, signalPlan = null, stats = null, breakerS = 180,
  createWorker = null, startDelayMs = FORECAST_START_DELAY_MS_32, doc = (typeof document !== 'undefined' ? document : null) } = {}) {
  if (!app || !app.traffic) throw new TypeError('installForecast32 cần app.traffic');
  const sim = app.traffic.sim;
  const make = createWorker || (() => new Worker(new URL('./forecast-worker-32.js?v=32a', import.meta.url), { type: 'module' }));
  let worker = null, ready = false, busy = false, alive = true;
  let gen = 0, pendingId = 0, pendingGen = -1, nextId = 1, lastReqT = -Infinity;
  let last = null;                     // {t0, scale, scaled, elapsedMs}
  let statusEl = null;
  const heatLive = () => (app.modules && app.modules.heat ? app.modules.heat.live : null);
  const setStatus = text => {
    if (!doc) return;
    if (!statusEl) {
      const list = doc.getElementById('heatAlerts32');
      if (!list) return;
      statusEl = doc.createElement('p');
      statusEl.className = 'heat-look32';
      statusEl.setAttribute('aria-live', 'polite');
      list.insertAdjacentElement('afterend', statusEl);
    }
    statusEl.textContent = text;
  };
  const describe = () => {
    if (!ready) return 'Tua trước: đang khởi tạo Worker';
    if (!last) return 'Tua trước: chờ lượt đầu (mỗi 60 s sim)';
    const secs = (last.elapsedMs / 1000).toFixed(1).replace('.', ',');
    return `Tua trước 30 phút · ${secs} s thực · xe ${Math.round(last.scale * 100)} %${last.scaled ? ' (giảm để kịp ngân sách)' : ''}`;
  };

  function onMessage(ev) {
    const m = ev.data || {};
    if (m.type === 'ready') { ready = true; setStatus(describe()); return; }
    if (m.type === 'error') { if (m.id === pendingId) busy = false; setStatus(`Tua trước lỗi: ${m.message}`); return; }
    if (m.type !== 'result' || m.id !== pendingId) return;
    busy = false;
    if (pendingGen !== gen) return;    // đợt trước khi nhảy thời gian: bỏ
    const live = heatLive();
    if (live && live.applyLookahead(m)) last = { t0: m.t0, scale: m.scale, scaled: m.scaled, elapsedMs: m.elapsedMs };
    setStatus(describe());
  }

  function requestNow() {
    const live = heatLive();
    if (!alive || !ready || busy || !live) return false;
    const t = Number(sim.counters.t) || 0;
    if (lastReqT !== -Infinity && t - lastReqT < FORECAST_REQ_EVERY_S_32) return false;
    lastReqT = t;
    busy = true;
    pendingId = nextId++; pendingGen = gen;
    const state = sim.exportState();
    const levels0 = live.levels();
    const ctrl = app.controller;
    const job = { state, levels0, phases: ctrl && ctrl.exportPhases ? ctrl.exportPhases() : null, mode: ctrl && ctrl.getMode ? ctrl.getMode() : 'fixed', avoid: live.alerts().map(a => a.edge) };
    const transfer = [...collectBuffers32(state), levels0.buffer];
    worker.postMessage({ type: 'run', id: pendingId, job }, transfer);
    return true;
  }

  function tick() { if (alive) requestNow(); }

  // Gọi khi nhảy thời gian: bỏ kết quả đang chờ và cho phép gửi ngay lượt sau.
  function reset() { gen++; lastReqT = -Infinity; last = null; if (alive && ready) setStatus(describe()); }

  const start = () => {
    if (!alive) return;
    worker = make();
    worker.onmessage = onMessage;
    worker.onerror = e => { busy = false; setStatus(`Tua trước lỗi: ${e && e.message ? e.message : 'Worker'}`); };
    worker.postMessage({ type: 'init', graph: G, roads, widths, drawn, signalPlan, breakerS, expectStats: stats ? JSON.stringify(stats) : null });
    setStatus(describe());
  };
  const startTimer = setTimeout(start, Math.max(0, startDelayMs));
  const timer = setInterval(tick, FORECAST_TICK_MS_32);

  const api = {
    tick, reset, requestNow, describe,
    get ready() { return ready; },
    dispose() {
      alive = false; clearTimeout(startTimer); clearInterval(timer);
      if (worker) worker.terminate();
      if (statusEl) statusEl.remove();
    }
  };
  app.registerSmartModule32('forecast', api);
  return api;
}
