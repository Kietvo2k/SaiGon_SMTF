import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Oracle: hợp đồng v1 và seam station do lead chốt; không nhập helper sản phẩm.
const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = resolve(process.env.DATA_T1_ROOT || testRoot);
const entry = '/outputs/shared/public-demo/traffic-transport.js';
const fixture = JSON.parse(readFileSync(join(testRoot, 'docs/agent/fixtures/public-demo-v1.json'), 'utf8'));
const require = createRequire(import.meta.url);
let browser;
let server;
let origin;
const wire = [];

before(async () => {
  console.log('DATA-T1 product root:', root, 'HEAD:', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim());
  const modulePath = process.env.PW_MODULE || join(process.env.APPDATA || '', 'npm/node_modules/@playwright/mcp/node_modules/playwright');
  const { chromium } = require(modulePath);
  const executablePath = process.env.PW_CHROME || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  browser = await chromium.launch({ headless: true, ...(existsSync(executablePath) ? { executablePath } : {}) });
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://test.invalid');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><title>DATA-T1: biên trình duyệt thật</title>');
    }
    if (url.pathname.startsWith('/api/v1/')) {
      let body = '';
      for await (const part of req) body += part;
      wire.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body });
      if (url.pathname.endsWith('/error')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Quyền thử nghiệm bị từ chối' } }));
      }
      if (url.pathname.endsWith('/slow')) {
        return setTimeout(() => { if (!res.destroyed) res.end('{}'); }, 1000);
      }
      if (url.pathname.includes('/media/')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ method: req.method, path: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null }));
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) || !existsSync(path)) {
      res.writeHead(404);
      return res.end('Không có module ứng viên');
    }
    res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  server.on('upgrade', (req, socket) => {
    wire.push({ websocket: req.url });
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on('error', () => {});
    socket.once('data', () => {
      const body = Buffer.from(JSON.stringify({ event: 'snapshot.updated', t: new Date().toISOString(), seq: 1, data: { snapshot_version: 'public-demo-v1', revision: 17 } }));
      socket.write(Buffer.concat([Buffer.from([0x81, body.length < 126 ? body.length : 126]), ...(body.length < 126 ? [] : [Buffer.from([body.length >> 8, body.length & 255])]), body]));
    });
    socket.on('end', () => socket.destroy());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
});

async function pageFor(t, context) {
  assert.ok(existsSync(join(root, entry)), 'DATA-T1: thiếu entry adapter dùng chung traffic-transport.js');
  const owner = context || await browser.newContext();
  if (!context) t.after(() => owner.close());
  const page = await owner.newPage();
  await page.goto(origin);
  await page.evaluate(async ({ entry, origin }) => {
    window.module = await import(entry);
    window.transport = window.module.createPublicTrafficTransport({ buildId: 'hardtest-data-t1' });
    window.login = async account => window.transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username: account.username, password: account.password } });
    window.call = async input => {
      try { return { ok: true, value: await window.transport.request(input) }; }
      catch (error) { return { ok: false, status: error.status, code: error.code, name: error.name, message: error.message }; }
    };
    window.testOrigin = origin;
    window.claim = (station_id = 'station-hardtest', owner_id = 'owner-hardtest') => window.transport.request({ method: 'POST', path: '/api/v1/station/lease', body: { station_id, owner_id } });
    window.stationCall = (lease, method, suffix, body) => window.call({ method, path: '/api/v1/station/' + suffix, token: lease.capability, body });
    window.snapshotInput = () => ({
      snapshot_version: 'public-demo-v1', revision: 0, build_id: 'hardtest-data-t1',
      station: { status: 'active', id: 'station-hardtest', last_seen_at: new Date().toISOString() },
      simulation: { seed: 31034, scenario: 'none', mode: 'fixed', t_sim: 73.4, paused: true },
      junctions: [{ junction_id: 'HX-C1', node_ids: ['HX-01'], label: 'Hàng Xanh', phase: 'green', group: 0, decision: null }],
      kpi: { wait_avg_s: 4.25, queue_max: 7, flow_per_min: 31, trips_completed: 6, admission_wait: 2, recoveries: 1 },
      routes: [], cameras: [{ camera_id: 'CAM-HX-001', junction_id: 'HX-C1', label: 'Camera kiểm thử', source: 'live', status: 'missing', frame_id: null, captured_at: null, width: null, height: null }],
    });
  }, { entry, origin });
  return page;
}

function errorIs(result, status, code) {
  assert.equal(result.ok, false, 'Thao tác phải bị từ chối');
  assert.equal(result.status, status, JSON.stringify(result));
  if (code) assert.equal(result.code, code);
}

test('DATA-T1-TRANSPORT entry có factory tường minh và đúng ba phương thức', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(() => {
    let missingModeRejected = false;
    try { window.module.createTrafficTransport({}); } catch { missingModeRejected = true; }
    return { factories: ['createLocalTrafficTransport', 'createPublicTrafficTransport', 'createTrafficTransport'].map(key => typeof window.module[key]), methods: Object.keys(window.transport).sort(), missingModeRejected };
  });
  assert.deepEqual(result.factories, ['function', 'function', 'function']);
  assert.deepEqual(result.methods, ['readMedia', 'request', 'subscribe']);
  assert.equal(result.missingModeRejected, true, 'Factory không được ngầm chọn local');
});

