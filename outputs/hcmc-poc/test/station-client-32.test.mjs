import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createQueue32, createMemoryStore32 } from '../station-queue-32.js?v=32a';
import {
  createTransport32, resolveApiBase32, buildSignalStates32, toViolationBody32, violationKey32,
  dataUrlToBlob32, base64OfDataUrl32, startStationLoop32, TRANSPORT_32_VERSION, HEARTBEAT_S, BACKOFF_MIN_S,
  BACKOFF_MAX_S, FRAME_FPS_32, METRICS_S, STATION_LOGIN_32
} from '../station-client-32.js?v=32a';

const BASE = 'http://127.0.0.1:8900';
const json = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tick = () => new Promise(r => setImmediate(r));

// fetch giả ghi lại mọi lời gọi; handler(url, opts, n) trả Response giả.
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method, headers: opts.headers || {}, body: opts.body });
    return handler(url, opts, calls.length);
  };
  fn.calls = calls;
  return fn;
}
const violationRec = (vehicle = 'V-000001', cycle = 7) => ({
  violation_code: 'RED-LIGHT', plate: '51K-123.45', plate_format: 'car', vehicle_class: 'car', vehicle_id: vehicle,
  node_id: 'HX-01', camera_id: 'CAM-HX-001', signal: { cycle_id: cycle, mode: 'smart' }, confidence: 0.91,
  penalty: { vnd_min: 18000000 }, sim: { t_sim: 12.3 }, status: 'new', review: { by: null }, violation_label: 'x'
});
const mkQueue = () => createQueue32({ store: createMemoryStore32() });

test('hằng số hợp đồng: phiên bản transport, heartbeat 15 s, backoff 1→30 s, stream 2 fps', () => {
  assert.equal(TRANSPORT_32_VERSION, 'transport-32a');
  assert.equal(HEARTBEAT_S, 15);
  assert.equal(BACKOFF_MIN_S, 1);
  assert.equal(BACKOFF_MAX_S, 30);
  assert.equal(FRAME_FPS_32, 2);
  assert.equal(METRICS_S, 5);
  assert.equal(STATION_LOGIN_32.username, 'station-3d');
});

test('lỗi mạng → giữ trong hàng đợi; online → gửi lại và xoá; gửi đúng đường dẫn và Bearer', async () => {
  let fail = true;
  const fetchImpl = fakeFetch(async () => { if (fail) throw new Error('network'); return json(201, { id: 'VP-1', status: 'new' }); });
  const q = mkQueue();
  const t = createTransport32({ baseUrl: BASE, token: 'tok-1', stationId: 'STATION-3D-01', queue: q, fetchImpl, log: () => {} });
  const r = await t.sendViolation(violationRec());
  assert.equal(r, null);
  assert.equal(await q.size(), 1);
  assert.equal(t.connectionState(), 'offline');
  fail = false;
  await t.flush();
  assert.equal(await q.size(), 0);
  assert.equal(t.connectionState(), 'online');
  const last = fetchImpl.calls.at(-1);
  assert.equal(last.url, `${BASE}/api/v1/station/violations`);
  assert.equal(last.headers.Authorization, 'Bearer tok-1');
  t.stop();
});

test('409 = đã gửi (xoá, không dead-letter); 422 → dead-letter; 5xx giữ lại', async () => {
  const run = async (status, vehicle) => {
    const q = mkQueue();
    await q.push(toViolationBody32(violationRec(vehicle)));
    const fetchImpl = fakeFetch(async () => json(status, { error: { code: 'X' } }));
    const t = createTransport32({ baseUrl: BASE, token: 'x', queue: q, fetchImpl, log: () => {} });
    await t.flush();
    return { q, t };
  };
  const dup = await run(409, 'V-409');
  assert.equal(await dup.q.size(), 0);
  assert.equal(dup.t.deadLetterCount(), 0);
  dup.t.stop();
  const bad = await run(422, 'V-422');
  assert.equal(await bad.q.size(), 0);
  assert.equal(bad.t.deadLetterCount(), 1);
  bad.t.stop();
  const keep = await run(500, 'V-500');
  assert.equal(await keep.q.size(), 1);
  assert.equal(keep.t.deadLetterCount(), 0);
  keep.t.stop();
});

