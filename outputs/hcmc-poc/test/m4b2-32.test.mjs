// M4b2 — gộp cảnh báo, lịch sử offline, đồng hồ/tua, tua trước (lõi Worker), KPI lưu lượng theo nút.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import { regionTrafficPayload } from '../city-region-31.js?v=31a';
import { createHeatLive32, groupAlertsByRoad32, expandHeatHistory32, probOfLevel32 } from '../heat-live-32.js?v=32a';
import { createLookaheadRunner32 } from '../forecast-core-32.js?v=32a';
import { clockAt32, lightOf32, demandOfHour32, DEMAND_BY_HOUR_32, installClock32 } from '../clock-32.js?v=32a';
import { collectBuffers32 } from '../forecast-client-32.js?v=32a';

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
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const north = regionTrafficPayload('bac');

function northSim(mode) {
  const controller = createSignalController32({ net, sim: null, mode });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED });
  sim.setRegion(north);
  sim.setFraction(0.8);
  return sim;
}

const al = (edge, name, prob, horizonMin = 10) => ({ edge, name, prob, reliability: 0.5, horizonMin, level: 0.8 });

test('groupAlertsByRoad32: một dòng mỗi tên (prob cao nhất, đếm đoạn), đường không tên gộp theo cạnh, tối đa 5 dòng', () => {
  const alerts = [
    al(1, 'Điện Biên Phủ', 0.9), al(2, 'Điện Biên Phủ', 0.95, 20), al(3, 'Điện Biên Phủ', 0.7),
    al(4, 'Bạch Đằng', 0.8), al(5, 'đường không tên', 0.85), al(6, 'đường không tên', 0.75),
    al(7, 'Nguyễn Hữu Cảnh', 0.65), al(8, 'Đinh Bộ Lĩnh', 0.62), al(9, 'Xô Viết Nghệ Tĩnh', 0.61)
  ];
  const rows = groupAlertsByRoad32(alerts);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].name, 'Điện Biên Phủ');
  assert.equal(rows[0].prob, 0.95);
  assert.equal(rows[0].edge, 2);
  assert.equal(rows[0].horizonMin, 20);
  assert.equal(rows[0].segments, 3);
  assert.equal(rows.filter(r => r.name === 'Điện Biên Phủ').length, 1);
  const unnamed = groupAlertsByRoad32(alerts, 10).filter(r => r.name === 'đường không tên');
  assert.equal(unnamed.length, 2, 'đường không tên không gộp chung giữa các cạnh khác nhau');
  assert.deepEqual(groupAlertsByRoad32([]), []);
});

test('expandHeatHistory32: đúng định dạng thì mở rộng theo chỉ số cạnh; sai NE, sai số mức hoặc chỉ số lạ thì từ chối', () => {
  const NE = 10;
  const json = { ne: NE, hours: 24, edges: [3, 7], levels: Array.from({ length: 48 }, (_, i) => i / 100) };
  const h = expandHeatHistory32(json, NE);
  assert.ok(h && h.hourly.length === 24 * NE);
  assert.equal(h.hourly[2 * NE + 3], Math.fround(json.levels[2 * 2 + 0]));
  assert.equal(h.hourly[2 * NE + 7], Math.fround(json.levels[2 * 2 + 1]));
  assert.equal(h.hourly[2 * NE + 0], 0);
  assert.deepEqual([...h.seen], Array(24).fill(1));
  assert.equal(expandHeatHistory32(json, NE + 1), null);
  assert.equal(expandHeatHistory32({ ...json, levels: json.levels.slice(1) }, NE), null);
  assert.equal(expandHeatHistory32({ ...json, edges: [3, 99] }, NE), null);
});

test('probOfLevel32 đơn điệu tăng; mức 0,7 ↔ xác suất 50 %', () => {
  assert.ok(Math.abs(probOfLevel32(0.7) - 0.5) < 1e-12);
  let prev = -1;
  for (let L = 0; L <= 1.0001; L += 0.05) { const p = probOfLevel32(L); assert.ok(p > prev); prev = p; }
});

