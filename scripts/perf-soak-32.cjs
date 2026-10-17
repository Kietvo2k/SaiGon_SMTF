// PERF-1: đo nền tài nguyên khi chạy dài 24/7 (app 3D smart + backend + web công an).
// KHÔNG sửa mã app/backend/web. Chỉ mở trang, lấy số đo, ghi work/perf/<tag>.json và .md.
//
// Chạy:
//   node scripts/perf-soak-32.cjs --minutes 3            (3 pha, mặc định 3 phút/pha)
//   node scripts/perf-soak-32.cjs --minutes 1 --tag smoke (chạy thử: kiểm đủ cột)
//
// Cổng mặc định: tĩnh 8841, backend 8940, web 5173 (đổi bằng --static-port/--api-port/--web-port).
// Trước khi chạy phải bật 3 dịch vụ (xem work/PERF-1.report.md). Playwright lấy qua PW_MODULE/PW_CHROME như các script qa-*-32.cjs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const VAR_DIR = process.env.SMART_VAR_DIR || path.join(ROOT, 'outputs/smart-traffic/var');
const DB_PATH = path.join(VAR_DIR, 'smart-traffic.db');
const FRAMES_DIR = path.join(VAR_DIR, 'frames');
const ACCOUNTS = path.join(ROOT, 'outputs/smart-traffic/backend/app/seed/accounts.json');

// Bảng cần đếm số dòng (PERF-4 sẽ dọn dựa trên tốc độ tăng này).
const TABLES = ['station_metrics', 'signal_state_log', 'kpi_samples', 'violations'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const out = {
    minutes: 10, sampleMs: 30000, tag: 'baseline', out: path.join(ROOT, 'work/perf'),
    phases: ['A', 'B', 'C'], host: '127.0.0.1', staticPort: 8841, apiPort: 8940, webPort: 5173,
    headless: true, settleMs: 5000, readyTimeoutMs: 300000
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--minutes') out.minutes = Number(next()) || 10;
    else if (a === '--sample-ms') out.sampleMs = Math.max(5000, Number(next()) || 30000);
    else if (a === '--tag') out.tag = String(next() || 'baseline');
    else if (a === '--out') out.out = path.resolve(String(next()));
    else if (a === '--phases') out.phases = String(next()).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--host') out.host = String(next());
    else if (a === '--static-port') out.staticPort = Number(next());
    else if (a === '--api-port') out.apiPort = Number(next());
    else if (a === '--web-port') out.webPort = Number(next());
    else if (a === '--headed') out.headless = false;
    else if (a === '--settle-ms') out.settleMs = Number(next()) || 5000;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 10).join('\n')); process.exit(0); }
    else throw new Error(`tham số lạ: ${a}`);
  }
  return out;
}

function dirSize(dir) {
  let total = 0, files = 0;
  const walk = d => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { total += fs.statSync(p).size; files++; } catch (err) { /* file biến mất giữa chừng */ } }
    }
  };
  walk(dir);
  return { bytes: total, files };
}

function fileSize(p) { try { return fs.statSync(p).size; } catch (e) { return 0; } }

// Đọc số dòng SQLite ở chế độ CHỈ ĐỌC (không khóa ghi của backend). Thử lại vài lần nếu đang bận.
function readRows() {
  const rows = {};
  for (const t of TABLES) rows[t] = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let db = null;
    try {
      db = new DatabaseSync(DB_PATH, { readOnly: true });
      for (const t of TABLES) {
        try { rows[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; } catch (e) { rows[t] = null; }
      }
      db.close();
      if (Object.values(rows).every(v => v != null)) return rows;
      sleep(150);
    } catch (e) {
      try { if (db) db.close(); } catch (err) { /* bỏ qua */ }
      sleep(150);
    }
  }
  return rows;
}

// Lấy mẫu đầu/cuối BỎ QUA mẫu thiếu (null) để tốc độ tăng không sai vì một lần đọc DB bận.
function firstLast(vals) {
  const ok = vals.filter(v => v != null && Number.isFinite(v));
  return { first: ok.length ? ok[0] : null, last: ok.length ? ok[ok.length - 1] : null };
}