test('DATA-T1-TRANSPORT local giữ path/query/bearer, lỗi, Blob và AbortSignal qua HTTP thật', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const local = window.module.createLocalTrafficTransport({ apiBase: window.testOrigin + '/api/v1', wsUrl: window.testOrigin.replace('http:', 'ws:') + '/ws/v1' });
    const echo = await local.request({ method: 'POST', path: '/api/v1/probe?q=a%20b&page=2', token: 'opaque-test-token', body: { marker: 19 } });
    let error;
    try { await local.request({ method: 'GET', path: '/api/v1/error' }); } catch (e) { error = { status: e.status, code: e.code, message: e.message, identity: e instanceof window.module.ApiError }; }
    const media = await local.readMedia('/api/v1/media/fixture', { token: 'media-token' });
    const controller = new AbortController();
    const promise = local.request({ method: 'GET', path: '/api/v1/slow', signal: controller.signal });
    controller.abort();
    let aborted;
    try { await promise; } catch (e) { aborted = e.name; }
    const cancelled = new AbortController(); cancelled.abort();
    let mediaAborted;
    try { await local.readMedia('/api/v1/media/fixture', { signal: cancelled.signal }); } catch (e) { mediaAborted = e.name; }
    return { echo, error, media: { blob: media instanceof Blob, type: media.type, bytes: [...new Uint8Array(await media.arrayBuffer())] }, aborted, mediaAborted };
  });
  assert.deepEqual(result.echo, { method: 'POST', path: '/api/v1/probe?q=a%20b&page=2', authorization: 'Bearer opaque-test-token', body: { marker: 19 } });
  assert.deepEqual(result.error, { status: 403, code: 'FORBIDDEN', message: 'Quyền thử nghiệm bị từ chối', identity: true });
  assert.deepEqual(result.media, { blob: true, type: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] });
  assert.equal(result.aborted, 'AbortError');
  assert.equal(result.mediaAborted, 'AbortError');
});

test('DATA-T1-AUTH public đăng nhập bốn role, chống token giả và logout thu hồi phiên, không fetch loopback', async t => {
  const page = await pageFor(t);
  const requests = [];
  page.on('request', req => { if (['fetch', 'xhr', 'websocket'].includes(req.resourceType())) requests.push(req.url()); });
  const result = await page.evaluate(async accounts => {
    const rows = [];
    for (const account of accounts) {
      const session = await window.login(account);
      const me = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: session.access_token });
      const fake = await window.call({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: session.access_token + 'tampered', body: { mode: 'smart', role: 'admin' } });
      await window.transport.request({ method: 'POST', path: '/api/v1/auth/logout', token: session.access_token });
      const afterLogout = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: session.access_token });
      rows.push({ role: session.role, token: typeof session.access_token, token_type: session.token_type, expires_in: session.expires_in, me, fake, afterLogout });
    }
    const unknown = await window.call({ method: 'GET', path: '/api/v1/route-does-not-exist' });
    return { rows, unknown };
  }, fixture.accounts);
  result.rows.forEach((row, i) => {
    assert.equal(row.role, fixture.accounts[i].role);
    assert.equal(row.token, 'string');
    assert.equal(row.token_type, 'bearer');
    assert.ok(row.expires_in > 0);
    assert.equal(row.me.value.role, fixture.accounts[i].role);
    errorIs(row.fake, 401);
    errorIs(row.afterLogout, 401);
  });
  errorIs(result.unknown, 404, 'NOT_FOUND');
  assert.deepEqual(requests, [], 'Public không được tạo kết nối API hoặc loopback');
});

test('DATA-T1-TRANSPORT public từ chối storage/AbortSignal và media thiếu có mã lỗi, không fallback', async t => {
  const page = await pageFor(t);
  const requests = [];
  page.on('request', req => { if (['fetch', 'xhr'].includes(req.resourceType())) requests.push(req.url()); });
  const result = await page.evaluate(async account => {
    const controller = new AbortController(); controller.abort();
    const aborted = await window.call({ method: 'GET', path: '/api/v1/auth/me', signal: controller.signal });
    const user = await window.login(account);
    let missingMedia;
    try { await window.transport.readMedia('/api/v1/media/not-present', { token: user.access_token }); } catch (e) { missingMedia = { status: e.status, code: e.code }; }
    return { aborted, missingMedia };
  }, fixture.accounts[2]);
  assert.equal(result.aborted.name, 'AbortError');
  assert.deepEqual(result.missingMedia, { status: 404, code: 'NOT_FOUND' });

  const context = await browser.newContext(); t.after(() => context.close());
  await context.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('Kho bị từ chối bởi ca kiểm', 'SecurityError'); };
  });
  const denied = await pageFor(t, context);
  const deniedResult = await denied.evaluate(async account => {
    try { await window.login(account); return { ok: true }; }
    catch (e) { return { ok: false, status: e.status, code: e.code }; }
  }, fixture.accounts[0]);
  errorIs(deniedResult, 503, 'STORAGE_UNAVAILABLE');
  assert.deepEqual(requests, []);
});

