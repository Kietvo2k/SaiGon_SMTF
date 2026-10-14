import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32, SIGNAL_PARAMS_32, CONTROLLER_32_VERSION, CYCLE_MAX_PRESSURE_32, cycleMaxPressureSplit32 } from '../traffic-controller-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function setup({ mode = 'fixed', params = {}, redRun = null, withSim = true } = {}) {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode, params, redRun });
  const sim = withSim ? createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED }) : null;
  return { net, sim, controller, signalPlan };
}

test('phiên bản + tham số mặc định đúng hợp đồng', () => {
  assert.equal(CONTROLLER_32_VERSION, 'controller-32a');
  assert.equal(SIGNAL_PARAMS_32.yellowS, 3);
  assert.equal(SIGNAL_PARAMS_32.allRedS, 2);
  assert.equal(SIGNAL_PARAMS_32.fixed.green0S, 22);
  assert.equal(SIGNAL_PARAMS_32.fixed.green1S, 16);
  assert.equal(SIGNAL_PARAMS_32.clusterM, 80);
});

test('isGreen fixed khớp chu kỳ 48 s (xanh 22/16, vàng 3, đỏ chung 2) và khớp stateOf 100 % bước', () => {
  const { net, controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[1];   // HX-02: có làn vào cả hai nhóm pha
  const stOf = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const st0 = stOf(0), st1 = stOf(1);
  assert.ok(st0 >= 0 && st1 >= 0, 'HX-02 phải có làn vào cả hai nhóm');
  assert.equal(controller.isGreen(node, st0, 0), true);           // g0 xanh
  assert.equal(controller.isGreen(node, st0, 21.9), true);
  assert.equal(controller.isGreen(node, st0, 22), false);          // g0 vàng
  assert.equal(controller.isGreen(node, st0, 25.5), false);        // đỏ chung
  assert.equal(controller.isGreen(node, st1, 0), false);           // nhóm 1 đỏ khi g0 xanh
  assert.equal(controller.isGreen(node, st1, 27), true);           // g1 xanh (22+3+2)
  assert.equal(controller.isGreen(node, st1, 42.9), true);         // 22+3+2+16 = 43 hết xanh
  assert.equal(controller.isGreen(node, st1, 43), false);
  assert.equal(controller.stateOf(node, 0).cycle_s, 48);
  // 480 s (bước nguyên): tỉ lệ xanh + isGreen khớp stateOf 100 %
  let n0 = 0, n1 = 0, steps = 0, mismatch = 0;
  for (let k = 0; k <= 4800; k++) {
    const t = k * 0.1;
    controller.update(t, new Map());
    const ph = controller.stateOf(node, t).phases;
    const g0 = controller.isGreen(node, st0, t), g1 = controller.isGreen(node, st1, t);
    if (g0 !== (ph.find(p => p.group === 0).phase === 'green')) mismatch++;
    if (g1 !== (ph.find(p => p.group === 1).phase === 'green')) mismatch++;
    if (g0) n0++; if (g1) n1++; steps++;
  }
  assert.equal(mismatch, 0, 'isGreen phải khớp stateOf mọi bước');
  assert.ok(Math.abs(n0 / steps - 22 / 48) < 0.02, `nhóm 0 xanh ${(n0 / steps * 100).toFixed(1)} %`);
  assert.ok(Math.abs(n1 / steps - 16 / 48) < 0.02, `nhóm 1 xanh ${(n1 / steps * 100).toFixed(1)} %`);
});

test('SignalState có phases[].countdown_s, override null ban đầu', () => {
  const { net, controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const s0 = controller.stateOf(node, 0);
  assert.equal(s0.node_id, 'HX-01');
  assert.equal(s0.mode, 'fixed');
  assert.equal(s0.override, null);
  assert.equal(s0.phases.length, 2);
  for (const p of s0.phases) assert.equal(typeof p.countdown_s, 'number');
  assert.equal(s0.phases.find(p => p.group === 0).phase, 'green');
});

test('max-pressure đổi pha đúng ngưỡng switchMargin; giữ pha khi chênh < margin', () => {
  const { net, controller, signalPlan } = setup({ mode: 'smart', withSim: false });
  const node = signalPlan.signalNodes[1];   // HX-02: có làn vào cả hai nhóm
  const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const st0 = pick(0), st1 = pick(1);
  assert.ok(st0 >= 0 && st1 >= 0);
  const q = (rows) => new Map([[node, rows]]);
  // minGreenS = 8: giữ xanh với t ≤ 7 dù nhóm 1 đông hơn.
  for (let t = 0; t <= 7; t += 1) {
    controller.update(t, q([{ st: st0, group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
                           { st: st1, group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0 }]));
    assert.equal(controller.stateOf(node, t).phases.find(p => p.group === 0).phase, 'green', `t=${t}`);
  }
  // Sau minGreen, áp lực nhóm 1 vượt switchMargin → chuyển pha trong 8–20 s.
  let switchedAt = -1;
  for (let t = 8; t <= 20; t += 1) {
    controller.update(t, q([{ st: st0, group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
                           { st: st1, group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0 }]));
    if (controller.stateOf(node, t).phases.find(p => p.group === 0).phase !== 'green') { switchedAt = t; break; }
  }
  assert.ok(switchedAt >= 8 && switchedAt <= 20, `đổi pha tại t=${switchedAt}`);
});

test('switchMargin được nối vào quyết định: margin nhỏ đổi pha, margin lớn giữ', () => {
  const run = (switchMargin) => {
    const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
    const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
    const controller = createSignalController32({ net, sim: null, mode: 'smart', params: { switchMargin } });
    const node = signalPlan.signalNodes[1];   // HX-02
    const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
    const rows = new Map([[node, [
      { st: pick(0), group: 0, count: 10, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
      { st: pick(1), group: 1, count: 12, wait_sum_s: 24, wait_max_s: 2, speed_mean: 0, crossed: 0 }
    ]]]);
    const seq = [];
    for (let t = 0; t <= 12; t += 1) { controller.update(t, rows); seq.push(controller.stateOf(node, t).phases.find(p => p.group === 0).phase); }
    return seq;
  };
  const small = run(0.05);   // chênh 2/22 ≈ 0,09 ≥ 0,05 → đổi ngay sau minGreen
  const big = run(0.5);      // chênh 0,09 < 0,5 → giữ pha tới maxGreen
  assert.notDeepEqual(small, big, 'hai switchMargin phải cho chuỗi pha khác nhau');
  assert.equal(big[12], 'green', 'margin lớn giữ pha');
  assert.notEqual(small[12], 'green', 'margin nhỏ đã đổi pha');
});

test('overridePhase: đổi nhóm đi qua vàng 3 s + đỏ chung 2 s; có until_t_sim + until_at; null để hủy', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const r = controller.overridePhase(node, 1, 60, 'officer1', 'ưu tiên xe cứu thương');
  assert.equal(r.ok, true);
  assert.equal(typeof r.until_t_sim, 'number');
  assert.match(r.until_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const st0 = controller.stateOf(node, 0);
  assert.equal(st0.override.group, 1);
  // Ghi đè KHÔNG nhảy tức thì: nhóm 0 đang xanh → vàng ngay, nhóm 1 chưa xanh.
  assert.equal(st0.phases.find(p => p.group === 0).phase, 'yellow');
  assert.equal(st0.phases.find(p => p.group === 1).phase, 'red');
  // Qua đỏ chung rồi nhóm 1 mới xanh (~5 s = vàng 3 + đỏ chung 2).
  let sawAllRed = false, g1GreenAt = -1;
  for (let k = 1; k <= 70; k++) {
    const t = k * 0.1;
    controller.update(t, new Map());
    const p0 = controller.stateOf(node, t).phases.find(p => p.group === 0).phase;
    const p1 = controller.stateOf(node, t).phases.find(p => p.group === 1).phase;
    if (p0 === 'red' && p1 === 'red') sawAllRed = true;
    if (p1 === 'green') { g1GreenAt = t; break; }
  }
  assert.ok(sawAllRed, 'phải đi qua đỏ chung');
  assert.ok(g1GreenAt >= 4.9 && g1GreenAt <= 5.2, `nhóm 1 xanh tại t=${g1GreenAt}`);
  const c = controller.overridePhase(node, null, 0, 'officer1', 'hủy');
  assert.equal(c.ok, true);
  assert.equal(controller.stateOf(node, 0).override, null);
});

test('setMode giữa chừng áp dụng từ lần đổi pha kế (trừ immediate); không reset tSim', () => {
  const { controller, signalPlan } = setup({ mode: 'fixed', withSim: false });
  const node = signalPlan.signalNodes[0];
  controller.update(5, new Map());
  controller.setMode('smart');
  assert.equal(controller.getMode(), 'smart');
  assert.equal(controller.stateOf(node, 5).phases.find(p => p.group === 0).phase, 'green');
  controller.setMode('fixed', { immediate: true });
  assert.equal(controller.getMode(), 'fixed');
});

test('metrics là superset đủ trường; stateHash tất định, đổi khi đổi override', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const rows = new Map([[node, [{ st: 0, group: 0, count: 3, wait_sum_s: 9, wait_max_s: 4, speed_mean: 0, crossed: 2 }]]]);
  for (let t = 0; t <= 61; t += 1) controller.update(t, rows);
  const m = controller.metrics(61);
  for (const k of ['window_s', 'wait_avg_s', 'wait_p95_s', 'queue_max', 'queue_avg', 'flow_per_min', 'mode', 'overrides', 'by_node']) assert.ok(k in m, `thiếu ${k}`);
  assert.equal(m.window_s, 60);
  assert.ok(m.by_node.length >= 1);
  for (const k of ['node_id', 'cluster_id', 'wait_avg_s', 'queue_max', 'flow_per_min', 'switches_per_hour']) assert.ok(k in m.by_node[0], `by_node thiếu ${k}`);
  const h1 = controller.stateHash();
  const h2 = controller.stateHash();
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{8}$/);
  controller.overridePhase(node, 0, 30, 'officer1', 'test');
  assert.notEqual(controller.stateHash(), h1);
});

test('runsRed: redRun quyết định xe chủ động vượt; mặc định false', () => {
  const { controller, signalPlan } = setup({ withSim: false, redRun: (i, node, st, t) => i === 7 && t < 50 });
  const node = signalPlan.signalNodes[0];
  assert.equal(controller.runsRed(7, node, 0, 10), true);
  assert.equal(controller.runsRed(8, node, 0, 10), false);
  const plain = setup({ withSim: false }).controller;
  assert.equal(plain.runsRed(7, node, 0, 10), false);
});

test('6 nút có node_id HX-01…HX-06, chỉ HX-01/HX-05 chung cụm HX-C1; metrics by_node khóa HX', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const sN = signalPlan.signalNodes;
  assert.deepEqual(sN.map(n => controller.stateOf(n, 0).node_id), ['HX-01', 'HX-02', 'HX-03', 'HX-04', 'HX-05', 'HX-06']);
  const cl = sN.map(n => controller.stateOf(n, 0).cluster_id);
  assert.equal(cl[0], 'HX-C1');
  assert.equal(cl[4], 'HX-C1');
  assert.equal(new Set([cl[1], cl[2], cl[3], cl[5]]).size, 4);
  controller.update(0, new Map());
  assert.deepEqual(controller.metrics(0).by_node.map(r => r.node_id).sort(), ['HX-01', 'HX-02', 'HX-03', 'HX-04', 'HX-05', 'HX-06']);
});

test('áp lực trừ q_out: hàng chờ bị làn ra triệt tiêu thì không đổi pha', () => {
  const { net, controller, signalPlan } = setup({ mode: 'smart', withSim: false });
  const node = signalPlan.signalNodes[1];   // HX-02: có làn vào cả hai nhóm
  const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const rows = new Map([[node, [
    { st: pick(0), group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0, q_out: 0 },
    { st: pick(1), group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0, q_out: 20 }
  ]]]);
  for (let t = 0; t <= 20; t += 1) controller.update(t, rows);
  assert.equal(controller.stateOf(node, 20).phases.find(p => p.group === 0).phase, 'green');
});

test('smart: áp lực cân bằng giữ pha, isGreen xanh tới maxGreen 45 s rồi mới đổi', () => {
  const { net, controller, signalPlan } = setup({ mode: 'smart', withSim: false });
  const node = signalPlan.signalNodes[1];
  const st0 = (() => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === 0) return net.lanes.st[l]; return -1; })();
  const st1 = (() => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === 1) return net.lanes.st[l]; return -1; })();
  const rows = new Map([[node, [
    { st: st0, group: 0, count: 5, wait_sum_s: 10, wait_max_s: 2, speed_mean: 1, crossed: 0 },
    { st: st1, group: 1, count: 5, wait_sum_s: 10, wait_max_s: 2, speed_mean: 1, crossed: 0 }
  ]]]);
  let lastGreenT = -1, switchedAt = -1;
  for (let k = 0; k <= 600; k++) {
    const t = k * 0.1;
    controller.update(t, rows);
    const g = controller.isGreen(node, st0, t);
    if (g) lastGreenT = t;
    else if (switchedAt < 0 && t > 1) switchedAt = t;
  }
  assert.ok(lastGreenT >= 44.9, `nhóm 0 xanh tới ${lastGreenT}`);
  assert.ok(switchedAt >= 45 && switchedAt <= 45.5, `đổi pha tại ${switchedAt}`);
});