// Tài khoản cán bộ lấy từ seed (KHÔNG in mật khẩu ra log hay báo cáo).
function pickOfficerAccount() {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const order = ['admin', 'commander', 'officer'];
  for (const role of order) {
    const hit = list.find(a => a.role === role);
    if (hit) return hit;
  }
  throw new Error('seed không có tài khoản cán bộ');
}

function mean(xs) { const v = xs.filter(x => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function peak(xs) { const v = xs.filter(x => Number.isFinite(x)); return v.length ? Math.max(...v) : null; }
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

// Nguồn tải: đo giá trị, quy về "phần ngân sách" (0–1) để so được các đơn vị khác nhau.
// Ngân sách là mức mong muốn cho chạy 24/7 (tham chiếu docs/PERFORMANCE-24-7.md mục 4); chỉ dùng để XẾP HẠNG.
const BUDGETS = {
  cpu_pct: 10,          // % một lõi cho luồng chính khi đang xem
  ws_mb_per_hour: 50,   // web nhận qua WebSocket
  disk_mb_per_hour: 50, // đĩa tăng (DB + ảnh)
  req_per_min: 60       // request tới backend
};

function scoreLoad(unit, value) {
  const budget = BUDGETS[unit];
  return budget && Number.isFinite(value) ? value / budget : 0;
}

(async () => {
  const cfg = parseArgs(process.argv.slice(2));
  const base = {
    static: `http://${cfg.host}:${cfg.staticPort}`,
    api: `http://${cfg.host}:${cfg.apiPort}`,
    web: `http://${cfg.host}:${cfg.webPort}`
  };
  const appUrl = `${base.static}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=${base.api}`;
  const officerUrl = `${base.web}/index-officer.html`;
  const apiOrigin = new URL(base.api).origin;

  fs.mkdirSync(cfg.out, { recursive: true });
  const startedIso = new Date().toISOString();
  console.log(`[perf] ROOT=${ROOT}`);
  console.log(`[perf] app=${appUrl}`);
  console.log(`[perf] officer=${officerUrl}`);

  const account = pickOfficerAccount();
  const loginRes = await fetch(`${base.api}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password })
  });
  if (!loginRes.ok) throw new Error(`đăng nhập web công an lỗi HTTP ${loginRes.status}`);
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  if (!token) throw new Error('đăng nhập không trả access_token');

  const browser = await chromium.launch({
    headless: cfg.headless,
    executablePath: CHROME,
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11']
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  const errors = [];
  const attachLog = (page, tag) => {
    page.on('pageerror', e => errors.push(`${tag} PAGEERROR ${String(e).slice(0, 200)}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console ${m.text().slice(0, 160)}`); });
  };

  // Đếm request tới backend theo đường dẫn (chỉ máy chủ API).
  // OPTIONS (CORS preflight) đếm riêng: đó là chi phí của trình duyệt, không phải nhịp của app.
  const reqPending = { byPath: {}, preflight: 0, app: 0, web: 0 };
  const respPending = { byCode: {}, errorByPath: {} };
  const attachRequests = (page, who) => {
    page.on('request', r => {
      let origin = null, pathname = null, method = 'GET';
      try { const u = new URL(r.url()); origin = u.origin; pathname = u.pathname; method = r.method(); } catch (e) { return; }
      if (origin !== apiOrigin) return;
      if (method === 'OPTIONS') { reqPending.preflight++; return; }
      reqPending.app += who === 'app' ? 1 : 0;
      reqPending.web += who === 'web' ? 1 : 0;
      reqPending.byPath[pathname] = (reqPending.byPath[pathname] || 0) + 1;
    });
    // Mã trả về (429 = vượt hạn mức trạm ⇒ PERF-3 phải hết 429 ở pha C).
    page.on('response', res => {
      let pathname = null;
      try { const u = new URL(res.url()); if (u.origin !== apiOrigin) return; pathname = u.pathname; } catch (e) { return; }
      const st = res.status();
      respPending.byCode[st] = (respPending.byCode[st] || 0) + 1;
      if (st >= 400) respPending.errorByPath[pathname] = (respPending.errorByPath[pathname] || 0) + 1;
    });
  };

  const appPage = await context.newPage();
  attachLog(appPage, 'app');
  attachRequests(appPage, 'app');
  // Đếm requestAnimationFrame trong trang (độc lập với bộ đếm FPS của app).
  await appPage.addInitScript(() => {
    window.__perfRaf32 = 0;
    const loop = () => { window.__perfRaf32++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });

  const webPage = await context.newPage();
  attachLog(webPage, 'web');
  attachRequests(webPage, 'web');
  await webPage.addInitScript(t => {
    try { sessionStorage.setItem('smart_token_officer', t); } catch (e) { /* bỏ qua */ }
  }, token);
  // Bản build web (web/dist) hardcode VITE_API_BASE = http://127.0.0.1:8900. Khi backend chạy ở
  // cổng khác (mặc định đo: 8940) thì web không đăng nhập và không nhận WebSocket. Ở đây chỉ dịch
  // cổng ngay trong script đo (fetch + WebSocket + ảnh), KHÔNG sửa mã web.
  const API_REBASE = { from: 'http://127.0.0.1:8900', to: base.api };
  // Ký tự sẽ có trong URL: `from` là gốc HTTP của bản build, `fromWs` là bản ws:// của nó.
  const WS_REBASE = { from: API_REBASE.from.replace(/^http/, 'ws'), to: API_REBASE.to.replace(/^http/, 'ws') };
  const rebaseUrl = u => String(u).replace(API_REBASE.from, API_REBASE.to);
  if (API_REBASE.from !== API_REBASE.to) {
    await webPage.addInitScript(rb => {
      const reb = s => String(s).replace(rb.from, rb.to);
      const of = window.fetch;
      window.fetch = function (input, init) {
        try {
          if (typeof input === 'string') input = reb(input);
          else if (input && typeof input.url === 'string') input = new Request(reb(input.url), input);
        } catch (e) { /* để nguyên input */ }
        return of.call(this, input, init);
      };
      const OW = window.WebSocket;
      if (OW) {
        const rebWs = s => String(s).replace(rb.fromWs, rb.toWs);
        const WS = function (url, protocols) { return protocols === undefined ? new OW(rebWs(url)) : new OW(rebWs(url), protocols); };
        WS.prototype = OW.prototype;
        for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WS[k] = OW[k];
        window.WebSocket = WS;
      }
    }, { ...API_REBASE, fromWs: WS_REBASE.from, toWs: WS_REBASE.to });
    await context.route(`${API_REBASE.from}/**`, route => {
      try { return route.continue({ url: rebaseUrl(route.request().url()) }); } catch (e) { return route.continue(); }
    });
  }

  // CDP: heap + TaskDuration của app; byte WebSocket trang web nhận.
  const appCdp = await context.newCDPSession(appPage);
  await appCdp.send('Performance.enable');
  const webCdp = await context.newCDPSession(webPage);
  await webCdp.send('Network.enable');
  let wsBytes = 0, wsFrames = 0, wsLastNotice = 0;
  webCdp.on('Network.webSocketFrameReceived', e => {
    const data = e && e.response ? e.response.payloadData : null;
    wsBytes += Buffer.byteLength(String(data == null ? '' : data), 'utf8');
    wsFrames++;
  });
  webCdp.on('Network.webSocketCreated', e => { wsLastNotice++; });
  webCdp.on('Network.webSocketClosed', () => { /* đếm gián đoạn khi cần: wsLastNotice giữ số lần tạo */ });

  // Mở app + web; đợi app sẵn sàng.
  await webPage.goto(officerUrl, { waitUntil: 'load' });
  // Chờ web công an thực sự đã đăng nhập (token trong sessionStorage + gọi /auth/me xong)
  // trước khi mở app, để app không lấy nhịp WS của lần nạp đầu.
  try {
    await webPage.waitForFunction(() => {
      const t = sessionStorage.getItem('smart_token_officer') || '';
      return !!t && !document.querySelector('.login') && !!document.querySelector('.app .topbar h1');
    }, null, { timeout: 60000, polling: 500 });
  } catch (e) {
    // Không kết nối được cũng chạy tiếp: WS web sẽ bằng 0 và được ghi rõ trong báo cáo.
  }
  await appPage.goto(appUrl, { waitUntil: 'load' });
  console.log('[perf] chờ app sẵn sàng…');
  await appPage.waitForFunction(() => window.webgpuMaterials24 && window.webgpuMaterials24.state === 'ready', null, { timeout: cfg.readyTimeoutMs });
  await appPage.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await appPage.waitForFunction(() => !!(window.__smartApp && window.__smartApp.modules && window.__smartApp.modules.clock), null, { timeout: 60000 });
  await appPage.waitForFunction(() => document.querySelector('.app .topbar h1') !== null, null, { timeout: 30000 }).catch(() => {});
  const webLoggedIn = await webPage.evaluate(() => !document.querySelector('.login') && !!document.querySelector('.app .topbar h1'));
  console.log(`[perf] web công an đã đăng nhập: ${webLoggedIn}`);
  if (!webLoggedIn) {
    console.error('[perf] CẢNH BÁO: web công an chưa đăng nhập ⇒ số byte WebSocket và số request của web không đo được.');
  }

  const moduleNames = await appPage.evaluate(() => Object.keys((window.__smartApp && window.__smartApp.modules) || {}));
  const stationLoop = await appPage.evaluate(() => {
    const m = window.__smartApp && window.__smartApp.modules;
    return m && m['station-loop'] ? { open: m['station-loop'].currentOpen ? m['station-loop'].currentOpen() : null } : null;
  });
  console.log(`[perf] module app: ${moduleNames.join(', ')}`);
  console.log(`[perf] camera đang mở: ${stationLoop && stationLoop.open}`);

  const setSpeed = async k => {
    const ok = await appPage.evaluate(v => {
      try { window.__smartApp.modules.clock.setSpeed(v); return window.__smartApp.modules.clock.speed(); } catch (e) { return null; }
    }, k);
    return ok;
  };
  const simT = () => appPage.evaluate(() => {
    try { return Number(window.__smartApp.traffic.sim.counters.t) || 0; } catch (e) { return null; }
  });
  const appFpsReported = () => appPage.evaluate(() => {
    try { return window.webgpuMaterials24.materialStatus.fps ?? null; } catch (e) { return null; }
  });

  // Một mẫu: FPS, heap, CPU luồng chính, request, byte WS, đĩa, số dòng.
  const readTask = async () => {
    const { metrics } = await appCdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map(x => [x.name, x.value]));
    return { heap: m.JSHeapUsedSize || 0, task: m.TaskDuration || 0, wall: m.Timestamp || Date.now() / 1000 };
  };

  async function takeSample(prev, phaseStartMs, index) {
    const wallMs = Date.now();
    const raf = await appPage.evaluate(() => window.__perfRaf32 || 0);
    const perf = await readTask();
    const visApp = await appPage.evaluate(() => document.visibilityState).catch(() => null);
    const visWeb = await webPage.evaluate(() => document.visibilityState).catch(() => null);
    const t = await simT();
    const reported = await appFpsReported();
    const dtWall = (wallMs - prev.wallMs) / 1000;
    const fps = dtWall > 0 ? (raf - prev.raf) / dtWall : null;
    const cpuPct = perf.task > prev.task ? ((perf.task - prev.task) / Math.max(0.001, perf.wall - prev.wall)) * 100 : 0;
    const reqByPath = reqPending.byPath;
    const reqTotal = reqPending.app + reqPending.web;
    const status = { ...respPending.byCode };
    const errors = { ...respPending.errorByPath };
    const sample = {
      index,
      t_s: round((wallMs - phaseStartMs) / 1000, 1),
      fps: round(fps, 1),
      fps_reported: reported == null ? null : Math.round(reported),
      heap_mb: round(perf.heap / 1048576, 2),
      cpu_pct: round(cpuPct, 1),
      cpu_ms_per_s: round(cpuPct * 10, 1),
      req_total: reqTotal, req_app: reqPending.app, req_web: reqPending.web, req_preflight: reqPending.preflight,
      req_by_path: { ...reqByPath },
      status_429: status[429] || 0,
      status_by_code: status,
      error_by_path: errors,
      ws_bytes: wsBytes, ws_frames: wsFrames,
      db_bytes: fileSize(DB_PATH), frames_bytes: dirSize(FRAMES_DIR).bytes,
      rows: readRows(),
      sim_t: t,
      app_visibility: visApp, web_visibility: visWeb
    };
    // đặt lại bộ đếm theo khoảng
    reqPending.byPath = {}; reqPending.app = 0; reqPending.web = 0; reqPending.preflight = 0;
    respPending.byCode = {}; respPending.errorByPath = {};
    wsBytes = 0; wsFrames = 0;
    return { sample, next: { raf, task: perf.task, wall: perf.wall, wallMs, sim_t: t, heap: perf.heap, db_bytes: sample.db_bytes, frames_bytes: sample.frames_bytes, rows: sample.rows, ws_bytes: 0 } };
  }

  const phases = [];
  async function runPhase(id, label, speed, prepare) {
    const phase = { id, label, speed, minutes: cfg.minutes, samples: [], notes: [], error: null, started_at: new Date().toISOString() };
    const phaseStartMs = Date.now();
    try {
      if (prepare) await prepare();
      await sleep(cfg.settleMs);
      // Mẫu "mốc 0" để có chênh lệch ngay từ đầu pha.
      const firstPerf = await readTask();
      let prev = {
        raf: await appPage.evaluate(() => window.__perfRaf32 || 0),
        task: firstPerf.task, wall: firstPerf.wall,
        wallMs: Date.now(), sim_t: await simT(),
        rows: readRows(), db_bytes: fileSize(DB_PATH), frames_bytes: dirSize(FRAMES_DIR).bytes
      };
      phase.visibility = {
        app: await appPage.evaluate(() => document.visibilityState).catch(() => null),
        web: await webPage.evaluate(() => document.visibilityState).catch(() => null),
        speed: await appPage.evaluate(() => { try { return window.__smartApp.modules.clock.speed(); } catch (e) { return null; } })
      };
      const deadline = Date.now() + cfg.minutes * 60000;
      let i = 0;
      while (Date.now() < deadline) {
        await sleep(Math.min(cfg.sampleMs, Math.max(1000, deadline - Date.now())));
        const res = await takeSample(prev, phaseStartMs, i++);
        phase.samples.push(res.sample);
        prev = res.next;
        const s = res.sample;
        console.log(`[perf] pha ${id} mẫu ${s.index} t=${s.t_s}s fps=${s.fps} heap=${s.heap_mb}MB cpu=${s.cpu_pct}% req=${s.req_total} ws=${s.ws_bytes}B rows.metrics=${s.rows.station_metrics}`);
      }
    } catch (e) {
      phase.error = String(e && e.message || e);
      console.error(`[perf] pha ${id} lỗi: ${phase.error}`);
    }
    phase.ended_at = new Date().toISOString();
    phases.push(phase);
    return phase;
  }

  const blankPage = await context.newPage();
  await blankPage.goto('about:blank');

  // Pha A: tab app hiện, ×1.
  if (cfg.phases.includes('A')) {
    await runPhase('A', 'tab app hiện, ×1', 1, async () => {
      await appPage.bringToFront();
      await setSpeed(1);
    });
  }
  // Pha B: mở trang trống đè lên (bringToFront) để tab app thành ẩn, ×1.
  if (cfg.phases.includes('B')) {
    await runPhase('B', 'tab app ẩn (trang trống đè lên), ×1', 1, async () => {
      await blankPage.bringToFront();
      const vis = await appPage.evaluate(() => document.visibilityState).catch(() => null);
      console.log(`[perf] pha B: document.visibilityState của tab app = ${vis}`);
    });
  }
  // Pha C: tab app hiện, tua ×10.
  if (cfg.phases.includes('C')) {
    await runPhase('C', 'tab app hiện, tua ×10', 10, async () => {
      await appPage.bringToFront();
      const got = await setSpeed(10);
      console.log(`[perf] pha C: tốc độ đặt = ${got}`);
    });
  }

  // ---- Tổng hợp
  const NUM_FIELDS = ['fps', 'fps_reported', 'heap_mb', 'cpu_pct', 'cpu_ms_per_s', 'req_total', 'req_app', 'req_web', 'ws_bytes', 'ws_frames', 'db_bytes', 'frames_bytes', 'sim_t'];
  const ROW_FIELDS = TABLES;

  const summarize = phase => {
    const sum = { n: phase.samples.length, mean: {}, peak: {}, first: {}, last: {}, per_hour: {}, errors: phase.error ? [phase.error] : [] };
    for (const f of NUM_FIELDS) {
      const vals = phase.samples.map(s => s[f]);
      sum.mean[f] = round(mean(vals), 2);
      sum.peak[f] = round(peak(vals), 2);
      sum.first[f] = vals.length ? vals[0] : null;
      sum.last[f] = vals.length ? vals[vals.length - 1] : null;
    }
    for (const t of ROW_FIELDS) {
      const vals = phase.samples.map(s => (s.rows ? s.rows[t] : null));
      sum.mean[`rows_${t}`] = round(mean(vals), 1);
      sum.peak[`rows_${t}`] = peak(vals);
      const fl = firstLast(vals);
      sum.first[`rows_${t}`] = fl.first;
      sum.last[`rows_${t}`] = fl.last;
    }
    // tốc độ tăng theo giờ (đầu → cuối pha)
    const dur = phase.samples.length > 1 ? (phase.samples[phase.samples.length - 1].t_s - phase.samples[0].t_s) / 3600 : 0;
    if (dur > 0) {
      const rate = (a, b) => round((b - a) / dur, 3);
      sum.per_hour.heap_mb = rate(sum.first.heap_mb, sum.last.heap_mb);
      sum.per_hour.db_mb = rate(sum.first.db_bytes / 1048576, sum.last.db_bytes / 1048576);
      sum.per_hour.frames_mb = rate(sum.first.frames_bytes / 1048576, sum.last.frames_bytes / 1048576);
      sum.per_hour.ws_mb = round((phase.samples.reduce((a, s) => a + s.ws_bytes, 0) / 1048576) / dur, 3);
      sum.per_hour.req = round(phase.samples.reduce((a, s) => a + s.req_total, 0) / dur, 1);
      sum.per_hour.sim_s = rate(sum.first.sim_t, sum.last.sim_t);
      for (const t of ROW_FIELDS) sum.per_hour[`rows_${t}`] = rate(sum.first[`rows_${t}`], sum.last[`rows_${t}`]);
    }
    // request theo đường dẫn (tổng cả pha) và theo phút
    sum.req_by_path_total = {};
    for (const s of phase.samples) {
      for (const [p, c] of Object.entries(s.req_by_path || {})) sum.req_by_path_total[p] = (sum.req_by_path_total[p] || 0) + c;
    }
    sum.req_by_path_per_min = {};
    if (dur > 0) for (const [p, c] of Object.entries(sum.req_by_path_total)) sum.req_by_path_per_min[p] = round(c / (dur * 60), 2);
    sum.ws_mb_per_hour = round((phase.samples.reduce((a, s) => a + s.ws_bytes, 0) / 1048576) / (dur || 1), 3);
    return sum;
  };

  for (const p of phases) p.summary = summarize(p);

  // Nguồn tải lớn nhất: chấm theo phần ngân sách (BUDGETS) của từng đơn vị.
  const loadCandidates = [];
  const pa = phases.find(p => p.id === 'A') || phases[0];
  const pb = phases.find(p => p.id === 'B');
  if (pa && pa.summary) {
    loadCandidates.push({ name: 'Vòng vẽ 3D (rAF/WebGPU) không có trần FPS', unit: 'cpu_pct', value: pa.summary.mean.cpu_pct, detail: `FPS trung bình ${pa.summary.mean.fps}, CPU luồng chính ${pa.summary.mean.cpu_pct} % một lõi` });
    loadCandidates.push({ name: 'Khung stream camera 1280×720 gửi lên backend rồi broadcast base64', unit: 'ws_mb_per_hour', value: pa.summary.ws_mb_per_hour, detail: `${pa.summary.ws_mb_per_hour} MB/giờ tới web; ${(pa.summary.req_by_path_per_min['/api/v1/station/frames'] || 0)} request/phút /station/frames` });
    loadCandidates.push({ name: 'Ghi đĩa: DB + ảnh bằng chứng/khung', unit: 'disk_mb_per_hour', value: round((pa.summary.per_hour.db_mb || 0) + (pa.summary.per_hour.frames_mb || 0), 3), detail: `DB ${pa.summary.per_hour.db_mb} MB/giờ, frames ${pa.summary.per_hour.frames_mb} MB/giờ` });
    const totalReqPerMin = Object.values(pa.summary.req_by_path_per_min).reduce((a, b) => a + b, 0);
    loadCandidates.push({ name: 'Nhịp request trạm (metrics/heat/heartbeat/frames)', unit: 'req_per_min', value: round(totalReqPerMin, 2), detail: `${totalReqPerMin} request/phút` });
  }
  if (pb && pb.summary && (pb.summary.mean.fps || 0) > 0 && pa && pa.summary) {
    loadCandidates.push({ name: 'Pha ẩn không giảm tải (rAF vẫn chạy)', unit: 'cpu_pct', value: pb.summary.mean.cpu_pct, detail: `pha B: FPS ${pb.summary.mean.fps}, CPU ${pb.summary.mean.cpu_pct} %` });
  }
  for (const c of loadCandidates) c.score = round(scoreLoad(c.unit, c.value), 3);
  const topLoads = loadCandidates.slice().sort((a, b) => b.score - a.score).slice(0, 3);

  const result = {
    task: 'PERF-1',
    generated_at: startedIso,
    finished_at: new Date().toISOString(),
    env: {
      app: appUrl, officer: officerUrl, api: base.api, var_dir: VAR_DIR,
      minutes_per_phase: cfg.minutes, sample_ms: cfg.sampleMs, settle_ms: cfg.settleMs,
      headless: cfg.headless, chrome: CHROME, viewport: '1600x900', phases: cfg.phases,
      web_logged_in: webLoggedIn, app_modules: moduleNames, open_camera: stationLoop && stationLoop.open,
      web_api_rebase: API_REBASE.from !== API_REBASE.to ? `${API_REBASE.from} → ${API_REBASE.to}` : null
    },
    budgets: BUDGETS,
    phases: phases.map(p => ({ id: p.id, label: p.label, speed: p.speed, minutes: p.minutes, started_at: p.started_at, ended_at: p.ended_at, error: p.error, visibility: p.visibility, samples: p.samples, summary: p.summary })),
    top_loads: topLoads,
    errors: errors.slice(0, 40)
  };
  fs.writeFileSync(path.join(cfg.out, `${cfg.tag}.json`), JSON.stringify(result, null, 2), 'utf8');

  // ---- baseline.md
  const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(d));
  const lines = [];
  lines.push(`# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)`);
  lines.push('');
  lines.push(`Sinh lúc ${result.finished_at}. Mỗi pha ${cfg.minutes} phút, lấy mẫu mỗi ${cfg.sampleMs / 1000} s. Trang: \`${appUrl}\` và \`${officerUrl}\` (đã đăng nhập: ${webLoggedIn ? 'có' : 'KHÔNG'}).`);
  lines.push('');
  lines.push(`| Pha | Mô tả | Tốc độ | visibilityState tab app |`);
  lines.push(`|---|---|---|---|`);
  for (const p of phases) lines.push(`| ${p.id} | ${p.label} | ×${p.speed} | ${p.visibility ? p.visibility.app : '—'} |`);
  lines.push('');
  lines.push(`## Trung bình / đỉnh mỗi cột theo pha`);
  lines.push('');
  lines.push('| Cột | ' + phases.map(p => `${p.id} TB`).join(' | ') + ' | ' + phases.map(p => `${p.id} đỉnh`).join(' | ') + ' |');
  lines.push('|---|' + phases.map(() => '---|').join('') + phases.map(() => '---|').join('') + '');
  const colLabels = {
    fps: 'FPS (rAF/giây)', fps_reported: 'FPS app báo', heap_mb: 'Heap JS (MB)', cpu_pct: 'CPU luồng chính (% lõi)',
    cpu_ms_per_s: 'CPU ms/giây', req_total: 'Request tới backend / 30 s', ws_bytes: 'Byte WS web nhận / 30 s', ws_frames: 'WS frame / 30 s',
    db_bytes: 'smart-traffic.db (byte)', frames_bytes: 'var/frames (byte)', sim_t: 'sim.t (giây sim)'
  };
  for (const f of Object.keys(colLabels)) {
    const cells = phases.map(p => fmt(p.summary && p.summary.mean[f], f === 'sim_t' ? 1 : 2));
    const peaks = phases.map(p => fmt(p.summary && p.summary.peak[f], f === 'sim_t' ? 1 : 2));
    lines.push(`| ${colLabels[f]} | ${cells.join(' | ')} | ${peaks.join(' | ')} |`);
  }
  for (const t of TABLES) {
    const cells = phases.map(p => fmt(p.summary && p.summary.mean[`rows_${t}`], 1));
    const peaks = phases.map(p => fmt(p.summary && p.summary.peak[`rows_${t}`], 1));
    lines.push(`| ${t} (dòng) | ${cells.join(' | ')} | ${peaks.join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Tốc độ tăng theo giờ (đầu → cuối pha)');
  lines.push('');
  lines.push('| Chỉ số | ' + phases.map(p => p.id).join(' | ') + ' |');
  lines.push('|---|' + phases.map(() => '---|').join('') + '');
  const rateLabels = { heap_mb: 'Heap JS (MB/giờ)', db_mb: 'DB (MB/giờ)', frames_mb: 'var/frames (MB/giờ)', req: 'Request backend (mỗi giờ)', sim_s: 'sim.t (giây sim / giây thực)' };
  for (const k of ['heap_mb', 'db_mb', 'frames_mb', 'req', 'sim_s']) {
    lines.push(`| ${rateLabels[k]} | ${phases.map(p => fmt(p.summary && p.summary.per_hour[k], 3)).join(' | ')} |`);
  }
  for (const t of TABLES) lines.push(`| ${t} (dòng/giờ) | ${phases.map(p => fmt(p.summary && p.summary.per_hour[`rows_${t}`], 1)).join(' | ')} |`);
  lines.push(`| Đĩa tổng (MB/giờ) | ${phases.map(p => fmt((p.summary.per_hour.db_mb || 0) + (p.summary.per_hour.frames_mb || 0), 3)).join(' | ')} |`);
  lines.push('');
  lines.push('## Request tới backend theo đường dẫn (request/phút)');
  lines.push('');
  const allPaths = [...new Set(phases.flatMap(p => Object.keys((p.summary && p.summary.req_by_path_per_min) || {})))].sort();
  lines.push('| Đường dẫn | ' + phases.map(p => p.id).join(' | ') + ' |');
  lines.push('|---|' + phases.map(() => '---|').join('') + '');
  for (const pth of allPaths) lines.push(`| \`${pth}\` | ${phases.map(p => fmt(p.summary && p.summary.req_by_path_per_min[pth], 2)).join(' | ')} |`);
  lines.push('');
  lines.push('## Ba nguồn tải lớn nhất');
  lines.push('');
  lines.push('| # | Nguồn | Chi tiết | Phần ngân sách |');
  lines.push('|---|---|---|---|');
  topLoads.forEach((c, i) => lines.push(`| ${i + 1} | ${c.name} | ${c.detail} | ${fmt(c.score, 2)}× (ngân sách ${BUDGETS[c.unit]} ${c.unit}) |`));
  lines.push('');
  lines.push(`Ngân sách xếp hạng: CPU ${BUDGETS.cpu_pct} %/lõi, WS ${BUDGETS.ws_mb_per_hour} MB/giờ, đĩa ${BUDGETS.disk_mb_per_hour} MB/giờ, request ${BUDGETS.req_per_min}/phút (theo docs/PERFORMANCE-24-7.md mục 4).`);
  lines.push('');
  if (errors.length) {
    lines.push('## Lỗi trang ghi được (40 dòng đầu)');
    lines.push('');
    for (const e of errors.slice(0, 40)) lines.push(`- ${e}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(cfg.out, `${cfg.tag}.md`), lines.join('\n') + '\n', 'utf8');

  console.log(`[perf] xong. Ghi ${path.join(cfg.out, cfg.tag + '.json')} và ${path.join(cfg.out, cfg.tag + '.md')}`);
  console.log(`[perf] 3 nguồn tải lớn nhất: ${topLoads.map(c => `${c.name} (${c.score}×)`).join(' · ')}`);
  const failed = phases.filter(p => p.error);
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  if (failed.length) { console.error(`[perf] pha lỗi: ${failed.map(p => p.id).join(', ')}`); process.exit(2); }
  process.exit(0);
})().catch(e => { console.error('[perf] LỖI:', e && e.stack || e); process.exit(1); });
