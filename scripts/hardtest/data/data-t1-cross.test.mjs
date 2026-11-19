import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

// Oracle độc lập: chỉ import biên transport của sản phẩm, không import suite/helper expected.
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const require = createRequire(import.meta.url);
const playwrightPath = process.env.SMTF_CROSS_PLAYWRIGHT || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const chromiumPath = process.env.SMTF_CROSS_CHROMIUM || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const python = process.env.SMTF_CROSS_PYTHON || 'C:/Users/Admin/orca/workspaces/SaiGon_SMTF/tautog/outputs/smart-traffic/backend/.venv311/Scripts/python.exe';
const out = path.resolve(root, process.env.SMTF_CROSS_OUTPUT || 'work/smtf-agent/data-t1-cross');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const evidence = { sha, startedAt: new Date().toISOString(), fault: process.env.SMTF_CROSS_FAULT || null, checks: [], api: {}, runtime: { timeline: [], console: [], pageerror: [], network: [] } };
const prefix = '/api/v1';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, staticServer, origin, runtimeContext, scene, control, runtimeSnapshot, runtimeToken, apiProcess;

async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: quá ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function poll(read, accept, ms, label) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await read(); if (accept(last)) return last; await pause(150); }
  assert.fail(`${label}: hết deadline; cuối=${JSON.stringify(last)}`);
}
function pending(value) {
  assert.equal(value.status, 'pending', 'HTTP thành công chỉ được pending trước ACK');
  assert.equal(value.reason_code, null);
  assert.equal(value.applied_t_sim, null);
}
function terminal(value, status, sim = null) {
  assert.equal(value.status, status);
  assert.equal(value.applied_t_sim, sim);
  assert.equal(value.reason_code, status === 'expired' ? 'COMMAND_EXPIRED' : status === 'rejected' ? 'COMMAND_REJECTED' : null);
}
async function rejects(call, status, code) {
  try { await call(); assert.fail(`Phải lỗi ${status}/${code}`); }
  catch (error) { assert.equal(error.status, status, error.message); assert.equal(error.code, code, error.message); }
}
function safeResult(value) { return JSON.parse(JSON.stringify(value)); }
async function save() { await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8'); }
function traced(name, operation) {
  return async () => {
    const entry = { name, startedAt: new Date().toISOString() }; evidence.checks.push(entry);
    try { await operation(); entry.status = 'PASS'; }
    catch (error) { entry.status = 'FAIL'; entry.error = String(error.stack || error); throw error; }
    finally { entry.finishedAt = new Date().toISOString(); await save(); }
  };
}
async function openPublic(context, build = 'cross-' + sha.slice(0, 12)) {
  const page = await context.newPage();
  await page.goto(origin + '/__cross.html');
  await page.evaluate(async buildId => {
    const { createTrafficTransport } = await import('/outputs/shared/public-demo/traffic-transport.js');
    window.crossTransport = createTrafficTransport({ mode: 'public', buildId });
  }, build);
  return page;
}
function publicRequest(page) {
  return async (method, route, body, token) => {
    const result = await bounded(page.evaluate(async input => {
      try { return { value: await window.crossTransport.request(input) }; }
      catch (error) { return { error: { status: error.status, code: error.code, message: error.message, name: error.name } }; }
    }, { method, path: prefix + route, body, token }), 5000, 'public request ' + route);
    if (result.error) throw Object.assign(new Error(result.error.message), result.error);
    if (process.env.SMTF_CROSS_FAULT === 'premature-applied' && route === '/officer/controls/signal-override' && method === 'POST') {
      return { ...result.value, status: 'applied', applied_t_sim: 999 };
    }
    return result.value;
  };
}
async function login(request, username, password) {
  return (await request('POST', '/auth/login', { username, password })).access_token;
}

before(async () => {
  assert.ok(out.startsWith(path.join(root, 'work') + path.sep), 'Evidence phải nằm trong vùng ignored work/');
  await fs.mkdir(out, { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };
  staticServer = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://cross.invalid').pathname);
      if (pathname === '/__cross.html') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kiểm chéo DATA-T1</title></html>'); }
      const filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) throw new Error('Ngoài root');
      const data = await fs.readFile(filename);
      res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream'); res.end(data);
    } catch { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + staticServer.address().port;
  const { chromium } = require(playwrightPath);
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  evidence.browser = { version: browser.version(), executable: chromiumPath, gpuPolicy: 'Mặc định Chromium; không ép SwiftShader' };
});
after(async () => {
  if (runtimeContext) {
    if (scene) await bounded(scene.screenshot({ path: path.join(out, 'runtime-final.png'), timeout: 10000 }), 11000, 'ảnh cuối').catch(error => { evidence.runtime.screenshotError = String(error); });
    await bounded(runtimeContext.tracing.stop({ path: path.join(out, 'runtime-trace.zip') }), 10000, 'trace').catch(error => { evidence.runtime.traceError = String(error); });
  }
  if (apiProcess) { apiProcess.kill(); await bounded(new Promise(resolve => apiProcess.once('exit', resolve)), 5000, 'stop API').catch(() => {}); }
  if (browser) await bounded(browser.close(), 15000, 'close browser').catch(error => { evidence.closeError = String(error); });
  if (staticServer) { staticServer.closeAllConnections(); await new Promise(resolve => staticServer.close(resolve)); }
  evidence.finishedAt = new Date().toISOString(); await save();
});

async function lifecycle(request, actors, mode) {
  const record = evidence.api[mode] = {};
  const { commander, officer, citizen, station } = actors;
  const snap0 = await request('GET', '/officer/snapshot', undefined, commander);
  assert.equal(snap0.station.status, 'missing');
  const audit0 = await request('GET', '/officer/audit', undefined, commander);
  await rejects(() => request('POST', '/officer/controls/scenario', { scenario: 'flood-nhc', command_id: 'cross-no-station' }, commander), 409, 'STATION_UNAVAILABLE');
  assert.equal((await request('GET', '/officer/audit', undefined, commander)).total, audit0.total, 'Thiếu trạm không sinh audit thành công');
  await rejects(() => request('POST', '/officer/controls/signal-mode', { mode: 'smart' }, officer), 403, 'FORBIDDEN');
  await rejects(() => request('GET', '/officer/snapshot', undefined, citizen), 403, 'FORBIDDEN');
  const beforeClaim = Date.now();
  const lease = await request('POST', '/station/lease', { station_id: 'CROSS-STATION', owner_id: 'cross-owner-a' }, station);
  assert.ok(Date.parse(lease.expires_at) >= beforeClaim + 5900 && Date.parse(lease.expires_at) <= Date.now() + 6100, 'Lease theo 6 giây wall clock');
  assert.match(lease.expires_at, /Z$/);
  await rejects(() => request('POST', '/station/lease', { station_id: 'CROSS-SECOND', owner_id: 'cross-owner-b' }, station), 409, 'CONFLICT');
  const beforeState = await request('GET', '/officer/controls/state', undefined, officer);
  const body = { node_id: 'HX-03', group: 1, duration_s: 19, command_id: 'cross-override-hx03' };
  const sent = await request('POST', '/officer/controls/signal-override', body, commander);
  pending(sent);
  assert.deepEqual(await request('GET', '/officer/controls/state', undefined, officer), beforeState, 'Enqueue chưa thay trạng thái đã áp dụng');
  await rejects(() => request('POST', '/station/commands/' + sent.command_id + '/ack', { status: 'applied', applied_t_sim: 17.3 }, lease.capability), 409, 'CONFLICT');
  const retry = await request('POST', '/officer/controls/signal-override', { command_id: body.command_id, duration_s: 19, group: 1, node_id: 'HX-03' }, commander);
  assert.equal(retry.command_id, sent.command_id); pending(retry);
  await rejects(() => request('POST', '/officer/controls/signal-override', { ...body, group: 0 }, commander), 409, 'CONFLICT');
  const batch = await request('GET', '/station/commands/pending', undefined, lease.capability);
  assert.equal(batch.commands.length, 1); assert.equal(batch.commands[0].event, 'cmd.signal-override');
  assert.equal(batch.commands[0].data.node_id, 'HX-03'); assert.equal(batch.commands[0].data.group, 1);
  assert.match(batch.commands[0].deadline_at, /Z$/);
  assert.equal((await request('GET', '/station/commands/pending', undefined, lease.capability)).commands.length, 0, 'Dequeue một lần');
  const applied = await request('POST', '/station/commands/' + sent.command_id + '/ack', { status: 'applied', applied_t_sim: 17.3 }, lease.capability);
  terminal(applied, 'applied', 17.3);
  assert.deepEqual(await request('POST', '/station/commands/' + sent.command_id + '/ack', { status: 'rejected', reason_code: 'COMMAND_REJECTED' }, lease.capability), applied, 'Terminal bất biến');
  const override = (await request('GET', '/officer/controls/state', undefined, officer)).overrides.find(row => row.node_id === 'HX-03');
  assert.equal(override.group, 1);
  const audit = await request('GET', '/officer/audit', undefined, commander);
  assert.equal(audit.items.filter(row => row.payload?.command_id === body.command_id && row.payload?.status === 'pending').length, 1, 'Retry không nhân audit enqueue');
  assert.equal(audit.items.filter(row => row.target_id === body.command_id && row.action === 'command.applied').length, 1, 'Có audit ACK nguyên tử');
  const fenced = await request('POST', '/officer/controls/scenario', { scenario: 'flood-nhc', command_id: 'cross-fenced' }, commander);
  pending(fenced);
  assert.equal((await request('GET', '/station/commands/pending', undefined, lease.capability)).commands.length, 1);
  await request('DELETE', '/station/lease', undefined, lease.capability);
  const replacement = await request('POST', '/station/lease', { station_id: 'CROSS-STATION', owner_id: 'cross-owner-b' }, station);
  assert.equal(replacement.generation, lease.generation + 1);
  assert.equal((await request('GET', '/station/commands/pending', undefined, replacement.capability)).commands.length, 0, 'Generation mới không replay lệnh đã giao');
  await rejects(() => request('POST', '/station/commands/cross-fenced/ack', { status: 'applied', applied_t_sim: 21 }, lease.capability), 403, 'FORBIDDEN');
  await rejects(() => request('POST', '/station/commands/cross-fenced/ack', { status: 'applied', applied_t_sim: 21 }, replacement.capability), 403, 'FORBIDDEN');
  const expiring = await request('POST', '/officer/controls/signal-mode', { mode: 'smart', command_id: 'cross-expire-unread' }, commander);
  pending(expiring);
  await pause(5200);
  await request('PUT', '/station/lease', {}, replacement.capability);
  await pause(5100);
  terminal(await request('GET', '/officer/commands/cross-fenced', undefined, officer), 'expired');
  const expired = await request('GET', '/officer/commands/cross-expire-unread', undefined, officer);
  terminal(expired, 'expired');
  terminal(await request('POST', '/station/commands/cross-expire-unread/ack', { status: 'applied', applied_t_sim: 100 }, replacement.capability), 'expired');
  assert.equal((await request('GET', '/station/commands/pending', undefined, replacement.capability)).commands.length, 0, 'Lệnh hết hạn không được giao');
  record.lease = { generation: lease.generation, expires_at: lease.expires_at };
  record.pending = sent; record.applied = applied; record.expired = expired;
  record.auditActions = audit.items.map(row => ({ action: row.action, target_id: row.target_id, payload: row.payload }));
  await request('DELETE', '/station/lease', undefined, replacement.capability);
  return { commander, officer, citizen };
}

test('CROSS-DATA-T1-PUBLIC: lease, vai trò, dedup, fencing và deadline thật', { timeout: 45000 }, traced('PUBLIC-LIFECYCLE', async () => {
  const context = await browser.newContext();
  const page = await openPublic(context); const request = publicRequest(page);
  const network = []; context.on('request', req => { if (req.url().includes('/api/') || /^wss?:/.test(req.url())) network.push(req.url()); });
  try {
    const commander = await login(request, 'chihuy_mau', 'SMTF-Mau-2026');
    const officer = await login(request, 'canbo_mau', 'SMTF-Mau-2026');
    const citizen = await login(request, 'congdan_mau', 'SMTF-Mau-2026');
    await lifecycle(request, { commander, officer, citizen }, 'public');
    assert.deepEqual(network, [], 'Public không gọi API HTTP hay WebSocket local');
  } finally { await context.close(); }
}));

test('CROSS-DATA-T1-ATOMIC: quota rollback, chia sẻ origin, tách profile và thu hồi phiên', { timeout: 30000 }, traced('PUBLIC-ATOMIC-AUTH', async () => {
  const context = await browser.newContext(); const isolated = await browser.newContext();
  try {
    const page = await openPublic(context); const request = publicRequest(page);
    const commander = await login(request, 'chihuy_mau', 'SMTF-Mau-2026');
    const officer = await login(request, 'canbo_mau', 'SMTF-Mau-2026');
    const admin = await login(request, 'quantri_mau', 'SMTF-Mau-2026');
    const lease = await request('POST', '/station/lease', { station_id: 'CROSS-ATOMIC', owner_id: 'atomic' });
    const baseline = await request('GET', '/officer/audit', undefined, commander);
    await page.evaluate(token => {
      window.crossEvents = []; window.crossBroadcast = [];
      window.crossOff = window.crossTransport.subscribe(event => window.crossEvents.push(event), token);
      const post = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (data) { window.crossBroadcast.push(data); return post.call(this, data); };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'audit') { IDBObjectStore.prototype.put = put; throw new DOMException('Quota thử độc lập', 'QuotaExceededError'); }
        return put.apply(this, args);
      };
    }, commander);
    await rejects(() => request('POST', '/officer/controls/scenario', { scenario: 'flood-nhc', command_id: 'cross-abort-audit' }, commander), 503, 'STORAGE_UNAVAILABLE');
    await rejects(() => request('GET', '/officer/commands/cross-abort-audit', undefined, commander), 404, 'NOT_FOUND');
    assert.equal((await request('GET', '/officer/audit', undefined, commander)).total, baseline.total);
    await pause(150);
    assert.deepEqual(await page.evaluate(() => ({ events: window.crossEvents, broadcast: window.crossBroadcast })), { events: [], broadcast: [] }, 'Abort không phát event thành công');
    const retried = await request('POST', '/officer/controls/scenario', { scenario: 'flood-nhc', command_id: 'cross-abort-audit' }, commander);
    pending(retried);
    assert.equal((await request('GET', '/officer/audit', undefined, commander)).total, baseline.total + 1, 'Retry sau quota commit được cả command/audit');
    const delivered = await poll(() => page.evaluate(() => ({ events: window.crossEvents, broadcast: window.crossBroadcast })), value => value.events.some(row => row.data?.command_id === 'cross-abort-audit'), 3000, 'notification sau commit');
    assert.ok(delivered.broadcast.length > 0);
    assert.ok(delivered.broadcast.every(message => Object.keys(message).length === 1 && Number.isSafeInteger(message.id)), 'BroadcastChannel chỉ gửi ID metadata');
    evidence.api.atomic = { failedId: 'cross-abort-audit', retried, eventNames: delivered.events.map(row => row.event), broadcast: delivered.broadcast };
    const second = await openPublic(context, 'cross-build-b');
    const secondRequest = publicRequest(second);
    const shared = await login(secondRequest, 'chihuy_mau', 'SMTF-Mau-2026');
    assert.equal((await secondRequest('GET', '/officer/snapshot', undefined, shared)).station.id, lease.station_id, 'Build khác vẫn chung kho origin');
    const separate = await openPublic(isolated); const separateRequest = publicRequest(separate);
    const separateToken = await login(separateRequest, 'chihuy_mau', 'SMTF-Mau-2026');
    assert.equal((await separateRequest('GET', '/officer/snapshot', undefined, separateToken)).station.status, 'missing');
    const users = await request('GET', '/admin/users', undefined, admin);
    const target = users.items.find(row => row.username === 'canbo_mau');
    await request('PUT', `/admin/users/${target.id}/role`, { role: 'commander' }, admin);
    await rejects(() => request('POST', '/officer/controls/signal-mode', { mode: 'smart' }, officer), 401, 'UNAUTHORIZED');
    await request('POST', '/auth/logout', {}, commander);
    await rejects(() => request('GET', '/auth/me', undefined, commander), 401, 'UNAUTHORIZED');
    await page.evaluate(() => { window.crossOff(); window.crossOff(); });
  } finally { await context.close(); await isolated.close(); }
}));

