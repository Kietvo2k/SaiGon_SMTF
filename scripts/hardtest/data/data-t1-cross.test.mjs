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
const evidence = { sha, suiteDirty: execFileSync('git', ['status', '--porcelain', '--', 'scripts/hardtest/data/data-t1-cross.test.mjs'], { cwd: root, encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(), fault: process.env.SMTF_CROSS_FAULT || null, checks: [], api: {}, runtime: { timeline: [], console: [], pageerror: [], network: [] } };
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
async function cameraOracle() {
  const registry = async file => JSON.parse(await fs.readFile(path.join(root, 'outputs/smart-traffic/backend/app/seed', file), 'utf8'));
  const [nodes, cameras] = await Promise.all([registry('node_map.json'), registry('cameras.json')]);
  const clusters = new Map(nodes.map(row => [row.node_id, row.cluster_id]));
  return new Map(cameras.map(row => [row.camera_id, clusters.get(row.node_id)]));
}
async function verifyCameraJoin(snapshot) {
  const expected = await cameraOracle();
  assert.ok(expected.size > 0 && [...expected.values()].every(Boolean), 'Registry camera phải nối được với cụm nguồn');
  assert.deepEqual([...new Map(snapshot.cameras.map(row => [row.camera_id, row.junction_id]))].sort(), [...expected].sort(), 'camera_id → node_id → cluster_id từ cấu hình chuẩn');
  assert.equal(snapshot.cameras.length, expected.size, 'Không có camera trùng ID');
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
    if (scene) {
      const inspect = () => bounded(scene.evaluate(() => {
        const loader = document.querySelector('#loading');
        const style = loader && getComputedStyle(loader);
        return { ready: window.crossRendererReady, done: loader?.classList.contains('done'), visibility: style?.visibility, loaderText: document.querySelector('#loaderText')?.textContent, canvas: Boolean(document.querySelector('#scene canvas')) };
      }), 1500, 'kiểm renderer và lớp nạp');
      try {
        const value = await poll(async () => {
          try { return evidence.runtime.visibility = await inspect(); } catch (error) { return { error: error.message }; }
        }, row => row.ready !== null && Number.isFinite(row.ready) && row.done && row.visibility === 'hidden' && row.canvas, 15000, 'renderer-ready và loading.done');
        evidence.runtime.visibility = { ...value, status: 'observed' };
      } catch (error) { evidence.runtime.visibility = { ...evidence.runtime.visibility, status: 'unconfirmed', reason: error.message }; }
    }
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
async function withLocal(operation, name = 'local') {
  const cwd = path.join(root, 'outputs/smart-traffic/backend');
  const varDir = path.join(out, 'sqlite-' + Date.now());
  const env = { ...process.env, SMART_VAR_DIR: varDir, SMART_DB_PATH: path.join(varDir, 'cross.db'), SMART_CLEANUP: '0', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
  await runProcess(python, ['-c', 'from app.db import get_conn,init_db; c=get_conn(); init_db(c); c.close(); from app.seed.run_seed import run_seed; run_seed()'], { cwd, env }, path.join(out, name + '-init.log'));
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
    return await operation(request, { commander, officer, citizen, station }, transport, apiBase);
  } finally {
    await fs.writeFile(path.join(out, name + '-api.log'), log, 'utf8');
    apiProcess.kill(); await bounded(new Promise(resolve => apiProcess.once('exit', resolve)), 5000, 'stop API').catch(() => {}); apiProcess = undefined;
  }
}
test('CROSS-DATA-T1-LOCAL: HTTP FastAPI và SQLite độc lập giữ lifecycle v1', { timeout: 80000 }, traced('LOCAL-HTTP-LIFECYCLE', () => withLocal(async (request, actors) => {
  const fallback = await request('GET', '/officer/snapshot', undefined, actors.officer);
  await verifyCameraJoin(fallback);
  await lifecycle(request, actors, 'local');
})));

function wireMessages(url, token) {
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/ws/v1');
  const events = [];
  const closed = new Promise(resolve => ws.addEventListener('close', event => resolve(event.code), { once: true }));
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => { ws.send(JSON.stringify({ type: 'auth', token })); resolve(); }, { once: true });
    ws.addEventListener('error', () => reject(new Error('Không mở được WebSocket kiểm')), { once: true });
  });
  ws.addEventListener('message', event => events.push(JSON.parse(event.data)));
  return { ws, opened, closed, events };
}

