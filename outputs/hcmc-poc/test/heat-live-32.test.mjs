import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import {
  createHeatLive32, createRouteBias32, chooseVmsBoards32, vmsMessage32, collectSamples32, complies32,
  speedLimitsOf32, roadNameOf32, COMPLY_SHARE_32, BIAS_FACTOR_32, ALERT_PROB_32
} from '../heat-live-32.js?v=32a';
import { ribbonEdges32, buildRibbon32, paintRibbon32, HEAT_SCENE_32_VERSION } from '../heat-scene-32.js?v=32a';
import { createTransport32 } from '../station-client-32.js?v=32a';
import { createQueue32, createMemoryStore32 } from '../station-queue-32.js?v=32a';
import { HEAT_COLORS_32, colorOf } from '../heat-32.js?v=32a';
import { SMART_APP_32_VERSION, BANNED_STRINGS, HEAT_TICK_MS_32 } from '../smart-app-32.js?v=32a';

const MODULE_FILES = ['heat-live-32.js', 'heat-scene-32.js'].map(f => path.resolve('outputs/hcmc-poc', f));

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const buildNet = () => buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });

test('phiên bản module M4b1, hằng số đúng đặc tả, mã mới không có chữ cấm', () => {
  assert.equal(HEAT_SCENE_32_VERSION, 'heat-scene-32a');
  assert.equal(SMART_APP_32_VERSION, 'smart-app-32a');
  assert.equal(HEAT_TICK_MS_32, 250);
  assert.equal(ALERT_PROB_32, 0.6);
  assert.equal(COMPLY_SHARE_32, 0.6);
  for (const file of MODULE_FILES) {
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const bad of BANNED_STRINGS) assert.ok(!text.includes(bad), `${path.basename(file)} chứa "${bad}"`);
  }
});

test('thu mẫu: chỉ xe đang chạy, cạnh hợp lệ, cờ dừng theo vận tốc; tốc độ tự do theo cạnh', () => {
  const net = buildNet();
  const sim = createTrafficSim31(net, { signalPlan, breakerS: 180, seed: SEED });
  for (let k = 0; k < 50; k++) sim.step();
  const samples = collectSamples32(sim, net);
  let active = 0;
  for (let i = 0; i < sim.N; i++) if (sim.active[i]) active++;
  assert.equal(samples.length, active);
  for (const s of samples) {
    assert.ok(Number.isInteger(s.edge) && s.edge >= 0 && s.edge < net.NE);
    assert.ok(Number.isFinite(s.speed) && s.speed >= 0);
    assert.ok(s.stopped === 0 || s.stopped === 1);
  }
  const lim = speedLimitsOf32(net);
  assert.equal(lim.length, net.NE);
  for (const v of lim) assert.ok(v > 0);
  assert.ok(lim.some(v => v >= 8), 'cạnh trục chính có tốc độ tự do cao');
});

test('tuân thủ cảnh báo: ~60 % xe, tất định theo seed, giống nhau giữa các lần gọi', () => {
  let n = 0;
  for (let i = 0; i < 20000; i++) if (complies32(i)) n++;
  const share = n / 20000;
  assert.ok(Math.abs(share - COMPLY_SHARE_32) < 0.02, `tỉ lệ tuân thủ ${share}`);
  for (let i = 0; i < 200; i++) assert.equal(complies32(i), complies32(i));
  let diff = 0;
  for (let i = 0; i < 2000; i++) if (complies32(i, SEED) !== complies32(i, SEED + 7)) diff++;
  assert.ok(diff > 0, 'seed khác → bộ xe tuân thủ khác');
});

test('routeBias: chỉ giảm với cạnh đang cảnh báo và xe tuân thủ; không cảnh báo = 1', () => {
  const rb = createRouteBias32();
  assert.equal(rb.routeBias(7, 0), 1, 'chưa có cảnh báo: y nguyên');
  rb.setAvoid([7]);
  assert.deepEqual(rb.avoided(), [7]);
  let factorHits = 0, others = 0;
  for (let i = 0; i < 1000; i++) {
    const f = rb.routeBias(7, i);
    assert.ok(f === 1 || f === BIAS_FACTOR_32);
    if (f < 1) factorHits++;
    if (rb.routeBias(8, i) !== 1) others++;
  }
  assert.equal(others, 0, 'cạnh không cảnh báo không bị ảnh hưởng');
  assert.ok(Math.abs(factorHits / 1000 - COMPLY_SHARE_32) < 0.05, `xe tuân thủ ${factorHits}`);
  rb.setAvoid([]);
  assert.equal(rb.routeBias(7, 0), 1);
});