async function runProcess(command, args, options, logFile) {
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const code = await bounded(new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }), 45000, command);
  await fs.writeFile(logFile, output, 'utf8'); assert.equal(code, 0, output);
}
test('CROSS-DATA-T1-LOCAL: HTTP FastAPI và SQLite độc lập giữ lifecycle v1', { timeout: 80000 }, traced('LOCAL-HTTP-LIFECYCLE', async () => {
  const cwd = path.join(root, 'outputs/smart-traffic/backend');
  const varDir = path.join(out, 'sqlite-' + Date.now());
  const env = { ...process.env, SMART_VAR_DIR: varDir, SMART_DB_PATH: path.join(varDir, 'cross.db'), SMART_CLEANUP: '0', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
  await runProcess(python, ['-c', 'from app.db import get_conn,init_db; c=get_conn(); init_db(c); c.close(); from app.seed.run_seed import run_seed; run_seed()'], { cwd, env }, path.join(out, 'local-init.log'));
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  apiProcess = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; apiProcess.stdout.on('data', data => { log += data; }); apiProcess.stderr.on('data', data => { log += data; });
  try {
    const apiBase = 'http://127.0.0.1:' + port;
    await poll(async () => fetch(apiBase + '/api/v1/health').then(response => response.ok).catch(() => false), Boolean, 15000, 'FastAPI ready');
    const { createTrafficTransport } = await import('../../../outputs/shared/public-demo/traffic-transport.js');
    const transport = createTrafficTransport({ mode: 'local', apiBase });
    const request = (method, route, body, token) => transport.request({ method, path: prefix + route, body, token });
    const commander = await login(request, 'commander1', 'SaiGon@2026');
    const officer = await login(request, 'officer1', 'SaiGon@2026');
    const citizen = await login(request, 'citizen1', 'SaiGon@2026');
    const station = await login(request, 'station-3d', 'SaiGon@2026');
    await lifecycle(request, { commander, officer, citizen, station }, 'local');
  } finally {
    await fs.writeFile(path.join(out, 'local-api.log'), log, 'utf8');
    apiProcess.kill(); await bounded(new Promise(resolve => apiProcess.once('exit', resolve)), 5000, 'stop API').catch(() => {}); apiProcess = undefined;
  }
}));

test('CROSS-DATA-T1-RUNTIME: scene thật áp mode/scenario/override rồi snapshot đọc lõi', { timeout: 100000 }, traced('ACTUAL-SCENE-LIFECYCLE', async () => {
  runtimeContext = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await runtimeContext.tracing.start({ screenshots: true, snapshots: true, sources: false });
  control = await openPublic(runtimeContext); const request = publicRequest(control);
  evidence.runtime.gpu = await control.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { vendor: gl?.getParameter(ext?.UNMASKED_VENDOR_WEBGL || gl.VENDOR), renderer: gl?.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) };
  });
  runtimeToken = await login(request, 'chihuy_mau', 'SMTF-Mau-2026');
  scene = await runtimeContext.newPage();
  scene.on('console', message => evidence.runtime.console.push({ type: message.type(), text: message.text() }));
  scene.on('pageerror', error => evidence.runtime.pageerror.push(String(error)));
  runtimeContext.on('request', req => { if (req.url().includes('/api/') || /^wss?:/.test(req.url())) evidence.runtime.network.push(req.url()); });
  const started = Date.now();
  const url = origin + '/outputs/hcmc-poc/webgpu-materials-24.html?app=smart&region=bac&transport=public&mode=lite&backend=webgl';
  evidence.runtime.url = url;
  await scene.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  runtimeSnapshot = await poll(async () => {
    const value = await request('GET', '/officer/snapshot', undefined, runtimeToken);
    evidence.runtime.timeline.push({ elapsedMs: Date.now() - started, station: value.station, t_sim: value.simulation.t_sim, revision: value.revision });
    return value;
  }, value => value.station.status === 'active' && value.simulation.t_sim > 0, 60000, 'Actual station active');
  evidence.runtime.initialSnapshot = safeResult(runtimeSnapshot);
  const readCore = () => bounded(scene.evaluate(() => {
    const app = window.__smartApp;
    return { t: app.traffic.sim.counters.t, mode: app.controller.getMode(), counters: { ...app.traffic.sim.counters }, scenario: app.modules.scenarios.scenarios.status(), modules: Object.keys(app.modules) };
  }), 5000, 'đọc actual core');
  const before = await readCore(); evidence.runtime.before = before;
  assert.ok(before.modules.includes('transport') && before.modules.includes('scenarios'));
  const mode = before.mode === 'smart' ? 'fixed' : 'smart';
  const modeCommand = await request('POST', '/officer/controls/signal-mode', { mode, command_id: 'cross-actual-mode' }, runtimeToken);
  pending(modeCommand);
  const modeAck = await poll(() => request('GET', '/officer/commands/cross-actual-mode', undefined, runtimeToken), row => row.status !== 'pending', 10000, 'ACK mode thật');
  const afterMode = await readCore();
  terminal(modeAck, 'applied', modeAck.applied_t_sim);
  assert.ok(modeAck.applied_t_sim >= before.t && modeAck.applied_t_sim <= afterMode.t, 'ACK dùng counter sim trong callback');
  assert.equal(afterMode.mode, mode, 'Controller thật nhận mode');
  await request('POST', '/officer/controls/scenario', { scenario: 'flood-nhc', params: {}, command_id: 'cross-actual-flood' }, runtimeToken);
  const scenarioAck = await poll(() => request('GET', '/officer/commands/cross-actual-flood', undefined, runtimeToken), row => row.status !== 'pending', 10000, 'ACK scenario thật');
  terminal(scenarioAck, 'applied', scenarioAck.applied_t_sim);
  const afterScenario = await readCore(); assert.equal(afterScenario.scenario.key, 'flood-nhc'); assert.ok(afterScenario.scenario.active);
  const matching = await poll(() => request('GET', '/officer/snapshot', undefined, runtimeToken), value => value.simulation.mode === mode && value.simulation.scenario === 'flood-nhc', 5000, 'snapshot phản ánh lõi');
  assert.ok(matching.simulation.t_sim >= scenarioAck.applied_t_sim);
  const nodeId = 'HX-04';
  const preOverride = await bounded(scene.evaluate(node => {
    const app = window.__smartApp; return app.controller.stateOf(node, app.traffic.sim.counters.t);
  }, nodeId), 5000, 'state trước override');
  const serving = preOverride.phases.find(row => row.phase === 'green' || row.phase === 'yellow')?.group ?? 0;
  const target = serving === 0 ? 1 : 0;
  const overrideCommand = await request('POST', '/officer/controls/signal-override', { node_id: nodeId, group: target, duration_s: 23, command_id: 'cross-actual-override' }, runtimeToken);
  pending(overrideCommand);
  const overrideAck = await poll(() => request('GET', '/officer/commands/cross-actual-override', undefined, runtimeToken), value => value.status !== 'pending', 10000, 'ACK override thật');
  terminal(overrideAck, 'applied', overrideAck.applied_t_sim);
  const overridden = await bounded(scene.evaluate(node => {
    const app = window.__smartApp; return { t: app.traffic.sim.counters.t, state: app.controller.stateOf(node, app.traffic.sim.counters.t) };
  }, nodeId), 5000, 'state sau override');
  assert.equal(overridden.state.override?.group, target, 'Controller thật có override đúng nhóm');
  assert.ok(overridden.state.phases.filter(row => row.phase === 'green').length <= 1, 'Không có hai nhóm cùng xanh');
  const transitions = [overridden];
  if (preOverride.phases.some(row => row.group === serving && row.phase === 'green')) {
    const green = await poll(async () => {
      const value = await bounded(scene.evaluate(node => { const app = window.__smartApp; return { t: app.traffic.sim.counters.t, state: app.controller.stateOf(node, app.traffic.sim.counters.t) }; }, nodeId), 3000, 'pha override');
      transitions.push(value);
      assert.ok(value.state.phases.filter(row => row.phase === 'green').length <= 1);
      return value;
    }, value => value.state.phases.some(row => row.group === target && row.phase === 'green'), 12000, 'override qua clearance');
    assert.ok(green.t >= overrideAck.applied_t_sim + 4.9, 'Đổi nhóm phải qua vàng 3s + đỏ chung 2s (bước sim 0,1s)');
    assert.ok(transitions.some(value => value.state.phases.some(row => row.group === serving && row.phase === 'yellow')), 'Quan sát pha vàng của nhóm cũ');
    assert.ok(transitions.some(value => value.state.phases.every(row => row.phase === 'red')), 'Quan sát đỏ chung');
  }
  const text = 'Đi chậm qua nút giao';
  const vmsCommand = await request('PUT', '/officer/vms/VMS-04', { mode: 'manual', text, command_id: 'cross-actual-vms04' }, runtimeToken);
  pending(vmsCommand);
  const vmsAck = await poll(() => request('GET', '/officer/commands/cross-actual-vms04', undefined, runtimeToken), value => value.status !== 'pending', 10000, 'ACK VMS thật');
  terminal(vmsAck, 'applied', vmsAck.applied_t_sim);
  const vms = await bounded(scene.evaluate(() => window.__smartApp.vms.manualOf('VMS-04')), 5000, 'VMS thật');
  assert.deepEqual(vms, { text, lines: [text] });
  evidence.runtime.transitions = transitions; evidence.runtime.vmsAck = vmsAck; evidence.runtime.vms = vms;
  runtimeSnapshot = await request('GET', '/officer/snapshot', undefined, runtimeToken);
  const captured = await poll(() => request('GET', '/officer/snapshot', undefined, runtimeToken), value => value.cameras.some(camera => camera.frame_id && camera.status === 'ready'), 6000, 'metadata frame đã gửi thật');
  const camera = captured.cameras.find(item => item.frame_id && item.status === 'ready');
  const media = await control.evaluate(async ({ id, token }) => {
    const blob = await window.crossTransport.readMedia('/api/v1/media/stream/' + id, { token });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const cancel = new AbortController(); cancel.abort();
    let aborted;
    try { await window.crossTransport.readMedia('/api/v1/media/stream/' + id, { token, signal: cancel.signal }); }
    catch (error) { aborted = error.name; }
    return { isBlob: blob instanceof Blob, size: blob.size, type: blob.type, jpeg: Array.from(bytes.slice(0, 2)), aborted };
  }, { id: camera.camera_id, token: runtimeToken });
  assert.ok(media.isBlob && media.size > 0); assert.equal(media.type, 'image/jpeg'); assert.deepEqual(media.jpeg, [255, 216]); assert.equal(media.aborted, 'AbortError');
  evidence.runtime.media = { camera_id: camera.camera_id, frame_id: camera.frame_id, ...media };
  assert.equal(runtimeSnapshot.kpi.trips_completed, (await readCore()).counters.trips_completed || 0, 'Không lấy respawn làm trips_completed');
  assert.deepEqual(runtimeSnapshot.routes, [], 'T1 chưa giả lập route của SIM-T2');
  for (const camera of runtimeSnapshot.cameras.filter(camera => !camera.frame_id)) {
    assert.equal(camera.status, 'missing'); assert.equal(camera.captured_at, null); assert.equal(camera.width, null); assert.equal(camera.height, null);
  }
  assert.deepEqual(evidence.runtime.pageerror, []);
  assert.deepEqual(evidence.runtime.network, [], 'Scene public không chạm API/WS local');
  evidence.runtime.modeAck = modeAck; evidence.runtime.scenarioAck = scenarioAck; evidence.runtime.overrideAck = overrideAck;
  evidence.runtime.preOverride = preOverride; evidence.runtime.overridden = overridden; evidence.runtime.snapshot = safeResult(runtimeSnapshot);
  await scene.screenshot({ path: path.join(out, 'runtime-scene.png'), timeout: 15000 });
}));