test('DATA-T1-AUTH quyền do session quyết định, disable và expiry thu hồi public token', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async accounts => {
    const citizen = await window.login(accounts[0]);
    const forgedRole = await window.call({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: citizen.access_token, body: { mode: 'smart', role: 'admin' } });
    const commander = await window.login(accounts[2]);
    const admin = await window.login(accounts[3]);
    const me = await window.transport.request({ method: 'GET', path: '/api/v1/auth/me', token: commander.access_token });
    const disabled = await window.call({ method: 'POST', path: '/api/v1/admin/users/' + me.id + '/active', token: admin.access_token, body: { active: false } });
    const afterDisable = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: commander.access_token });
    const realNow = Date.now;
    Date.now = () => realNow() + (citizen.expires_in + 1) * 1000;
    const afterExpiry = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: citizen.access_token });
    Date.now = realNow;
    return { forgedRole, disabled, afterDisable, afterExpiry };
  }, fixture.accounts);
  errorIs(result.forgedRole, 403, 'FORBIDDEN');
  assert.equal(result.disabled.ok, true, 'Admin phải tắt được tài khoản khác: ' + JSON.stringify(result.disabled));
  errorIs(result.afterDisable, 401);
  errorIs(result.afterExpiry, 401);
});

test('DATA-T1-LEASE hai tab tranh lease, chỉ owner thắng được heartbeat/snapshot/ACK', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const a = await pageFor(t, context);
  const b = await pageFor(t, context);
  const claims = await Promise.all([a.evaluate(() => window.call({ method: 'POST', path: '/api/v1/station/lease', body: { station_id: 'A', owner_id: 'owner-A' } })), b.evaluate(() => window.call({ method: 'POST', path: '/api/v1/station/lease', body: { station_id: 'B', owner_id: 'owner-B' } }))]);
  assert.equal(claims.filter(result => result.ok).length, 1, 'Chính xác một claim được commit');
  const winnerIndex = claims.findIndex(result => result.ok);
  const lease = claims[winnerIndex].value;
  assert.ok(Number.isInteger(lease.generation) && lease.generation > 0);
  assert.equal(typeof lease.capability, 'string');
  assert.ok(Date.parse(lease.expires_at) > Date.now());
  const winner = [a, b][winnerIndex];
  const loser = [a, b][1 - winnerIndex];
  const results = await winner.evaluate(async lease => ({
    heartbeat: await window.stationCall(lease, 'POST', 'heartbeat', { station_id: lease.station_id }),
    snapshot: await window.stationCall(lease, 'POST', 'snapshot', { snapshot: window.snapshotInput() }),
    renewed: await window.stationCall(lease, 'PUT', 'lease', { station_id: lease.station_id, owner_id: lease.owner_id }),
  }), lease);
  assert.equal(results.heartbeat.ok, true);
  assert.equal(results.snapshot.ok, true);
  assert.equal(results.renewed.ok, true);
  const forged = await loser.evaluate(() => window.stationCall({ capability: 'not-a-capability' }, 'POST', 'snapshot', { snapshot: window.snapshotInput() }));
  assert.equal(forged.ok, false, 'Body station_id không thay được capability');
  assert.ok([401, 403, 409].includes(forged.status));
  const released = await winner.evaluate(lease => window.stationCall(lease, 'DELETE', 'lease', { station_id: lease.station_id, owner_id: lease.owner_id }), lease);
  assert.equal(released.ok, true);
  const next = await loser.evaluate(() => window.claim('next-station', 'next-owner'));
  assert.ok(next.generation > lease.generation, 'Takeover phải tăng fencing generation');
  const oldWrites = await winner.evaluate(async old => {
    const operations = [
      ['POST', 'heartbeat', { station_id: old.station_id }],
      ['POST', 'snapshot', { snapshot: window.snapshotInput() }],
      ['POST', 'metrics', { station_id: old.station_id, kpi: { wait_avg_s: 9999 } }],
      ['POST', 'violations', { plate: '51K-123.45', plate_format: 'car', vehicle_class: 'car', vehicle_id: 'old-owner-write', cycle_id: 814, node_id: 'HX-01', camera_id: 'CAM-HX-001', violation_code: 'RED-LIGHT', confidence: 0.9, signal: { phase_for_vehicle: 'red', cycle_id: 814 }, evidence: [], sim: { t_sim: 73.4 } }],
      ['POST', 'frames', { camera_id: 'CAM-HX-001', frame_id: 'old-owner-frame', jpeg_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', w: 1, h: 1 }],
      ['POST', 'heat', { t_sim: 0.1, levels: [[19, 0.95]], alerts: [] }],
      ['POST', 'commands/nonexistent/ack', { status: 'applied', applied_t_sim: 123 }],
    ];
    const rows = [];
    for (const [method, suffix, body] of operations) rows.push(await window.stationCall(old, method, suffix, body));
    return rows;
  }, lease);
  for (const result of oldWrites) {
    assert.equal(result.ok, false, 'Owner cũ không được ghi bằng capability bị fence');
    assert.ok([401, 403, 409].includes(result.status), 'Phải kiểm capability trước payload/route write');
  }
});

test('DATA-T1-ACK bridge giữ pending đến callback, áp một lần và unsubscribe idempotent', async t => {
  const page = await pageFor(t);
  await page.evaluate(async account => {
    const { createStationBridge } = await import('/outputs/shared/public-demo/station-bridge.js');
    window.user = await window.login(account);
    window.observed = [];
    window.unsub = window.transport.subscribe(message => window.observed.push(message), window.user.access_token);
    window.applied = [];
    window.bridge = createStationBridge({ transport: window.transport, stationId: 'station-hardtest',
      readSnapshot: () => window.snapshotInput(),
      applyCommand: async command => { window.applied.push(command); return new Promise(resolve => { window.finishApply = resolve; }); },
    });
    await window.bridge.start();
    window.pending = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: window.user.access_token, body: { mode: 'smart', command_id: 'bridge-delayed' } });
  }, fixture.accounts[2]);
  await page.waitForFunction(() => window.applied.length === 1, null, { timeout: 4000 });
  const pending = await page.evaluate(async () => ({ response: window.pending, current: await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + window.pending.command_id, token: window.user.access_token }), events: window.observed }));
  assert.equal(pending.response.status, 'pending');
  assert.equal(pending.current.status, 'pending', 'Gửi thành công không phải ACK');
  assert.equal(pending.current.applied_t_sim, null);
  assert.equal(pending.events.some(event => event.event === 'command.updated' && event.data.status === 'applied'), false);
  await page.evaluate(() => window.finishApply({ status: 'applied', applied_t_sim: 73.4 }));
  await page.waitForFunction(async () => (await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + window.pending.command_id, token: window.user.access_token })).status === 'applied');
  const final = await page.evaluate(async () => {
    const current = await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + window.pending.command_id, token: window.user.access_token });
    const retry = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: window.user.access_token, body: { mode: 'smart', command_id: 'bridge-delayed' } });
    await window.bridge.stop();
    window.unsub(); window.unsub();
    return { current, retry, count: window.applied.length, events: window.observed };
  });
  assert.equal(final.current.applied_t_sim, 73.4);
  assert.equal(final.retry.command_id, final.current.command_id);
  assert.equal(final.retry.status, 'applied');
  assert.equal(final.count, 1, 'Retry ID không gọi apply lần hai');
  const events = final.events.filter(event => event.event === 'command.updated' && event.data.command_id === final.current.command_id);
  assert.equal(events.filter(event => event.data.status === 'applied').length, 1, 'Không nhân đôi sự kiện applied');
  for (let i = 0; i < events.length; i++) {
    assert.match(events[i].t, /^\d{4}-\d\d-\d\dT.*Z$/);
    if (i) assert.ok(events[i].seq > events[i - 1].seq);
  }
});