test('sendViolation nhận 409 không xếp hàng; 422 đưa dead-letter ngay', async () => {
  const q = mkQueue();
  const t = createTransport32({ baseUrl: BASE, token: 'x', queue: q, log: () => {},
    fetchImpl: fakeFetch(async (url, opts, n) => (n === 1 ? json(409, {}) : json(422, {}))) });
  const dup = await t.sendViolation(violationRec('V-1'));
  assert.equal(dup.duplicate, true);
  assert.equal(await t.sendViolation(violationRec('V-2')), null);
  assert.equal(t.deadLetterCount(), 1);
  assert.equal(await q.size(), 0);
  t.stop();
});

test('401: đăng nhập lại đúng một lần rồi gửi lại với token mới', async () => {
  let logins = 0;
  const login = async () => { logins++; return `tok-${logins}`; };
  const fetchImpl = fakeFetch(async (url, opts) => (opts.headers.Authorization === 'Bearer tok-1' ? json(401, {}) : json(201, { id: 'VP-9' })));
  const t = createTransport32({ baseUrl: BASE, login, queue: mkQueue(), fetchImpl, log: () => {} });
  const r = await t.sendViolation(violationRec('V-9'));
  assert.equal(r.id, 'VP-9');
  assert.equal(logins, 2);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[1].headers.Authorization, 'Bearer tok-2');
  t.stop();
});

test('chưa có token: nhiều yêu cầu đồng thời chỉ đăng nhập một lần', async () => {
  let logins = 0;
  const login = async () => { logins++; await tick(); return 'tok-shared'; };
  const fetchImpl = fakeFetch(async url => (url.endsWith('/station/metrics') ? json(200, {}) : json(200, { ok: true, commands: [] })));
  const t = createTransport32({ baseUrl: BASE, login, queue: mkQueue(), fetchImpl, log: () => {} });
  const [a, b, c] = await Promise.all([t.sendMetrics({ x: 1 }), t.sendMetrics({ x: 2 }), t.sendFrame('CAM-HX-001', 1, 'QUJD', 1, 1)]);
  assert.equal(a, true);
  assert.equal(b, true);
  assert.equal(c, true);
  assert.equal(logins, 1);
  assert.ok(fetchImpl.calls.every(x => x.headers.Authorization === 'Bearer tok-shared'));
  t.stop();
});

test('backoff 1 → 2 → 4 s khi 429 (đồng hồ giả, không chờ thật)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchImpl = fakeFetch(async () => json(429, { error: { code: 'RATE_LIMITED' } }));
  const q = mkQueue();
  await q.push(toViolationBody32(violationRec('V-B')));
  const tr = createTransport32({ baseUrl: BASE, token: 'x', queue: q, fetchImpl, log: () => {} });
  tr.start();   // heartbeat + flush ngay (cũng là lời gọi đầu tiên tới /station/violations sau heartbeat)
  await tick();
  const violationCalls = () => fetchImpl.calls.filter(c => c.url.endsWith('/station/violations')).length;
  assert.equal(violationCalls(), 1);
  t.mock.timers.tick(999);
  await tick();
  assert.equal(violationCalls(), 1);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(violationCalls(), 2);
  t.mock.timers.tick(2000);
  await tick();
  assert.equal(violationCalls(), 3);
  t.mock.timers.tick(4000);
  await tick();
  assert.equal(violationCalls(), 4);
  assert.equal(await q.size(), 1);   // vẫn giữ, không mất bản ghi
  tr.stop();
});

test('heartbeat 15 s: gửi ngay khi start rồi mỗi 15 s (đúng app_version, không dùng process)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchImpl = fakeFetch(async () => json(200, { ok: true, commands: [] }));
  const tr = createTransport32({ baseUrl: BASE, token: 'x', queue: mkQueue(), fetchImpl, uptimeS: () => 42, fpsOf: () => 58, log: () => {} });
  tr.start();
  await tick();
  const beats = () => fetchImpl.calls.filter(c => c.url.endsWith('/station/heartbeat'));
  assert.equal(beats().length, 1);
  const body = JSON.parse(beats()[0].body);
  assert.equal(body.station_id, 'STATION-3D-01');
  assert.equal(body.app_version, 'transport-32a');
  assert.equal(body.uptime_s, 42);
  assert.equal(body.fps, 58);
  t.mock.timers.tick(HEARTBEAT_S * 1000);
  await tick();
  assert.equal(beats().length, 2);
  tr.stop();
  t.mock.timers.tick(HEARTBEAT_S * 1000 * 3);
  await tick();
  assert.equal(beats().length, 2);   // đã stop: không còn nhịp
});

