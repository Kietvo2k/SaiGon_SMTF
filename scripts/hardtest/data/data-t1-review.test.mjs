import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const suiteRoot = fileURLToPath(new URL('../../../', import.meta.url));
const productRoot = resolve(process.env.DATA_T1_ROOT || suiteRoot);
const require = createRequire(import.meta.url);
const gitHead = cwd => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
console.log('DATA-T1 review suite:', gitHead(suiteRoot), 'product:', gitHead(productRoot), productRoot);
const account = JSON.parse(readFileSync(join(suiteRoot, 'docs/agent/fixtures/public-demo-v1.json'), 'utf8'))
  .accounts.find(item => item.role === 'commander');

let browser;
let server;
let origin;

async function publicPage(t) {
  if (!browser) {
    const { chromium } = require(process.env.PW_MODULE ||
      join(process.env.APPDATA || '', 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
    const executablePath = process.env.PW_CHROME ||
      join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
    browser = await chromium.launch({ headless: true, ...(existsSync(executablePath) ? { executablePath } : {}) });
    server = createServer((req, res) => {
      if (req.url === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>DATA-T1 review</title>');
      const path = resolve(productRoot, '.' + new URL(req.url, origin).pathname);
      if (!path.startsWith(productRoot + sep) || !path.endsWith('.js') || !existsSync(path)) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(readFileSync(path));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
  }
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async ({ username, password }) => {
    const { createTrafficTransport } = await import('/outputs/shared/public-demo/traffic-transport.js');
    const transport = createTrafficTransport({ mode: 'public', buildId: 'data-t1-review' });
    const { access_token } = await transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username, password } });
    const lease = await transport.request({ method: 'POST', path: '/api/v1/station/lease',
      body: { station_id: 'STATION-3D-01', owner_id: 'data-t1-review-owner' } });
    window.call = (method, path, body, station = false) =>
      transport.request({ method, path: '/api/v1/' + path, body, token: station ? lease.capability : access_token });
    window.command = (command_id, mode = 'smart') => window.call('POST', 'officer/controls/signal-mode', { command_id, mode });
    window.dequeue = async () => (await window.call('GET', 'station/commands/pending', undefined, true)).commands;
    window.ack = id => window.call('POST', 'station/commands/' + encodeURIComponent(id) + '/ack',
      { status: 'applied', applied_t_sim: 50 }, true);
    window.controls = () => window.call('GET', 'officer/controls/state');
    window.override = async () => window.call('POST', 'officer/controls/signal-override',
      { command_id: 'review-override', node_id: 'HX-01', group: 1, duration_s: 1 });
  }, account);
  return page;
}

after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('DATA-T1-R3 public: URL encode một lần, dedup giữ nguyên ID', { timeout: 12000 }, async t => {
  const page = await publicPage(t);
  const ids = ['review space', 'review đèn', 'review%', 'review/slash', 'review%2Fslash'];
  const result = await page.evaluate(async ids => {
    const attempt = async request => {
      try {
        const value = await request();
        return [value.command_id, value.status];
      } catch (error) {
        return [error.status, error.code];
      }
    };
    const pending = [];
    for (const id of ids) pending.push([await attempt(() => window.command(id)), await attempt(() => window.command(id))]);
    const queued = (await window.dequeue()).map(item => item.command_id);
    const empty = await window.dequeue();
    const roundTrips = [];
    for (const id of ids) {
      const path = 'officer/commands/' + encodeURIComponent(id);
      roundTrips.push([await attempt(() => window.call('GET', path)), await attempt(() => window.ack(id)),
        await attempt(() => window.call('GET', path)), await attempt(() => window.command(id))]);
    }
    return { pending, queued, empty, roundTrips };
  }, ids);
  assert.deepEqual(result.pending, ids.map(id => [[id, 'pending'], [id, 'pending']]));
  assert.deepEqual(result.queued.sort(), [...ids].sort());
  assert.deepEqual(result.empty, []);
  assert.deepEqual(result.roundTrips, ids.map(id => [[id, 'pending'], [id, 'applied'], [id, 'applied'], [id, 'applied']]),
    'GET/ACK phải giải mã đúng một lần, giữ nguyên ID đã nhận');
});

test('DATA-T1-R6 public: telemetry hiện hành thay mode, override và pha đèn', { timeout: 12000 }, async t => {
  const page = await publicPage(t);
  const result = await page.evaluate(async () => {
    const pending = await window.override();
    const queue = await window.dequeue();
    const ack = await window.ack(pending.command_id);
    const before = await window.controls();
    const telemetry = {
      station_id: 'STATION-3D-01', t: new Date().toISOString(), t_sim: 55, signal_mode: 'smart',
      kpi: { wait_avg_s: 5, queue_max: 8, flow_per_min: 22 }, overrides: [],
      signal_states: [{ node_id: 'HX-01', cluster_id: 'HX-C1', t_sim: 55, mode: 'smart', phase: 'red', group: null }],
    };
    const written = await window.call('POST', 'station/metrics', telemetry, true);
    const snapshot = await window.call('GET', 'officer/snapshot');
    return { pending, queue, ack, before, written, snapshot, after: await window.controls() };
  });
  assert.equal(result.pending.status, 'pending');
  assert.deepEqual(result.queue.map(item => item.command_id), ['review-override']);
  assert.equal(result.ack.status, 'applied');
  assert.ok(result.before.overrides.some(item => item.node_id === 'HX-01' && item.group === 1));
  assert.equal(result.written.ok, true);
  assert.equal(result.snapshot.simulation.mode, 'smart');
  assert.equal(result.snapshot.simulation.t_sim, 55);
  assert.equal(result.snapshot.kpi.queue_max, 8);
  const signal = result.after.signals.find(item => item.node_id === 'HX-01');
  assert.deepEqual({ mode: result.after.mode, overrides: result.after.overrides, phase: signal?.phase, group: signal?.group },
    { mode: 'smart', overrides: [], phase: 'red', group: null }, 'Controls phải phản ánh telemetry như snapshot');
});

test('DATA-T1-R6 public: TTL 1 giây bắt đầu lúc ACK, trạng thái lệnh vẫn applied sau hết hạn', { timeout: 12000 }, async t => {
  const page = await publicPage(t);
  const result = await page.evaluate(async () => {
    const pending = await window.override();
    const queue = await window.dequeue();
    await new Promise(resolve => setTimeout(resolve, 1150));
    const preAck = await window.controls();
    const ackStart = Date.now();
    const ack = await window.ack(pending.command_id);
    const ackEnd = Date.now();
    const active = await window.controls();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, ackEnd + 1050 - Date.now())));
    const expired = await window.controls();
    const history = await window.call('GET', 'officer/commands/' + pending.command_id);
    return { pending, queue, preAck, ackStart, ack, ackEnd, active, expired, history };
  });
  assert.equal(result.pending.status, 'pending');
  assert.deepEqual(result.queue.map(item => item.command_id), ['review-override']);
  assert.deepEqual(result.preAck.overrides, []);
  assert.equal(result.ack.status, 'applied');
  assert.equal(result.ack.applied_t_sim, 50);
  const override = result.active.overrides.find(item => item.node_id === 'HX-01');
  assert.equal(override?.group, 1, 'Override phải có hiệu lực sau ACK trễ hơn 1 giây');
  const until = Date.parse(override.until_at);
  assert.ok(until >= result.ackStart + 1000 && until <= result.ackEnd + 1000,
    'Hạn override phải bằng thời điểm ACK + duration_s');
  assert.deepEqual(result.expired.overrides, []);
  assert.equal(result.history.status, 'applied');
  assert.equal(result.history.applied_t_sim, 50);
});