for (const lateAfterRestart of [false, true]) {
test(`DATA-T1-ACK bridge stop/start không nhận renew cũ hoặc ACK ngoài lifecycle hiện hành (${lateAfterRestart ? 'response sau start mới' : 'response trước start mới'})`, { timeout: 12000 }, async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    const { createStationBridge } = await import('/outputs/shared/public-demo/station-bridge.js');
    const state = window.restartCase = { claims: 0, calls: [], applied: [], acks: [], phase: 'initial', delivered: new Set() };
    const transport = {
      async request(input) {
        state.calls.push({ method: input.method, path: input.path, token: input.token, phase: state.phase });
        if (input.path.endsWith('/station/lease')) {
          if (input.method === 'POST') {
            state.claims++;
            return state.lease = { station_id: input.body.station_id, owner_id: input.body.owner_id,
              generation: state.claims, capability: 'restart-capability-' + state.claims,
              expires_at: new Date(Date.now() + 6000).toISOString() };
          }
          if (input.method === 'DELETE') return { ok: true };
          if (input.method === 'PUT' && !state.held) {
            state.held = true;
            const old = { ...state.lease };
            return new Promise(resolve => { state.finishOldRenew = () => resolve({ ...old, expires_at: new Date(Date.now() + 6000).toISOString() }); });
          }
          if (input.method === 'PUT') return { ...state.lease, expires_at: new Date(Date.now() + 6000).toISOString() };
        }
        if (input.path.endsWith('/commands/pending') || input.path.endsWith('/station/heartbeat')) {
          if (!state.commandsEnabled || state.delivered.has(input.token)) return { commands: [] };
          state.delivered.add(input.token);
          return { commands: [{ event: 'cmd.signal-mode', data: { mode: 'smart' },
            command_id: input.token === 'restart-capability-2' ? 'restart-current' : 'restart-stale',
            deadline_at: new Date(Date.now() + 10000).toISOString() }] };
        }
        if (input.path.endsWith('/ack')) {
          state.acks.push({ token: input.token, body: input.body, phase: state.phase });
          return { command_id: 'restart-current', ...input.body };
        }
        if (input.path.endsWith('/station/snapshot')) return { ok: true };
        throw new Error('Request ngoài seam station đã chốt: ' + input.method + ' ' + input.path);
      },
      subscribe() { return () => {}; },
      async readMedia() { throw new Error('Bridge không cần media trong ca lifecycle'); },
    };
    state.bridge = createStationBridge({ transport, stationId: 'station-hardtest',
      readSnapshot: () => window.snapshotInput(),
      applyCommand: async command => {
        state.applied.push({ command_id: command.command_id, phase: state.phase });
        return { status: 'applied', applied_t_sim: 73.4 };
      },
    });
    state.firstStart = state.bridge.start();
  });
  await page.waitForFunction(() => typeof window.restartCase.finishOldRenew === 'function', null, { timeout: 4000 });
  await page.evaluate(async lateAfterRestart => {
    const state = window.restartCase;
    await state.bridge.stop();
    state.phase = 'stopped';
    if (lateAfterRestart) {
      state.phase = 'restarted';
      await state.bridge.start();
    }
    state.finishOldRenew();
    await state.firstStart;
    // Cho continuation của response cũ chạy trước khi phát command kiểm.
    await new Promise(resolve => setTimeout(resolve, 25));
    state.commandsEnabled = true;
    if (!lateAfterRestart) {
      state.phase = 'restarted';
      await state.bridge.start();
    }
  }, lateAfterRestart);
  await page.waitForFunction(() => window.restartCase.acks.length > 0, null, { timeout: 4000 });
  const result = await page.evaluate(async () => {
    const state = window.restartCase;
    await state.bridge.stop();
    return { claims: state.claims, calls: state.calls, applied: state.applied, acks: state.acks };
  });
  assert.equal(result.claims, 2, 'Start mới phải claim lại; response renew cũ không được hồi sinh lease đã stop');
  assert.deepEqual(result.applied, [{ command_id: 'restart-current', phase: 'restarted' }]);
  assert.deepEqual(result.acks, [{ token: 'restart-capability-2', body: { status: 'applied', applied_t_sim: 73.4 }, phase: 'restarted' }]);
  assert.equal(result.calls.some(call => call.phase !== 'initial' && call.method !== 'DELETE' && call.token === 'restart-capability-1'), false,
    'Lifecycle cũ không được tiếp tục ghi/poll/ACK bằng capability cũ sau stop');
});
}