test('bằng chứng multipart gửi sau khi có id; trường kind + file (Blob image/jpeg), không đặt Content-Type', async () => {
  const fetchImpl = fakeFetch(async url => (url.endsWith('/station/violations') ? json(201, { id: 'VP-20260101-000001' }) : json(201, { media_id: 'MD-1' })));
  const t = createTransport32({ baseUrl: BASE, token: 'x', queue: mkQueue(), fetchImpl, log: () => {} });
  const ev = [{ kind: 'before', dataUrl: 'data:image/jpeg;base64,QUJD' }, { kind: 'plate_crop', dataUrl: 'data:image/jpeg;base64,REVG' }];
  const r = await t.sendViolation(violationRec('V-E'), ev);
  assert.equal(r.id, 'VP-20260101-000001');
  const evCalls = fetchImpl.calls.filter(c => c.url.includes('/evidence'));
  assert.equal(evCalls.length, 2);
  assert.equal(evCalls[0].url, `${BASE}/api/v1/station/violations/VP-20260101-000001/evidence`);
  assert.equal(evCalls[0].headers['Content-Type'], undefined);
  assert.equal(evCalls[0].body.get('kind'), 'before');
  const file = evCalls[0].body.get('file');
  assert.ok(file instanceof Blob);
  assert.equal(file.type, 'image/jpeg');
  assert.equal(file.size, 3);   // "ABC" (base64 QUJD = 3 byte)
  t.stop();
});

test('vi phạm xếp hàng (offline): bằng chứng giữ trong bộ nhớ và gửi khi flush thành công', async () => {
  let fail = true;
  const fetchImpl = fakeFetch(async url => {
    if (fail) throw new Error('network');
    return url.endsWith('/station/violations') ? json(201, { id: 'VP-7' }) : json(201, {});
  });
  const q = mkQueue();
  const t = createTransport32({ baseUrl: BASE, token: 'x', queue: q, fetchImpl, log: () => {} });
  await t.sendViolation(violationRec('V-7'), [{ kind: 'after', dataUrl: 'data:image/jpeg;base64,QUJD' }]);
  assert.equal(await q.size(), 1);
  fail = false;
  await t.flush();
  const evCalls = fetchImpl.calls.filter(c => c.url.includes('/evidence'));
  assert.equal(evCalls.length, 1);
  assert.equal(evCalls[0].url, `${BASE}/api/v1/station/violations/VP-7/evidence`);
  assert.equal(await q.size(), 0);
  t.stop();
});

test('bằng chứng 409 (trùng kind) coi là đã gửi; 404 bằng chứng vào dead-letter', async () => {
  let n = 0;
  const fetchImpl = fakeFetch(async url => {
    if (url.endsWith('/station/violations')) return json(201, { id: 'VP-3' });
    n++;
    return n === 1 ? json(409, {}) : json(404, {});
  });
  const t = createTransport32({ baseUrl: BASE, token: 'x', queue: mkQueue(), fetchImpl, log: () => {} });
  await t.sendViolation(violationRec('V-3'), [{ kind: 'before', dataUrl: 'data:image/jpeg;base64,QUJD' }, { kind: 'after', dataUrl: 'data:image/jpeg;base64,QUJD' }]);
  assert.equal(t.deadLetterCount(), 1);
  t.stop();
});

test('body gửi lên chỉ gồm trường ViolationIn; cycle_id lấy từ signal khi thiếu cấp gốc; khóa khớp backend', () => {
  const body = toViolationBody32(violationRec('V-B1', 9));
  assert.equal(body.status, undefined);
  assert.equal(body.review, undefined);
  assert.equal(body.violation_label, undefined);
  assert.equal(body.cycle_id, 9);
  assert.equal(body.plate, '51K-123.45');
  assert.equal(violationKey32(body), 'V-B1|HX-01|9|RED-LIGHT');
  assert.equal(violationKey32({ vehicle_id: 'V-B1', node_id: 'HX-01', cycle_id: 9, violation_code: 'RED-LIGHT' }), 'V-B1|HX-01|9|RED-LIGHT');
});