test('đồng hồ: 16:00 lúc mở, +1 giờ = 17:00 giờ vàng, qua nửa đêm đổi ngày; nhãn thứ/ngày đúng', () => {
  const c0 = clockAt32(0);
  assert.equal(c0.label, '16:00');
  assert.equal(c0.dateLabel, 'Thứ Sáu, 16/10');
  assert.equal(c0.heatTime, 10 * 3600);
  const c1 = clockAt32(0, 3600);
  assert.equal(c1.label, '17:00');
  assert.equal(lightOf32(c1.hour), 'golden');
  const cn = clockAt32(0, 8 * 3600);
  assert.equal(cn.label, '00:00');
  assert.equal(cn.dateLabel, 'Thứ Bảy, 17/10');
  assert.equal(clockAt32(0, 30 * 60).label, '16:30');
  for (const [h, want] of [[5, 'night'], [6, 'day'], [16, 'day'], [17, 'golden'], [18, 'golden'], [19, 'night'], [23, 'night']]) assert.equal(lightOf32(h), want, `giờ ${h}`);
  assert.equal(DEMAND_BY_HOUR_32.length, 24);
  assert.ok(DEMAND_BY_HOUR_32.every(v => v > 0 && v <= 1));
  assert.equal(demandOfHour32(17), DEMAND_BY_HOUR_32[17]);
  assert.ok(demandOfHour32(3) < demandOfHour32(18));
});

test('heat-live: giờ của lịch sử theo đồng hồ (clockOf), không theo giây sim', () => {
  const sim = northSim('fixed');
  const live = createHeatLive32({ net, sim, clockOf: () => 17 * 3600 - 6 * 3600 });
  for (let k = 0; k < 30; k++) sim.step();
  live.tick();
  const hourly = live.hourly();
  const NE = net.NE;
  let inSeventeen = 0, inSixteen = 0;
  for (let e = 0; e < NE; e++) { if (hourly[17 * NE + e] > 0) inSeventeen++; if (hourly[16 * NE + e] > 0) inSixteen++; }
  assert.ok(inSeventeen > 0, 'giờ 17 phải có số liệu');
  assert.equal(inSixteen, 0, 'giờ 16 (giờ sim) không được ghi');
});

test('heat-live: nạp lịch sử và tua trước; từ chối kích thước sai; tua cũ quá 60 s sim thì không dùng', () => {
  const sim = northSim('fixed');
  const live = createHeatLive32({ net, sim });
  const NE = net.NE;
  assert.equal(live.loadHistory({ hourly: new Float32Array(5), seen: [1] }), false);
  assert.equal(live.loadHistory({ hourly: new Float32Array(24 * NE), seen: Array(24).fill(1) }), true);
  assert.equal(live.applyLookahead({ t0: 0, scale: 1, levels: { 10: new Float32Array(3), 20: new Float32Array(3), 30: new Float32Array(3) } }), false);
  const full = () => new Float32Array(NE).fill(0.95);
  assert.equal(live.applyLookahead({ t0: 0, scale: 1, levels: { 10: full(), 20: full(), 30: full() } }), true);
  live.tick();
  for (let k = 0; k < 300; k++) sim.step();     // 30 s sim → đến hạn dự báo, còn trong cửa sổ 60 s
  live.tick();
  assert.ok(live.alerts().length > 0, 'tua trước mức 0,95 phải sinh cảnh báo');
  assert.ok(live.alerts().every(a => a.prob >= 0.6));
  assert.equal(live.state().lookT0, 0);
  live.clearLookahead();
  assert.equal(live.state().lookT0, null);
});