test('DATA-T1-ACK callback từ chối trả rejected và không ghi applied_t_sim', async t => {
  const page = await pageFor(t);
  await page.evaluate(async account => {
    const { createStationBridge } = await import('/outputs/shared/public-demo/station-bridge.js');
    window.user = await window.login(account);
    window.bridge = createStationBridge({ transport: window.transport, stationId: 'station-hardtest', readSnapshot: () => window.snapshotInput(), applyCommand: async () => ({ status: 'rejected', reason_code: 'COMMAND_REJECTED' }) });
    await window.bridge.start();
    window.pending = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: window.user.access_token, body: { mode: 'smart' } });
  }, fixture.accounts[2]);
  await page.waitForFunction(async () => (await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + window.pending.command_id, token: window.user.access_token })).status === 'rejected');
  const result = await page.evaluate(async () => {
    await window.bridge.stop();
    return window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + window.pending.command_id, token: window.user.access_token });
  });
  assert.equal(result.status, 'rejected', JSON.stringify(result));
  assert.equal(result.reason_code, 'COMMAND_REJECTED', JSON.stringify(result));
  assert.equal(result.applied_t_sim, null);
});

test('DATA-T1-TRANSACTION abort sau write nhưng trước complete không lưu command/audit hoặc phát event sớm', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await pageFor(t, context);
  const observer = await pageFor(t, context);
  await page.evaluate(async account => { window.user = await window.login(account); window.lease = await window.claim(); }, fixture.accounts[2]);
  await observer.evaluate(async account => {
    window.user = await window.login(account);
    window.events = [];
    window.off = window.transport.subscribe(event => window.events.push(event), window.user.access_token);
  }, fixture.accounts[2]);
  const result = await page.evaluate(async () => {
    const before = await window.transport.request({ method: 'GET', path: '/api/v1/officer/audit', token: window.user.access_token });
    const originalPut = IDBObjectStore.prototype.put;
    const originalAdd = IDBObjectStore.prototype.add;
    window.injectedAbort = false;
    const inject = original => function (...args) {
      const request = original.apply(this, args);
      if (this.transaction.mode === 'readwrite' && !window.injectedAbort) {
        const transaction = this.transaction;
        request.addEventListener('success', () => {
          if (!window.injectedAbort) { window.injectedAbort = true; transaction.abort(); }
        }, { once: true });
      }
      return request;
    };
    IDBObjectStore.prototype.put = inject(originalPut);
    IDBObjectStore.prototype.add = inject(originalAdd);
    const mutation = await window.call({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: window.user.access_token, body: { mode: 'smart', command_id: 'must-abort-atomic' } });
    IDBObjectStore.prototype.put = originalPut;
    IDBObjectStore.prototype.add = originalAdd;
    const command = await window.call({ method: 'GET', path: '/api/v1/officer/commands/must-abort-atomic', token: window.user.access_token });
    const audit = await window.transport.request({ method: 'GET', path: '/api/v1/officer/audit', token: window.user.access_token });
    return { mutation, command, before: before.total, after: audit.total, injected: window.injectedAbort };
  });
  assert.equal(result.injected, true, 'Fault phải chạm write IndexedDB thật');
  errorIs(result.mutation, 503, 'STORAGE_UNAVAILABLE');
  errorIs(result.command, 404, 'NOT_FOUND');
  assert.equal(result.after, result.before, 'Audit và command phải rollback cùng nhau');
  await observer.waitForTimeout(100);
  const events = await observer.evaluate(() => window.events);
  assert.equal(events.some(event => JSON.stringify(event.data).includes('must-abort-atomic')), false, 'Không phát command thành công trước transaction.complete');
  await page.reload();
  await page.evaluate(async entry => { window.transport = (await import(entry)).createPublicTrafficTransport({ buildId: 'hardtest-data-t1' }); }, entry);
  const reopened = await page.evaluate(async account => {
    const session = await window.transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username: account.username, password: account.password } });
    try { return { ok: true, value: await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/must-abort-atomic', token: session.access_token }) }; }
    catch (e) { return { ok: false, status: e.status, code: e.code }; }
  }, fixture.accounts[2]);
  errorIs(reopened, 404, 'NOT_FOUND');
});