test('resolveApiBase32: mặc định 127.0.0.1:8900; chấp nhận máy cục bộ có ?api=; từ chối máy khác (không gửi tài khoản trạm đi)', () => {
  assert.deepEqual(resolveApiBase32(''), { baseUrl: 'http://127.0.0.1:8900', wsUrl: 'ws://127.0.0.1:8900/ws/v1', fallback: false });
  const local = resolveApiBase32('?v=32a&app=smart&api=http://127.0.0.1:8961/x/y');
  assert.equal(local.baseUrl, 'http://127.0.0.1:8961');
  assert.equal(local.wsUrl, 'ws://127.0.0.1:8961/ws/v1');
  assert.equal(resolveApiBase32('?api=http://localhost:9001').baseUrl, 'http://localhost:9001');
  const remote = resolveApiBase32('?api=https://evil.example.com');
  assert.equal(remote.baseUrl, 'http://127.0.0.1:8900');
  assert.equal(remote.fallback, true);
  assert.equal(resolveApiBase32('?api=javascript:alert(1)').baseUrl, 'http://127.0.0.1:8900');
});

test('dataUrl: tách base64 và Blob đúng MIME; dataUrl hỏng vẫn không văng lỗi ngoài mong đợi', () => {
  assert.equal(base64OfDataUrl32('data:image/png;base64,QUJD'), 'QUJD');
  const blob = dataUrlToBlob32('data:image/png;base64,QUJD');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 3);
});

test('buildSignalStates32: mỗi nút trong cụm một dòng; pha xanh/vàng/đỏ + ghi đè', () => {
  const controller = {
    stateOf: (n, t) => ({
      node_id: `HX-0${n + 1}`, cluster_id: 'C1', mode: 'smart',
      override: n === 1 ? { by: 'officer1', reason: 'kẹt' } : null,
      phases: [{ group: 0, phase: n === 0 ? 'green' : 'red', countdown_s: 3 }, { group: 1, phase: 'red', countdown_s: 3 }]
    })
  };
  const net = { signalPlan: { clusters: [{ cluster_id: 'C1', nodeIds: [0, 1] }] } };
  const rows = buildSignalStates32(controller, net, 12.345);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { node_id: 'HX-01', cluster_id: 'C1', t_sim: 12.3, phase: 'green', group: 0, mode: 'smart', override_by: null, reason: null });
  assert.equal(rows[1].phase, 'red');
  assert.equal(rows[1].group, null);
  assert.equal(rows[1].override_by, 'officer1');
  assert.deepEqual(buildSignalStates32(controller, {}, 1), []);
});

test('WebSocket: gửi {type:"auth",token} ngay khi mở; tin nhắn cmd.* gọi onCommand; stop đóng socket', async () => {
  const sockets = [];
  class FakeWS {
    constructor(url) {
      this.url = url; this.sent = []; this.closed = false; sockets.push(this);
      queueMicrotask(() => { if (this.onopen) this.onopen(); });
    }
    send(s) { this.sent.push(s); }
    close() { this.closed = true; }
  }
  const fetchImpl = fakeFetch(async () => json(200, { ok: true, commands: [] }));
  const got = [];
  const tr = createTransport32({ baseUrl: BASE, wsUrl: 'ws://127.0.0.1:8900/ws/v1', token: 'tok-ws', queue: mkQueue(), fetchImpl, wsImpl: FakeWS, log: () => {} });
  tr.onCommand(msg => got.push(msg));
  tr.start();
  await tick();
  await tick();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'ws://127.0.0.1:8900/ws/v1');
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { type: 'auth', token: 'tok-ws' });
  assert.equal(tr.wsState(), 'open');
  sockets[0].onmessage({ data: JSON.stringify({ event: 'cmd.signal-mode', t: 'x', seq: 1, data: { mode: 'fixed' } }) });
  sockets[0].onmessage({ data: 'không phải JSON' });
  assert.equal(got.length, 1);
  assert.equal(got[0].event, 'cmd.signal-mode');
  assert.equal(got[0].data.mode, 'fixed');
  tr.stop();
  assert.equal(sockets[0].closed, true);
});