test('cycleIdOf = floor((t − origin)/48): t=96→2, t=120→2', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];   // HX-01 offset 0
  assert.equal(controller.cycleIdOf(node, 0), 0);
  assert.equal(controller.cycleIdOf(node, 48), 1);
  assert.equal(controller.cycleIdOf(node, 96), 2);
  assert.equal(controller.cycleIdOf(node, 120), 2);
});

test('flow_per_min cộng dồn crossed mỗi bước rồi lấy mẫu 1 s (không chỉ bước trùng mốc)', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const rows = new Map([[node, [{ st: 0, group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 1 }]]]);
  for (let k = 1; k <= 1200; k++) controller.update(k * 0.1, rows);   // 120 s, 1 sự kiện/0,1 s
  const row = controller.metrics(120).by_node.find(r => r.node_id === 'HX-01');
  assert.ok(row.flow_per_min >= 599 && row.flow_per_min <= 601, `flow=${row.flow_per_min} (kỳ vọng 600)`);
});

test('wait_avg dùng mẫu số Σcount (dòng count=0 không kéo lệch trung bình)', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const rows = new Map([[node, [
    { st: -1, group: 0, count: 0, wait_sum_s: 0, wait_max_s: 0, speed_mean: 0, crossed: 0, q_out: 3 },
    { st: 1, group: 0, count: 5, wait_sum_s: 10, wait_max_s: 3, speed_mean: 0, crossed: 0 }
  ]]]);
  for (let k = 1; k <= 61; k++) controller.update(k, rows);
  assert.equal(controller.metrics(61).wait_avg_s, 2);   // 10/5, không phải 10/6
});