test('DATA-T1-ACK chưa dequeue không ACK được; command terminal không đổi bởi ACK trùng', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async account => {
    const user = await window.login(account);
    const lease = await window.claim();
    const pending = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'ack-before-dequeue' } });
    const before = await window.stationCall(lease, 'POST', 'commands/' + pending.command_id + '/ack', { status: 'applied', applied_t_sim: 999 });
    const current = await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + pending.command_id, token: user.access_token });
    const queue = await window.stationCall(lease, 'GET', 'commands/pending');
    const empty = await window.stationCall(lease, 'GET', 'commands/pending');
    const ack = await window.stationCall(lease, 'POST', 'commands/' + pending.command_id + '/ack', { status: 'applied', applied_t_sim: 18.6 });
    await window.stationCall(lease, 'POST', 'commands/' + pending.command_id + '/ack', { status: 'rejected', reason_code: 'COMMAND_REJECTED' });
    const terminal = await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + pending.command_id, token: user.access_token });
    return { before, current, queue, empty, ack, terminal };
  }, fixture.accounts[2]);
  assert.equal(result.before.ok, false, 'ACK giả trước dequeue không được applied');
  assert.equal(result.current.status, 'pending');
  assert.equal(result.queue.value.commands.length, 1);
  assert.equal(result.queue.value.commands[0].command_id, 'ack-before-dequeue');
  assert.ok(Date.parse(result.queue.value.commands[0].deadline_at));
  assert.deepEqual(result.empty.value.commands, [], 'Dequeue không phát cùng command hai lần');
  assert.equal(result.ack.ok, true);
  assert.equal(result.terminal.status, 'applied');
  assert.equal(result.terminal.applied_t_sim, 18.6);
});

test('DATA-T1-EXPIRY quá 10 giây thực, reload và takeover vẫn expired, owner cũ không hồi sinh lệnh', { timeout: 20000 }, async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await pageFor(t, context);
  const old = await pageFor(t, context);
  const start = Date.now();
  const state = await old.evaluate(async account => {
    const user = await window.login(account);
    const lease = await window.claim('station-old', 'owner-old');
    const pending = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'real-time-expiry' } });
    const queue = await window.stationCall(lease, 'GET', 'commands/pending');
    return { user, lease, pending, queue };
  }, fixture.accounts[2]);
  assert.equal(state.queue.value.commands.length, 1);
  // Đóng tab phát để không còn timer; oracle là đồng hồ Node, không giả Date.
  await old.close();
  await new Promise(resolve => setTimeout(resolve, 10400));
  assert.ok(Date.now() - start >= 10000);
  await page.reload();
  await page.evaluate(async entry => { window.transport = (await import(entry)).createPublicTrafficTransport({ buildId: 'hardtest-data-t1' }); }, entry);
  const result = await page.evaluate(async ({ account, state }) => {
    const user = await window.transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username: account.username, password: account.password } });
    const lease = await window.transport.request({ method: 'POST', path: '/api/v1/station/lease', body: { station_id: 'station-new', owner_id: 'owner-new' } });
    const call = async input => { try { return { ok: true, value: await window.transport.request(input) }; } catch (e) { return { ok: false, status: e.status, code: e.code }; } };
    const expired = await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + state.pending.command_id, token: user.access_token });
    const late = await call({ method: 'POST', path: '/api/v1/station/commands/' + state.pending.command_id + '/ack', token: state.lease.capability, body: { status: 'applied', applied_t_sim: 0 } });
    const queue = await window.transport.request({ method: 'GET', path: '/api/v1/station/commands/pending', token: lease.capability });
    const retry = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: state.pending.command_id } });
    return { lease, expired, late, queue, retry };
  }, { account: fixture.accounts[2], state });
  assert.ok(result.lease.generation > state.lease.generation);
  assert.equal(result.expired.status, 'expired');
  assert.equal(result.expired.reason_code, 'COMMAND_EXPIRED');
  assert.equal(result.expired.applied_t_sim, null);
  assert.equal(result.late.ok, false);
  assert.deepEqual(result.queue.commands, []);
  assert.equal(result.retry.status, 'expired');
  assert.equal(result.retry.command_id, state.pending.command_id);
});