// Các ID đối chiếu trực tiếp cameras.json → node_map.json của cấu hình Hàng Xanh.
const cameraJunctions = ['HX-C1', 'HX-C5', 'HX-C1', 'HX-C5', 'HX-C2', 'HX-C2', 'HX-C3', 'HX-C3', 'HX-C4', 'HX-C1'];

let runtime;
async function snapshotRuntime() {
  runtime ??= (async () => {
    const poc = join(productRoot, 'outputs/hcmc-poc');
    const seedRoot = join(productRoot, 'outputs/smart-traffic/backend/app/seed');
    globalThis.window = globalThis;
    require(join(poc, 'data/road-graph-31.js'));
    require(join(poc, 'data/scene.js'));
    const graph = globalThis.ROAD_GRAPH_31;
    const { roads } = globalThis.CITY_DATA;
    const nodeMap = JSON.parse(readFileSync(join(seedRoot, 'node_map.json'), 'utf8'));
    const cameras = JSON.parse(readFileSync(join(seedRoot, 'cameras.json'), 'utf8'));
    const load = name => import(pathToFileURL(join(poc, name)).href);
    const { readStationSnapshot32 } = await load('smart-app-32.js');
    const { buildTrafficNetwork31, createTrafficSim31 } = await load('city-traffic-sim-31.js');
    const { buildSignalPlan32 } = await load('signal-plan-32.js');
    const { createSignalController32 } = await load('traffic-controller-32.js');
    const signalPlan = buildSignalPlan32({ graph, nodeMap });
    const net = buildTrafficNetwork31({ graph, roads, widthOf: () => 8, drawn: i => !roads[i].tunnel && graph.roads[i].skipRender !== 'hide', signalPlan });
    return seed => {
      const controller = createSignalController32({ net, mode: 'fixed' });
      const sim = createTrafficSim31(net, { controller, signalPlan, seed, poolTarget: 16 });
      return readStationSnapshot32({ traffic: { net, sim }, controller }, cameras,
        { frameMetadata: () => ({}) }, 'data-t1-review');
    };
  })();
  return runtime;
}

test('DATA-T1-R4 runtime: mười camera nối đúng cụm đèn logic', async () => {
  const snapshot = (await snapshotRuntime())(71037);
  const actual = Object.fromEntries(snapshot.cameras.map(c => [c.camera_id, c.junction_id]));
  const expected = Object.fromEntries(cameraJunctions.map((junction, i) => ['CAM-HX-' + String(i + 1).padStart(3, '0'), junction]));
  assert.equal(snapshot.cameras.length, cameraJunctions.length);
  assert.deepEqual(actual, expected);
  for (const junction of Object.values(expected)) {
    assert.ok(snapshot.junctions.some(item => item.junction_id === junction));
  }
});

test('DATA-T1-R5 runtime: snapshot mang seed thật của hai mô phỏng', async () => {
  const snapshot = await snapshotRuntime();
  const seeds = [71037, 82309];
  assert.deepEqual(seeds.map(seed => snapshot(seed).simulation.seed), seeds);
});