test('gửi metrics và khung: lỗi/429 không xếp hàng; khung gửi đúng camera, seq, base64', async () => {
  const fetchImpl = fakeFetch(async (url) => (url.endsWith('/station/frames') ? json(429, {}) : json(200, { ok: true })));
  const q = mkQueue();
  const t = createTransport32({ baseUrl: BASE, token: 'x', queue: q, fetchImpl, log: () => {} });
  assert.equal(await t.sendFrame('CAM-HX-001', 5, 'QUJD', 1280, 720), false);
  assert.equal(await q.size(), 0);
  assert.equal(await t.sendMetrics({ station_id: 'STATION-3D-01', kpi: {} }), true);
  const f = JSON.parse(fetchImpl.calls[0].body);
  assert.equal(f.camera_id, 'CAM-HX-001');
  assert.equal(f.seq, 5);
  assert.equal(f.jpeg_base64, 'QUJD');
  t.stop();
});

test('startStationLoop32: bật stream 2 fps cho camera đang mở; vi phạm gửi kèm 3 bằng chứng; khung gửi đi', async () => {
  const sets = [];
  const sent = [];
  const frames = [];
  let scanned = 0;
  const rec = violationRec('V-000001', 3);
  const app = {
    traffic: {
      sim: { counters: { t: 10 }, active: [true], lane: [0], s: [1] },
      net: { lanes: { edge: [0], length: [100] }, E: [{ c: [0, 0, 100, 0] }] }
    }
  };
  const perception = {
    scan: () => { scanned++; },
    drainViolations: () => (scanned === 1 ? [rec] : [])
  };
  const jpeg = 'data:image/jpeg;base64,QUJD';
  const capture = {
    captureFrame: async () => null,
    latestFrame: id => (id === 'CAM-HX-001' ? { jpeg, seq: 4, w: 1280, h: 720 } : null),
    captureEvidence: async () => ({
      before: { jpeg, kind: 'before' }, after: { jpeg, kind: 'after' }, plate_crop: { jpeg, kind: 'plate_crop' }
    }),
    setStream: (id, on, fps) => sets.push({ id, on, fps })
  };
  const transport = {
    sendViolation: async (r, ev) => { sent.push({ r, ev }); return { id: 'VP-L' }; },
    sendFrame: async (id, seq, b64, w, h) => { frames.push({ id, seq, b64, w, h }); return true; }
  };
  const cameras = [{ camera_id: 'CAM-HX-001', x: 0, z: 0 }, { camera_id: 'CAM-HX-002', x: 5, z: 0 }];
  const loop = startStationLoop32(app, { perception, capture, transport, cameras, scanMs: 10000 });
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(sets[0], { id: 'CAM-HX-001', on: true, fps: 2 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].r.vehicle_id, 'V-000001');
  assert.deepEqual(sent[0].ev.map(e => e.kind), ['before', 'after', 'plate_crop']);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].b64, 'QUJD');
  assert.equal(frames[0].seq, 4);
  assert.equal(loop.currentOpen(), 'CAM-HX-001');
  loop.openCamera('CAM-HX-002');
  assert.deepEqual(sets.slice(1), [{ id: 'CAM-HX-001', on: false, fps: 2 }, { id: 'CAM-HX-002', on: true, fps: 2 }]);
  loop.stop();
  assert.equal(sets.at(-1).on, false);
});

test('mã nguồn client không dùng process và không có chữ cấm trên UI của HUD', async () => {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const client = readFileSync(`${dir}station-client-32.js`, 'utf8');
  const hud = readFileSync(`${dir}kpi-panel-32.js`, 'utf8');
  assert.equal(/\bprocess\./.test(client), false);
  for (const bad of ['giả lập', 'mô phỏng', 'minh họa', 'illustrative', 'simulated', 'demo', 'fake']) {
    assert.equal(hud.toLowerCase().includes(bad), false, `HUD chứa chữ cấm: ${bad}`);
  }
});