test('DATA-T1-PROFILE hai tab cùng kho, context độc lập không thấy session/command/snapshot của nhau', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const a = await pageFor(t, context);
  const shared = await pageFor(t, context);
  const isolated = await pageFor(t);
  const state = await a.evaluate(async account => {
    const user = await window.login(account);
    const lease = await window.claim();
    await window.stationCall(lease, 'POST', 'snapshot', { snapshot: window.snapshotInput() });
    const pending = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'profile-A-only' } });
    return { user, pending };
  }, fixture.accounts[2]);
  const same = await shared.evaluate(async state => ({ me: await window.call({ method: 'GET', path: '/api/v1/auth/me', token: state.user.access_token }), command: await window.call({ method: 'GET', path: '/api/v1/officer/commands/' + state.pending.command_id, token: state.user.access_token }), snapshot: await window.call({ method: 'GET', path: '/api/v1/officer/snapshot', token: state.user.access_token }) }), state);
  assert.equal(same.me.ok, true);
  assert.equal(same.command.value.command_id, state.pending.command_id);
  assert.equal(same.snapshot.value.simulation.t_sim, 73.4);
  const other = await isolated.evaluate(async ({ state, account }) => {
    const fakeSession = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: state.user.access_token });
    const user = await window.login(account);
    return { fakeSession, command: await window.call({ method: 'GET', path: '/api/v1/officer/commands/' + state.pending.command_id, token: user.access_token }), snapshot: await window.call({ method: 'GET', path: '/api/v1/officer/snapshot', token: user.access_token }) };
  }, { state, account: fixture.accounts[2] });
  errorIs(other.fakeSession, 401);
  errorIs(other.command, 404, 'NOT_FOUND');
  assert.equal(other.snapshot.value.station.status, 'missing');
});

test('DATA-T1-TRANSACTION writer chưa subscribe vẫn phát event metadata sau complete sang tab đọc', { timeout: 8000 }, async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const writer = await pageFor(t, context);
  const reader = await pageFor(t, context);
  await reader.evaluate(async account => {
    window.user = await window.login(account);
    window.events = [];
    window.off = window.transport.subscribe(event => window.events.push(event), window.user.access_token);
  }, fixture.accounts[2]);
  const result = await writer.evaluate(async account => {
    const user = await window.login(account);
    await window.claim();
    window.activeRw = 0;
    window.published = [];
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (tx.mode === 'readwrite') {
        window.activeRw++;
        const finish = () => { window.activeRw--; };
        tx.addEventListener('complete', finish, { once: true });
        tx.addEventListener('abort', finish, { once: true });
      }
      return tx;
    };
    const post = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (data) {
      window.published.push({ activeRw: window.activeRw, payload: data });
      return post.call(this, data);
    };
    const command = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'writer-without-subscribe' } });
    return { command, published: window.published };
  }, fixture.accounts[2]);
  assert.equal(result.command.status, 'pending');
  await reader.waitForFunction(() => window.events.some(event => event.event === 'command.updated' && event.data.command_id === 'writer-without-subscribe'), null, { timeout: 2500 });
  assert.ok(result.published.length > 0, 'Writer phải mở kênh phát kể cả chưa subscribe');
  for (const event of result.published) {
    assert.equal(event.activeRw, 0, 'Broadcast chỉ sau transaction.complete');
    assert.equal(JSON.stringify(event.payload).includes('jpeg_base64'), false, 'Ảnh phải đọc riêng qua readMedia');
  }
  const observed = await reader.evaluate(async () => {
    window.off(); window.off();
    return { events: window.events, stored: await window.transport.request({ method: 'GET', path: '/api/v1/officer/commands/writer-without-subscribe', token: window.user.access_token }) };
  });
  assert.equal(observed.stored.status, 'pending');
  assert.equal(observed.events.filter(event => event.event === 'command.updated' && event.data.command_id === 'writer-without-subscribe').length, 1);
});

test('DATA-T1-TRANSACTION quota lỗi không làm mất command đã commit hoặc phiên đang dùng', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async account => {
    const user = await window.login(account);
    await window.claim();
    const retained = await window.transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'retained-before-quota' } });
    const put = IDBObjectStore.prototype.put;
    let injected = 0;
    IDBObjectStore.prototype.put = function () { injected++; throw new DOMException('Kho đầy do ca kiểm', 'QuotaExceededError'); };
    const failed = await window.call({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'fixed', command_id: 'must-fail-quota' } });
    IDBObjectStore.prototype.put = put;
    const current = await window.call({ method: 'GET', path: '/api/v1/officer/commands/' + retained.command_id, token: user.access_token });
    const absent = await window.call({ method: 'GET', path: '/api/v1/officer/commands/must-fail-quota', token: user.access_token });
    const me = await window.call({ method: 'GET', path: '/api/v1/auth/me', token: user.access_token });
    return { injected, failed, current, absent, me };
  }, fixture.accounts[2]);
  assert.ok(result.injected > 0, 'Fault phải chạm kho thật');
  errorIs(result.failed, 503, 'STORAGE_UNAVAILABLE');
  assert.equal(result.current.value.command_id, 'retained-before-quota');
  assert.equal(result.current.value.status, 'pending');
  errorIs(result.absent, 404, 'NOT_FOUND');
  assert.equal(result.me.ok, true, 'Quota không được reset kho/session');
});