test('sim không truyền routeBias (hoặc hàm luôn trả 1) cho cùng trạng thái: hash cổ điển không đổi', () => {
  const base = createTrafficSim31(buildNet(), { signalPlan, breakerS: 180, seed: SEED });
  const same = createTrafficSim31(buildNet(), { signalPlan, breakerS: 180, seed: SEED, routeBias: () => 1 });
  for (let k = 0; k < 300; k++) { base.step(); same.step(); }
  assert.equal(same.stateHash(), base.stateHash());
});

test('routeBias trên sim: tổng số lần xe đi vào các cạnh đích giảm rõ (≥ 30 %)', () => {
  const countInto = (routeBias, targets) => {
    const net = buildNet();
    const sim = createTrafficSim31(net, { signalPlan, breakerS: 180, seed: SEED, routeBias });
    const prev = new Int32Array(sim.N).fill(-1);
    const into = new Map();
    for (let k = 0; k < 3000; k++) {
      sim.step();
      for (let i = 0; i < sim.N; i++) {
        if (!sim.active[i]) { prev[i] = -1; continue; }
        const e = net.lanes.edge[sim.lane[i]];
        if (e !== prev[i] && prev[i] >= 0 && targets.has(e)) into.set(e, (into.get(e) || 0) + 1);
        prev[i] = e;
      }
    }
    return [...into.values()].reduce((a, b) => a + b, 0);
  };
  // Cạnh đích: cạnh có nút đầu là nút rẽ (≥ 2 lựa chọn) và xe thật sự đi vào nhiều nhất trong 300 s chạy thường.
  const net0 = buildNet();
  const branch = new Set();
  for (let st = 0; st < net0.NS; st++) {
    const c = net0.nextSt[st];
    if (c && c.length >= 2 && net0.lanesOfSt[st] >= 0) for (const x of c) branch.add(x.st >> 1);
  }
  const sim0 = createTrafficSim31(net0, { signalPlan, breakerS: 180, seed: SEED });
  const prev = new Int32Array(sim0.N).fill(-1), count = new Map();
  for (let k = 0; k < 3000; k++) {
    sim0.step();
    for (let i = 0; i < sim0.N; i++) {
      if (!sim0.active[i]) { prev[i] = -1; continue; }
      const e = net0.lanes.edge[sim0.lane[i]];
      if (e !== prev[i] && prev[i] >= 0 && branch.has(e)) count.set(e, (count.get(e) || 0) + 1);
      prev[i] = e;
    }
  }
  const targets = new Set([...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e]) => e));
  assert.equal(targets.size, 8, 'đủ 8 cạnh đích');
  const base = countInto(null, targets);
  const rb = createRouteBias32();
  rb.setAvoid(targets);
  const biased = countInto(rb.routeBias, targets);
  assert.ok(base > 100, `có đủ xe đi vào đích (${base})`);
  assert.ok(biased <= 0.7 * base, `giảm rõ: ${biased}/${base} = ${(biased / base).toFixed(3)}`);
});