test('CROSS-DATA-T1-SEED: snapshot thực thi có seed số để tái hiện', traced('ACTUAL-SNAPSHOT-SEED', async () => {
  assert.ok(runtimeSnapshot, 'Cần snapshot từ scene thật');
  assert.ok(Number.isInteger(runtimeSnapshot.simulation.seed), `snapshot.simulation.seed phải là số nguyên, thực tế=${JSON.stringify(runtimeSnapshot.simulation.seed)}`);
}));

test('CROSS-DATA-T1-CAMERA-ID: camera dùng junction_id cụm logic có trong snapshot', traced('ACTUAL-SNAPSHOT-CAMERA-CLUSTER', async () => {
  assert.ok(runtimeSnapshot, 'Cần snapshot từ scene thật');
  const ids = new Set(runtimeSnapshot.junctions.map(row => row.junction_id));
  assert.ok(ids.size > 0);
  const invalid = runtimeSnapshot.cameras.filter(camera => !ids.has(camera.junction_id)).map(camera => ({ camera_id: camera.camera_id, junction_id: camera.junction_id }));
  assert.deepEqual(invalid, [], 'Mỗi camera phải tham chiếu junction_id cụm logic, không dùng node_id');
}));

test('CROSS-DATA-T1-ORACLE-RED: assertion bắt phản hồi thành công trước ACK', traced('ORACLE-NEGATIVE-CONTROL', async () => {
  const observed = evidence.api.public?.pending;
  assert.ok(observed, 'Cần phản hồi thật từ public lifecycle');
  pending(observed);
  assert.throws(() => pending({ ...observed, status: 'applied', applied_t_sim: 999 }), /HTTP thành công chỉ được pending/);
}));