test('KPI lưu lượng: flow_per_node_min = trung bình các nút điều khiển; flow_per_min vẫn là tổng toàn mạng', () => {
  const controller = createSignalController32({ net, sim: null, mode: 'smart' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED });
  sim.setRegion(north);
  for (let k = 0; k < 2000; k++) sim.step();    // 200 s sim
  const m = controller.metrics(sim.counters.t);
  const rows = m.by_node;
  assert.ok(rows.length >= 1);
  const mean = rows.reduce((a, r) => a + r.flow_per_min, 0) / rows.length;
  assert.ok(Math.abs(m.flow_per_node_min - Number(mean.toFixed(1))) <= 0.05, `flow_per_node_min=${m.flow_per_node_min} ≠ TB ${mean}`);
  assert.ok(Number.isFinite(m.flow_per_node_min) && m.flow_per_node_min >= 0 && m.flow_per_node_min <= 60);
  assert.ok(m.flow_per_min > m.flow_per_node_min, 'tổng toàn mạng phải lớn hơn TB mỗi nút');
});

function equivalenceCase(mode) {
  const main = northSim(mode);
  for (let k = 0; k < 300; k++) main.step();
  const state = structuredClone(main.exportState());
  const phases = structuredClone(main.controller.exportPhases());
  for (let k = 0; k < 600; k++) main.step();
  const runner = createLookaheadRunner32({ net });
  const res = runner.run({ state, phases, mode, horizonsMin: [1], avoid: [], budget10Ms: 1e9 });
  return { res, want: main.stateHash(), levelsOk: res.levels[1].length === net.NE && [...res.levels[1]].every(v => v >= 0 && v <= 1) };
}

test('tua trước (lõi Worker) khớp sim chính: chạy 60 s từ ảnh + pha đèn cho cùng hash (đèn cố định)', () => {
  const { res, want, levelsOk } = equivalenceCase('fixed');
  assert.equal(res.stateHash, want);
  assert.equal(res.scale, 1);
  assert.equal(res.scaled, false);
  assert.ok(levelsOk);
});

test('tua trước (lõi Worker) khớp sim chính ở chế độ thông minh (max-pressure)', () => {
  const { res, want, levelsOk } = equivalenceCase('smart');
  assert.equal(res.stateHash, want);
  assert.ok(levelsOk);
});

test('tua trước chậm (ngân sách rất nhỏ): giảm số xe theo tỉ lệ và ghi scale < 1', () => {
  const main = northSim('fixed');
  for (let k = 0; k < 100; k++) main.step();
  const state = structuredClone(main.exportState());
  const runner = createLookaheadRunner32({ net });
  const res = runner.run({ state, mode: 'fixed', horizonsMin: [12], budget10Ms: 0.001 });
  assert.equal(res.scaled, true);
  assert.ok(res.scale >= 0.1 && res.scale < 1, `scale=${res.scale}`);
  assert.equal(res.levels[12].length, net.NE);
});

test('collectBuffers32 gom đúng mọi ArrayBuffer, không trùng', () => {
  const a = new Float64Array(3), b = new Int32Array(2);
  const set = collectBuffers32({ x: a, y: [b, { z: a }], n: 4 });
  assert.equal(set.size, 2);
  assert.ok(set.has(a.buffer) && set.has(b.buffer));
});

test('đồng hồ (installClock32, không DOM): nhảy +1 giờ đổi nhóm ánh sáng và nhu cầu; không cần document', () => {
  let t = 0, fraction = null, light = 'day';
  const traffic = {
    sim: { counters: { get t() { return t; } } },
    setTimeScale() {}, setVisibleFraction(f) { fraction = f; }, fastForward() {}, ffRemaining: () => 0
  };
  const app = { root: null };
  const seen = [];
  const clock = installClock32(app, { traffic, setLight: k => { light = k; seen.push(k); }, getLight: () => light, doc: null, tickMs: 60000 });
  try {
    assert.equal(clock.clock().label, '16:00');
    assert.equal(fraction, DEMAND_BY_HOUR_32[16]);
    assert.equal(clock.jump('hop', 3600), true);
    assert.equal(clock.clock().label, '17:00');
    assert.equal(light, 'golden');
    assert.equal(fraction, DEMAND_BY_HOUR_32[17]);
    assert.equal(clock.heatTime(), 11 * 3600);
    clock.setSpeed(10);
    assert.equal(clock.speed(), 10);
  } finally { clock.dispose(); }
  assert.ok(seen.includes('golden'));
});