test('engine: tick theo giây sim tạo bản đồ nhiệt, lịch sử, dự báo; payload gửi đúng 10 s một lần', () => {
  const net = buildNet();
  const sim = createTrafficSim31(net, { signalPlan, breakerS: 180, seed: SEED });
  const rb = createRouteBias32();
  const payloads = [];
  const live = createHeatLive32({ net, sim, routing: rb, onPayload: p => payloads.push(p) });
  assert.deepEqual(live.alerts(), []);
  for (let k = 0; k < 1500; k++) { sim.step(); live.tick(); }
  assert.ok(sim.counters.t >= 149);
  const lv = live.levels();
  assert.equal(lv.length, net.NE);
  let maxLevel = 0;
  for (const x of lv) { assert.ok(x >= 0 && x <= 1); if (x > maxLevel) maxLevel = x; }
  assert.ok(maxLevel > 0.3, `có mức nhiệt cao (${maxLevel})`);
  assert.equal(payloads.length, 1 + Math.floor(sim.counters.t / 10), 'một payload lúc bắt đầu rồi mỗi 10 s sim');
  const p = payloads[payloads.length - 1];
  assert.deepEqual(Object.keys(p).sort(), ['alerts', 'levels', 't_sim']);
  assert.ok(p.levels.every(([e, x]) => Number.isInteger(e) && x >= 0.05 && x <= 1));
  for (const a of p.alerts) {
    assert.ok(a.prob >= ALERT_PROB_32 && a.prob <= 1);
    assert.ok([10, 20, 30].includes(a.horizon_min));
    assert.ok(Object.keys(a).sort().join() === 'edge,horizon_min,level,prob,reliability');
  }
  for (const a of live.alerts()) {
    assert.ok(a.name && typeof a.name === 'string');
    assert.ok(a.prob >= ALERT_PROB_32);
  }
  const avoided = rb.avoided();
  assert.deepEqual(avoided.slice().sort((x, y) => x - y), live.alerts().map(a => a.edge).sort((x, y) => x - y));
});

test('engine: sim đặt lại (thời gian lùi) thì xóa lịch sử và cảnh báo', () => {
  const net = buildNet();
  const sim = createTrafficSim31(net, { signalPlan, breakerS: 180, seed: SEED });
  const rb = createRouteBias32();
  const live = createHeatLive32({ net, sim, routing: rb });
  for (let k = 0; k < 600; k++) { sim.step(); live.tick(); }
  sim.reset();
  live.tick();
  assert.ok(live.state().t < 1);
  assert.deepEqual(live.alerts(), []);
  assert.deepEqual(rb.avoided(), []);
  // Lịch sử đã xóa: chỉ còn đúng một lần thu mẫu (EMA từ 0 với alpha 0,25 ⇒ mức ≤ 0,25).
  assert.ok(Math.max(...live.levels()) <= 0.25 + 1e-6);
});

test('bảng VMS: 2–4 bảng trên làn tới Hàng Xanh, cách nhau ≥ 120 m, có cạnh phía trước và hướng quay về xe tới', () => {
  const net = buildNet();
  const boards = chooseVmsBoards32({ net, nodeMap, max: 4 });
  assert.ok(boards.length >= 2 && boards.length <= 4, `số bảng ${boards.length}`);
  const ids = new Set(boards.map(b => b.id));
  assert.equal(ids.size, boards.length);
  for (const b of boards) {
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z) && Number.isFinite(b.yaw));
    assert.ok(b.watch.has(b.edge), 'cạnh tiếp cận nằm trong phía trước');
    assert.equal(typeof b.altName, 'string');
    assert.ok(Math.abs(b.yaw) <= Math.PI + 1e-9);
    for (const bad of BANNED_STRINGS) assert.ok(!`${b.approach} ${b.altName}`.toLowerCase().includes(bad));
  }
  for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) {
    assert.ok(Math.hypot(boards[i].x - boards[j].x, boards[i].z - boards[j].z) >= 120);
  }
  const hx = nodeMap.map(m => G.nodes.findIndex(n => n.id === m.osm_id)).filter(i => i >= 0);
  for (const b of boards) {
    const near = hx.some(n => Math.hypot(G.nodes[n].x - b.x, G.nodes[n].z - b.z) < 400);
    assert.ok(near, `bảng ${b.id} gần Hàng Xanh`);
  }
});