test('reset(): đưa pha về gốc (nhóm 0 xanh) và xóa ghi đè', () => {
  const { net, sim, controller, signalPlan } = setup({ mode: 'fixed' });
  const node = signalPlan.signalNodes[0];
  for (let k = 0; k < 300; k++) sim.step();   // 30 s → nhóm 0 đã hết xanh
  assert.notEqual(controller.stateOf(node, sim.counters.t).phases.find(p => p.group === 0).phase, 'green');
  sim.reset();
  assert.equal(sim.counters.t, 0);
  assert.equal(controller.stateOf(node, 0).phases.find(p => p.group === 0).phase, 'green');
});

test('stateOf nút 31A ngoài kế hoạch: cụm 31A-n, chu kỳ 44 s (không rơi vào HX-C1)', () => {
  const { net, controller, signalPlan } = setup({ withSim: false });
  const planSet = new Set(signalPlan.signalNodes);
  let outside = -1;
  for (let n = 0; n < net.signal.length; n++) if (net.signal[n] && !planSet.has(n)) { outside = n; break; }
  assert.ok(outside >= 0, 'cần ≥ 1 nút đèn 31A ngoài kế hoạch');
  const st = controller.stateOf(outside, 0);
  assert.equal(st.cycle_s, 44);
  assert.equal(st.cluster_id, `31A-${outside}`);
  assert.notEqual(st.cluster_id, 'HX-C1');
});