async function round1Wire(request, actors, subscribe, readMedia, mode, apiBase) {
  const record = evidence.api['r1-' + mode] = {};
  const { commander, officer, station } = actors;
  const get = (route, token = officer) => request('GET', route, undefined, token);
  const events = [];
  const unsubscribe = await subscribe(events, officer);
  const sockets = [];
  try {
    if (apiBase) {
      const legacy = wireMessages(apiBase, station); sockets.push(legacy);
      await bounded(legacy.opened, 3000, 'WS JWT trước lease');
      await poll(async () => {
        if (legacy.ws.readyState === WebSocket.OPEN) legacy.ws.send(JSON.stringify({ event: 'station.heartbeat', data: { probe: 'legacy-before' } }));
        return events.find(event => event.event === 'station.heartbeat' && event.data.probe === 'legacy-before');
      }, Boolean, 3000, 'Observer WS đã auth và JWT legacy còn hoạt động');
    }
    const lease = await request('POST', '/station/lease', { station_id: 'CROSS-R1', owner_id: 'cross-wire' }, station);
    const claimRevision = (await get('/officer/snapshot')).revision;
    await poll(async () => events.some(event => event.event === 'snapshot.updated' && event.data.revision === claimRevision), Boolean, 3500, 'Observer thấy lease commit');
    if (apiBase) {
      const legacyNew = wireMessages(apiBase, station); sockets.push(legacyNew);
      await bounded(legacyNew.opened, 3000, 'WS JWT mới');
      assert.equal(await bounded(legacyNew.closed, 3000, 'JWT mới bị chặn'), 4403);
      await rejects(() => request('POST', '/station/heartbeat', {}, station), 403, 'FORBIDDEN');
      const current = wireMessages(apiBase, lease.capability); sockets.push(current);
      await bounded(current.opened, 3000, 'WS capability hiện hành');
      await poll(async () => {
        current.ws.send(JSON.stringify({ event: 'station.heartbeat', data: { probe: 'capability-live' } }));
        return events.some(event => event.event === 'station.heartbeat' && event.data.probe === 'capability-live');
      }, Boolean, 2000, 'Capability WS đã auth');
    }
    const commandPath = '/officer/controls/signal-override';
    const ids = ['R1/Bến %', 'R1%2FBến %'];
    const encoded = ids.map(encodeURIComponent);
    const commandRead = id => get('/officer/commands/' + id);
    const ack = (id, value) => request('POST', '/station/commands/' + id + '/ack', value, lease.capability);
    const submitted = Date.now();
    for (const [i, id] of ids.entries()) {
      const body = { node_id: 'HX-06', group: i, duration_s: 1, command_id: id };
      const item = await request('POST', commandPath, body, commander);
      pending(item); assert.equal(item.command_id, id);
      assert.equal((await request('POST', commandPath, body, commander)).command_id, id);
      const read = await commandRead(encoded[i]); pending(read); assert.equal(read.command_id, id);
    }
    if (apiBase) {
      await poll(async () => sockets[2].events.filter(event => event.event === 'cmd.signal-override').length === ids.length, Boolean, 2000, 'Capability nhận đủ hai cmd trên WS');
      assert.deepEqual(sockets[2].events.filter(event => event.event === 'cmd.signal-override').map(event => event.data.command_id), ids);
      assert.ok(!sockets[0].events.some(event => event.event.startsWith('cmd.')), 'JWT cũ không nhận cmd outbound');
      assert.ok(!events.some(event => event.event.startsWith('cmd.')), 'Officer không nhận cmd dành cho trạm');
    }
    const queue = await get('/station/commands/pending', lease.capability);
    assert.deepEqual(queue.commands.map(row => row.command_id).sort(), [...ids].sort());
    await pause(Math.max(0, submitted + 1200 - Date.now()));
    const ackStart = Date.now();
    terminal(await ack(encoded[0], { status: 'applied', applied_t_sim: 22.4 }), 'applied', 22.4);
    const ackFinish = Date.now();
    const atAck = await get('/officer/controls/state');
    const override = atAck.overrides.find(row => row.node_id === 'HX-06');
    assert.equal(override?.group, 0, 'Override một giây còn hiệu lực ngay sau ACK muộn');
    assert.equal(override.until_t_sim, 23.4);
    assert.ok(Date.parse(override.until_at) >= ackStart + 900 && Date.parse(override.until_at) <= ackFinish + 1100, 'TTL bắt đầu theo lúc ACK');
    terminal(await commandRead(encoded[0]), 'applied', 22.4); pending(await commandRead(encoded[1]));
    terminal(await ack(encoded[1], { status: 'rejected', reason_code: 'COMMAND_REJECTED' }), 'rejected');
    assert.deepEqual((await commandRead(encoded[1])).command_id, ids[1]);
    record.commands = { ids, encoded, ackDelayMs: ackStart - submitted, override };
    await poll(() => get('/officer/controls/state'), state => !state.overrides.some(row => row.node_id === 'HX-06'), 1800, 'Override hết hạn theo wall clock');
    terminal(await commandRead(encoded[0]), 'applied', 22.4);

    await request('PUT', '/station/lease', {}, lease.capability);
    const liveId = 'cross-r1-live-override';
    pending(await request('POST', commandPath, { node_id: 'HX-06', group: 1, duration_s: 25, command_id: liveId }, commander));
    assert.equal((await get('/station/commands/pending', lease.capability)).commands[0].command_id, liveId);
    terminal(await ack(liveId, { status: 'applied', applied_t_sim: 27.2 }), 'applied', 27.2);
    assert.equal((await get('/officer/controls/state')).overrides.find(row => row.node_id === 'HX-06')?.group, 1);
    const signal = { node_id: 'HX-06', cluster_id: 'HX-C5', t_sim: 31.2, phase: 'yellow', group: 1, mode: 'smart', override_by: null, reason: null };
    await request('POST', '/station/metrics', { station_id: lease.station_id, t: 31.2, t_sim: 31.2, signal_mode: 'smart', kpi: { queue_max: 37 }, overrides: [], signal_states: [signal] }, lease.capability);
    const state = await get('/officer/controls/state');
    assert.equal(state.mode, 'smart'); assert.deepEqual(state.overrides, []);
    const signalRead = state.signals.find(row => row.node_id === signal.node_id);
    for (const field of ['node_id', 'cluster_id', 't_sim', 'phase', 'group', 'mode']) assert.equal(signalRead?.[field], signal[field], 'Telemetry giữ đúng ' + field);
    const snapshot = await get('/officer/snapshot');
    assert.equal(snapshot.simulation.mode, 'smart'); assert.equal(snapshot.simulation.t_sim, 31.2); assert.equal(snapshot.kpi.queue_max, 37);
    record.metrics = { state: { mode: state.mode, overrides: state.overrides, signal: signalRead }, revision: snapshot.revision, simulation: snapshot.simulation };

    await request('PUT', '/station/lease', {}, lease.capability);
    const cameraId = 'CAM-HX-010';
    for (const seq of [83, 84]) {
      const bytes = [255, 216, seq, 255, 217];
      const frame = { camera_id: cameraId, seq, frame_id: 'cross-r1-frame-' + seq, t: new Date().toISOString(), w: 320, h: 180, jpeg_base64: Buffer.from(bytes).toString('base64') };
      const old = await get('/officer/snapshot');
      const eventStart = events.length;
      await request('POST', '/station/frames', frame, lease.capability);
      const fresh = await get('/officer/snapshot');
      assert.equal(fresh.revision, old.revision + 1, 'Mỗi frame commit tăng đúng một revision');
      const frameMeta = fresh.cameras.find(row => row.camera_id === cameraId);
      assert.equal(frameMeta?.frame_id, frame.frame_id); assert.equal(frameMeta.captured_at, frame.t);
      assert.equal(frameMeta.status, 'ready'); assert.equal(frameMeta.width, 320); assert.equal(frameMeta.height, 180);
      assert.deepEqual(await readMedia(prefix + '/media/stream/' + cameraId, officer), bytes);
      const pair = await poll(async () => events.slice(eventStart).filter(event =>
        event.event === 'stream.updated' && event.data.camera_id === cameraId && event.data.seq === seq ||
        event.event === 'snapshot.updated' && event.data.revision === fresh.revision), value => value.length >= 2, 3500, 'Hai event của frame ' + seq);
      assert.deepEqual(pair.map(event => event.event).sort(), ['snapshot.updated', 'stream.updated']);
      (record.frames ??= []).push({ revision: fresh.revision, frameMeta, events: pair });
    }
    if (apiBase) {
      const before = await get('/officer/snapshot');
      const total = (await get('/officer/audit', commander)).total;
      const count = events.length;
      await rejects(() => request('POST', '/station/frames', { camera_id: cameraId, seq: 85, t: new Date().toISOString(), w: 1, h: 1, jpeg_base64: '/9gA/9k=' }, station), 403, 'FORBIDDEN');
      const legacy = sockets[0];
      legacy.ws.send(JSON.stringify({ event: 'station.heartbeat', data: { probe: 'legacy-after' } }));
      assert.equal(await bounded(legacy.closed, 3000, 'JWT mở trước lease bị chặn inbound'), 4403);
      const after = await get('/officer/snapshot');
      assert.equal(after.revision, before.revision); assert.deepEqual(after.cameras, before.cameras);
      assert.deepEqual(await readMedia(prefix + '/media/stream/' + cameraId, officer), [255, 216, 84, 255, 217]);
      assert.equal((await get('/officer/audit', commander)).total, total);
      assert.deepEqual(events.slice(count), [], 'JWT bị từ chối không phát event');
      record.legacy = { before: 'heartbeat delivered', newClose: 4403, afterClose: 4403, frameMutation: false };
    }
    await request('DELETE', '/station/lease', undefined, lease.capability);
  } finally {
    await unsubscribe();
    for (const socket of sockets) socket.ws.close();
  }
}