test('thông điệp VMS: bình thường khi không có cảnh báo phía trước; KẸT XE + tuyến thay thế khi có', () => {
  const board = { id: 'VMS-T', edge: 3, watch: new Set([3, 9]), altName: 'Đường Thử Nghiệm' };
  const normal = vmsMessage32(board, []);
  assert.equal(normal.state, 'normal');
  assert.equal(normal.text, 'LÁI XE AN TOÀN');
  const unrelated = vmsMessage32(board, [{ edge: 77, prob: 0.99, horizonMin: 10 }]);
  assert.equal(unrelated.state, 'normal', 'cảnh báo ngoài phía trước không đổi bảng');
  const alert = vmsMessage32(board, [{ edge: 5, prob: 0.7, horizonMin: 10 }, { edge: 9, prob: 0.9, horizonMin: 20 }]);
  assert.equal(alert.state, 'alert');
  assert.equal(alert.text, 'KẸT XE PHÍA TRƯỚC · ĐI Đường Thử Nghiệm');
  assert.equal(alert.edge, 9, 'chọn cảnh báo xác suất cao nhất');
  assert.equal(alert.horizonMin, 20);
  const noAlt = vmsMessage32({ ...board, altName: '' }, [{ edge: 3, prob: 0.8, horizonMin: 30 }]);
  assert.equal(noAlt.text, 'KẸT XE PHÍA TRƯỚC · ĐI TUYẾN KHÁC');
  assert.notEqual(alert.key, normal.key);
  assert.equal(vmsMessage32(board, [{ edge: 3, prob: 0.8, horizonMin: 30 }]).key, vmsMessage32(board, [{ edge: 9, prob: 0.85, horizonMin: 10 }]).key, 'cùng chữ thì khóa hình không đổi');
  for (const m of [normal, alert, noAlt]) for (const bad of BANNED_STRINGS) assert.ok(!m.text.toLowerCase().includes(bad));
});

test('dải nhiệt (hình học thuần): đỉnh 2 mỗi điểm, chỉ số tam giác hợp lệ, tô màu theo mức', () => {
  const fake = { E: [{ c: [0, 0, 10, 0, 20, 0], road: 0 }, { c: [0, 5, 0, 15], road: 0 }], NE: 2, NL: 0 };
  const built = buildRibbon32({ net: fake, edges: [0, 1], yOf: () => 3, halfWidthOf: () => 2, lift: 0.25 });
  assert.equal(built.positions.length, (6 + 4) * 3);
  assert.equal(built.indices.length, 6 * 2 + 6);
  for (const idx of built.indices) assert.ok(idx < 10);
  for (let k = 1; k < built.positions.length; k += 3) assert.equal(built.positions[k], 3.25);
  assert.deepEqual(built.ranges.map(r => [r.edge, r.start, r.count]), [[0, 0, 6], [1, 6, 4]]);
  const palette = HEAT_COLORS_32.map((_, k) => [k / 10, 0, 0]);
  const levels = [0.05, 0.9];
  const painted = paintRibbon32(built.colors, built.ranges, e => levels[e], palette);
  assert.equal(painted, 2);
  assert.equal(built.colors[0], palette[0][0]);
  assert.ok(Math.abs(built.colors[6 * 3] - palette[4][0]) < 1e-6);
  assert.equal(colorOf(0.9), HEAT_COLORS_32[4]);
});

test('ribbonEdges32 trên mạng thật: chỉ cạnh tertiary trở lên, có trong khu (không lọc khu = mọi cạnh)', () => {
  const net = buildNet();
  const sim = createTrafficSim31(net, { signalPlan, breakerS: 180, seed: SEED });
  const edges = ribbonEdges32(net, sim);
  assert.ok(edges.length > 100);
  for (const e of edges) assert.ok(net.E[e].c.length >= 4);
  const ranked = new Set();
  for (let l = 0; l < net.NL; l++) if (net.lanes.rank[l] >= 2) ranked.add(net.lanes.edge[l]);
  for (const e of edges) assert.ok(ranked.has(e));
});

test('gửi trạm: sendHeat POST đúng payload; 404 (backend chưa có endpoint) trả false, không vào dead-letter/hàng đợi', async () => {
  const calls = [];
  let status = 404;
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers && init.headers.Authorization });
    return { ok: status === 200, status, json: async () => ({}) };
  };
  const queue = createQueue32({ store: createMemoryStore32() });
  const transport = createTransport32({ baseUrl: 'http://127.0.0.1:8900', token: 'tok', queue, fetchImpl });
  const payload = { t_sim: 10, levels: [[1, 0.5]], alerts: [] };
  assert.equal(await transport.sendHeat(payload), false);
  assert.equal(transport.deadLetterCount(), 0);
  assert.equal(await transport.pendingCount(), 0);
  status = 200;
  assert.equal(await transport.sendHeat(payload), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://127.0.0.1:8900/api/v1/station/heat');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].auth, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[1].body), payload);
  const broken = createTransport32({ baseUrl: 'http://127.0.0.1:8900', token: 'tok', queue, fetchImpl: async () => { throw new Error('mất mạng'); } });
  assert.equal(await broken.sendHeat(payload), false, 'mất mạng không ném lỗi');
});