test('algorithm mặc định max-pressure; actuated-gap giữ xanh khi còn xe tới, khác max-pressure', () => {
  assert.equal(SIGNAL_PARAMS_32.algorithm, 'max-pressure');
  const seq = (algorithm) => {
    const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
    const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
    const controller = createSignalController32({ net, sim: null, mode: 'smart', params: { algorithm } });
    const node = signalPlan.signalNodes[1];
    const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
    const rows = new Map([[node, [
      { st: pick(0), group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
      { st: pick(1), group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0 }
    ]]]);
    const out = [];
    for (let t = 0; t <= 20; t += 1) { controller.update(t, rows); out.push(controller.stateOf(node, t).phases.find(p => p.group === 0).phase); }
    return out;
  };
  const mp = seq('max-pressure');
  const gap = seq('actuated-gap');
  assert.notDeepEqual(mp, gap, 'actuated-gap phải khác max-pressure');
  assert.notEqual(mp[20], 'green', 'max-pressure đã đổi pha');
  assert.equal(gap[20], 'green', 'actuated-gap giữ xanh khi còn xe tới trong khe');
});

test('D cycle-max-pressure: chia 38 s tỉ lệ áp lực, kẹp [10,28], EMA α=0,5; 0 áp lực → 19/19', () => {
  const eq = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(CYCLE_MAX_PRESSURE_32.cycleS, 48);
  assert.equal(CYCLE_MAX_PRESSURE_32.greenTotalS, 38);
  assert.deepEqual([CYCLE_MAX_PRESSURE_32.greenMinS, CYCLE_MAX_PRESSURE_32.greenMaxS], [10, 28]);
  assert.equal(CYCLE_MAX_PRESSURE_32.emaAlpha, 0.5);
  let r = cycleMaxPressureSplit32(null, [3, 7]);
  assert.ok(eq(r.green0S, 11.4) && eq(r.green1S, 26.6), `tỉ lệ: ${r.green0S}/${r.green1S}`);
  assert.deepEqual(r.ema, [3, 7]);
  r = cycleMaxPressureSplit32(null, [100, 1]);   // kẹp trên
  assert.ok(eq(r.green0S, 28) && eq(r.green1S, 10), `kẹp trên: ${r.green0S}/${r.green1S}`);
  r = cycleMaxPressureSplit32(null, [1, 100]);   // kẹp dưới
  assert.ok(eq(r.green0S, 10) && eq(r.green1S, 28), `kẹp dưới: ${r.green0S}/${r.green1S}`);
  const e1 = cycleMaxPressureSplit32(null, [20, 0]);      // chu kỳ 1: ema = đo được
  assert.deepEqual(e1.ema, [20, 0]);
  const e2 = cycleMaxPressureSplit32(e1.ema, [0, 20]);    // chu kỳ 2: α=0,5 → (10,10)
  assert.ok(eq(e2.ema[0], 10) && eq(e2.ema[1], 10), `EMA: ${e2.ema}`);
  assert.ok(eq(e2.green0S, 19) && eq(e2.green1S, 19));
  r = cycleMaxPressureSplit32(null, [0, 0]);     // không áp lực → chia đều
  assert.ok(eq(r.green0S, 19) && eq(r.green1S, 19));
});

test('D cycle-max-pressure: chu kỳ 48 s, mặc định g0=19/g1=19, đúng 2 lần chuyển nhóm mỗi chu kỳ', () => {
  const { controller, signalPlan } = setup({ mode: 'smart', params: { algorithm: 'cycle-max-pressure' }, withSim: false });
  const node = signalPlan.signalNodes[1];
  const phase = (t, g) => controller.stateOf(node, t).phases.find(p => p.group === g).phase;
  assert.equal(controller.stateOf(node, 0).cycle_s, 48);
  assert.ok(Math.abs(controller.stateOf(node, 0).phases.find(p => p.group === 0).countdown_s - 19) < 1e-6,
    `xanh g0 mặc định 19 s, nhận ${controller.stateOf(node, 0).phases.find(p => p.group === 0).countdown_s}`);
  let changes = 0, prevGroup = 0;
  for (let k = 1; k <= 960; k++) {   // 96 s = 2 chu kỳ
    const t = k * 0.1;
    controller.update(t, new Map());
    const cur = phase(t, 0) === 'green' ? 0 : (phase(t, 1) === 'green' ? 1 : prevGroup);
    if (cur !== prevGroup) { changes++; prevGroup = cur; }
  }
  assert.equal(changes, 4, `2 lần chuyển nhóm/chu kỳ × 2 chu kỳ = 4, nhận ${changes}`);
});

test('E max-pressure-abs: chỉ chuyển khi (áp lực nhóm kia − nhóm hiện tại) ≥ switchAbs', () => {
  const roll = (switchAbs) => {
    const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
    const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
    const controller = createSignalController32({ net, sim: null, mode: 'smart',
      params: { algorithm: 'max-pressure-abs', switchAbs, minGreenS: 10, maxGreenS: 300, maxRedS: 1000 } });
    const node = signalPlan.signalNodes[1];
    const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
    const rows = new Map([[node, [
      { st: pick(0), group: 0, count: 10, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
      { st: pick(1), group: 1, count: 12, wait_sum_s: 24, wait_max_s: 2, speed_mean: 0, crossed: 0 }
    ]]]);
    let switchedAt = -1;
    for (let t = 0; t <= 60; t += 1) {
      controller.update(t, rows);
      if (controller.stateOf(node, t).phases.find(p => p.group === 0).phase !== 'green') { switchedAt = t; break; }
    }
    return switchedAt;
  };
  assert.equal(roll(3), -1, 'chênh 2 < switchAbs 3 → giữ pha');
  assert.equal(roll(2), 10, 'chênh 2 ≥ switchAbs 2 → đổi đúng tại minGreenS = 10');
});

test('E max-pressure-abs: chống đói — nhóm đỏ liên tục ≥ maxRedS được phục vụ dù áp lực thấp hơn', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'smart',
    params: { algorithm: 'max-pressure-abs', switchAbs: 100, minGreenS: 10, maxGreenS: 300, maxRedS: 40 } });
  const node = signalPlan.signalNodes[1];
  const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const rows = new Map([[node, [
    { st: pick(0), group: 0, count: 20, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
    { st: pick(1), group: 1, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 }
  ]]]);
  let g1GreenAt = -1;
  for (let k = 0; k <= 600; k++) {
    const t = k * 0.1;
    controller.update(t, rows);
    if (controller.stateOf(node, t).phases.find(p => p.group === 1).phase === 'green') { g1GreenAt = t; break; }
  }
  // Bắt đầu nhường tại t≈40 (maxRedS), qua vàng 3 + đỏ chung 2 → nhóm 1 xanh ở t≈45.
  assert.ok(g1GreenAt >= 44.9 && g1GreenAt <= 45.5, `nhóm 1 được phục vụ tại t≈45 (40 + vàng 3 + đỏ chung 2), nhận ${g1GreenAt}`);
});

test('max-pressure-150: áp lực 150 m theo nhóm đổi pha; khác actuated-gap', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'smart', params: { algorithm: 'max-pressure-150' } });
  const node = signalPlan.signalNodes[1];
  const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const rows = new Map([[node, [
    { st: pick(0), group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0 },
    { st: pick(1), group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0 }
  ]]]);
  let switchedAt = -1;
  for (let t = 0; t <= 20; t += 1) {
    controller.update(t, rows);
    if (switchedAt < 0 && t >= 8 && controller.stateOf(node, t).phases.find(p => p.group === 0).phase !== 'green') switchedAt = t;
  }
  assert.ok(switchedAt >= 8 && switchedAt <= 20, `đổi pha tại t=${switchedAt}`);
});