test('CROSS-DATA-T1-R1-PUBLIC: round-trip ID, TTL từ ACK, telemetry và hai frame commit', { timeout: 30000 }, traced('R1-PUBLIC-WIRE', async () => {
  const context = await browser.newContext();
  try {
    const page = await openPublic(context);
    const request = publicRequest(page);
    const commander = await login(request, 'chihuy_mau', 'SMTF-Mau-2026');
    const officer = await login(request, 'canbo_mau', 'SMTF-Mau-2026');
    const subscriber = async (events, token) => {
      await page.exposeFunction('captureCrossEvent', event => { events.push(event); });
      await page.evaluate(value => { window.crossOff = window.crossTransport.subscribe(window.captureCrossEvent, value); }, token);
      return () => page.evaluate(() => window.crossOff());
    };
    const readMedia = (path, token) => page.evaluate(async input => Array.from(new Uint8Array(await (await window.crossTransport.readMedia(input.path, { token: input.token })).arrayBuffer())), { path, token });
    await round1Wire(request, { commander, officer }, subscriber, readMedia, 'public');
  } finally { await context.close(); }
}));

test('CROSS-DATA-T1-R1-LOCAL: Uvicorn HTTP/WS giữ ID, TTL, frame và chặn JWT cũ', { timeout: 45000 }, traced('R1-LOCAL-WIRE', () => withLocal(async (request, actors, transport, apiBase) => {
  const subscriber = async (events, token) => transport.subscribe(event => events.push(event), token);
  const readMedia = async (path, token) => Array.from(new Uint8Array(await (await transport.readMedia(path, { token })).arrayBuffer()));
  await round1Wire(request, actors, subscriber, readMedia, 'local', apiBase);
}, 'r1-local')));

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
  await scene.addInitScript(() => {
    window.crossRendererReady = null;
    window.addEventListener('citylab:renderer-ready', () => { window.crossRendererReady = performance.now(); }, { once: true });
  });
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
    return { t: app.traffic.sim.counters.t, seed: app.traffic.sim.seed, mode: app.controller.getMode(), counters: { ...app.traffic.sim.counters }, scenario: app.modules.scenarios.scenarios.status(), modules: Object.keys(app.modules) };
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