test('DATA-T1-TRANSPORT local subscribe nhận envelope WS và hủy idempotent', { timeout: 6000 }, async t => {
  const page = await pageFor(t);
  const event = await page.evaluate(async () => {
    const local = window.module.createLocalTrafficTransport({ apiBase: window.testOrigin + '/api/v1', wsUrl: window.testOrigin.replace('http:', 'ws:') + '/ws/v1' });
    return new Promise(resolve => {
      const off = local.subscribe(message => { off(); off(); resolve(message); }, 'subscribe-test-token');
    });
  });
  assert.equal(event.event, 'snapshot.updated');
  assert.equal(event.seq, 1);
  assert.match(event.t, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(event.data.revision, 17);
  assert.ok(wire.some(item => item.websocket === '/ws/v1'));
});

test('DATA-T1-LOCAL adapter local gọi FastAPI thật với DB test riêng, giữ pending/ACK/error/Blob/abort', { timeout: 40000 }, async t => {
  const backend = join(root, 'outputs/smart-traffic/backend');
  const commonGit = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const executable = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const python = process.env.HARDTEST_PYTHON || [join(backend, '.venv311', executable), join(dirname(commonGit), 'outputs/smart-traffic/backend/.venv311', executable), join(backend, '.venv', executable)].find(existsSync) || 'python';
  const data = mkdtempSync(join(tmpdir(), 'smtf-data-t1-'));
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const apiOrigin = `http://127.0.0.1:${port}`;
  const script = 'from app.db import get_conn, init_db; c=get_conn(); init_db(c); c.close(); from app.seed.run_seed import run_seed; run_seed(); import os, uvicorn; uvicorn.run("app.main:app",host="127.0.0.1",port=int(os.environ["DATA_T1_PORT"]),access_log=False)';
  const child = spawn(python, ['-B', '-c', script], { cwd: backend, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', SMART_VAR_DIR: data, SMART_DB_PATH: join(data, 'data-t1.db'), SMART_CLEANUP: '0', SMART_ALLOWED_ORIGINS: origin, DATA_T1_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', part => { output += part; });
  child.stderr.on('data', part => { output += part; });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', error => { output += String(error); resolve(); }); });
  t.after(async () => {
    child.kill();
    await exited;
    assert.ok(data.startsWith(join(tmpdir(), 'smtf-data-t1-')));
    rmSync(data, { recursive: true, force: true });
  });
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && child.exitCode === null) {
    try { ready = (await fetch(apiOrigin + '/api/v1/health', { signal: AbortSignal.timeout(300) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'FastAPI test không khởi động: ' + output);
  const page = await pageFor(t);
  const result = await page.evaluate(async apiOrigin => {
    const transport = window.module.createLocalTrafficTransport({ apiBase: apiOrigin + '/api/v1', wsUrl: apiOrigin.replace('http:', 'ws:') + '/ws/v1' });
    const login = username => transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username, password: 'SaiGon@2026' } });
    const user = await login('commander1');
    const station = await login('station-3d');
    const lease = await transport.request({ method: 'POST', path: '/api/v1/station/lease', token: station.access_token, body: { station_id: 'STATION-3D-01', owner_id: 'node-http-owner' } });
    const pending = await transport.request({ method: 'POST', path: '/api/v1/officer/controls/signal-mode', token: user.access_token, body: { mode: 'smart', command_id: 'local-adapter-command' } });
    const before = await transport.request({ method: 'GET', path: '/api/v1/officer/commands/' + pending.command_id, token: user.access_token });
    const queue = await transport.request({ method: 'GET', path: '/api/v1/station/commands/pending', token: lease.capability });
    const ack = await transport.request({ method: 'POST', path: '/api/v1/station/commands/' + pending.command_id + '/ack', token: lease.capability, body: { status: 'applied', applied_t_sim: 38.2 } });
    const snapshot = await transport.request({ method: 'GET', path: '/api/v1/officer/snapshot', token: user.access_token });
    let media;
    try { await transport.readMedia('/api/v1/media/not-present', { token: user.access_token }); } catch (e) { media = { status: e.status, code: e.code, identity: e instanceof window.module.ApiError }; }
    const controller = new AbortController(); controller.abort();
    let aborted;
    try { await transport.request({ method: 'GET', path: '/api/v1/health', signal: controller.signal }); } catch (e) { aborted = e.name; }
    return { pending, before, queue, ack, version: snapshot.snapshot_version, media, aborted };
  }, apiOrigin);
  assert.equal(result.pending.status, 'pending');
  assert.equal(result.before.status, 'pending');
  assert.deepEqual(result.queue.commands.map(item => item.command_id), ['local-adapter-command']);
  assert.equal(result.ack.status, 'applied');
  assert.equal(result.ack.applied_t_sim, 38.2);
  assert.equal(result.version, 'public-demo-v1');
  assert.deepEqual(result.media, { status: 404, code: 'NOT_FOUND', identity: true });
  assert.equal(result.aborted, 'AbortError');
});