test('CROSS-DATA-T1-SEED: snapshot giữ seed thực thi và seed khởi tạo khác mặc định', traced('ACTUAL-SNAPSHOT-SEED', async () => {
  assert.ok(runtimeSnapshot, 'Cần snapshot từ scene thật');
  assert.ok(Number.isInteger(runtimeSnapshot.simulation.seed), `snapshot.simulation.seed phải là số nguyên, thực tế=${JSON.stringify(runtimeSnapshot.simulation.seed)}`);
  assert.equal(runtimeSnapshot.simulation.seed, evidence.runtime.before.seed);
  // Khởi tạo lõi thật trên mạng đã tải; input của test là oracle, không đọc hằng số mặc định sản phẩm.
  const seed = 5938701;
  const custom = await bounded(scene.evaluate(async requested => {
    const { createTrafficSim31 } = await import('/outputs/hcmc-poc/city-traffic-sim-31.js?v=32c');
    const { readStationSnapshot32 } = await import('/outputs/hcmc-poc/smart-app-32.js?v=32c');
    const app = window.__smartApp;
    const sim = createTrafficSim31(app.traffic.net, { poolTarget: 8, seed: requested });
    const snapshot = readStationSnapshot32({ ...app, traffic: { ...app.traffic, sim } }, [], app.modules.transport, 'cross-custom-seed');
    return { coreSeed: sim.seed, snapshotSeed: snapshot.simulation.seed };
  }, seed), 8000, 'snapshot seed khác mặc định từ lõi thật');
  assert.notEqual(seed, runtimeSnapshot.simulation.seed);
  assert.deepEqual(custom, { coreSeed: seed, snapshotSeed: seed });
  evidence.runtime.seed = { actual: runtimeSnapshot.simulation.seed, requested: seed, ...custom };
}));

test('CROSS-DATA-T1-CAMERA-ID: camera dùng junction_id cụm logic có trong snapshot', traced('ACTUAL-SNAPSHOT-CAMERA-CLUSTER', async () => {
  assert.ok(runtimeSnapshot, 'Cần snapshot từ scene thật');
  const ids = new Set(runtimeSnapshot.junctions.map(row => row.junction_id));
  assert.ok(ids.size > 0);
  const invalid = runtimeSnapshot.cameras.filter(camera => !ids.has(camera.junction_id)).map(camera => ({ camera_id: camera.camera_id, junction_id: camera.junction_id }));
  assert.deepEqual(invalid, [], 'Mỗi camera phải tham chiếu junction_id cụm logic, không dùng node_id');
  await verifyCameraJoin(runtimeSnapshot);
}));

test('CROSS-DATA-T1-ORACLE-RED: assertion bắt phản hồi thành công trước ACK', traced('ORACLE-NEGATIVE-CONTROL', async () => {
  const observed = evidence.api.public?.pending;
  assert.ok(observed, 'Cần phản hồi thật từ public lifecycle');
  pending(observed);
  assert.throws(() => pending({ ...observed, status: 'applied', applied_t_sim: 999 }), /HTTP thành công chỉ được pending/);
}));
