import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32, SIGNAL_PARAMS_32, CONTROLLER_32_VERSION } from '../traffic-controller-32.js?v=32a';

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

test('isGreen fixed khớp chu kỳ 48 s (xanh 22/16, vàng 3, đỏ chung 2)', () => {
  const { net, controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const stOf = (() => {
    for (let s = 0; s < net.lanes.st.length; s++) {
      const e = net.lanes.st[s] >> 1, dir = net.lanes.st[s] & 1 ? -1 : 1;
      const to = dir > 0 ? net.E[e].to : net.E[e].from;
      if (net.G.nodes[node].id === to) return net.lanes.st[s];   // ST CODE, không phải chỉ số làn
    }
    return -1;
  })();
  assert.ok(stOf >= 0);
  assert.equal(controller.isGreen(node, stOf, 0), true);           // g0 xanh
  assert.equal(controller.isGreen(node, stOf, 21.9), true);
  assert.equal(controller.isGreen(node, stOf, 22), false);          // g0 vàng
  assert.equal(controller.isGreen(node, stOf, 25.5), false);        // đỏ chung
  const stOther = (() => {
    for (let s = 0; s < net.lanes.st.length; s++) {
      const e = net.lanes.st[s] >> 1, dir = net.lanes.st[s] & 1 ? -1 : 1;
      const to = dir > 0 ? net.E[e].to : net.E[e].from;
      if (net.G.nodes[node].id === to && net.arriveGroup[net.lanes.st[s]] === 1) return net.lanes.st[s];
    }
    return -1;
  })();
  if (stOther >= 0) {
    assert.equal(controller.isGreen(node, stOther, 0), false);      // nhóm 1 đỏ khi g0 xanh
    assert.equal(controller.isGreen(node, stOther, 27), true);      // g1 xanh (22+3+2)
    assert.equal(controller.isGreen(node, stOther, 42.9), true);    // 22+3+2+16 = 43 hết xanh
    assert.equal(controller.isGreen(node, stOther, 43), false);
  }
  assert.equal(controller.stateOf(node, 0).cycle_s, 48);
  assert.equal(controller.cycleIdOf(node, 0), 0);
  assert.equal(controller.cycleIdOf(node, 48), 1);
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
  const node = signalPlan.signalNodes[0];
  const st0 = (() => { for (let s = 0; s < net.lanes.st.length; s++) if (net.arriveGroup[s] === 0) { const e = net.lanes.st[s] >> 1, dir = net.lanes.st[s] & 1 ? -1 : 1; const to = dir > 0 ? net.E[e].to : net.E[e].from; if (to === net.G.nodes[node].id) return s; } return -1; })();
  const st1 = (() => { for (let s = 0; s < net.lanes.st.length; s++) if (net.arriveGroup[s] === 1) { const e = net.lanes.st[s] >> 1, dir = net.lanes.st[s] & 1 ? -1 : 1; const to = dir > 0 ? net.E[e].to : net.E[e].from; if (to === net.G.nodes[node].id) return s; } return -1; })();
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

test('overridePhase: giữ nhóm xanh, có until_t_sim + until_at; null để hủy', () => {
  const { controller, signalPlan } = setup({ withSim: false });
  const node = signalPlan.signalNodes[0];
  const r = controller.overridePhase(node, 1, 60, 'officer1', 'ưu tiên xe cứu thương');
  assert.equal(r.ok, true);
  assert.equal(typeof r.until_t_sim, 'number');
  assert.match(r.until_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const st = controller.stateOf(node, 0);
  assert.equal(st.override.group, 1);
  assert.equal(controller.stateOf(node, 0).phases.find(p => p.group === 1).phase, 'green');
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
  const node = signalPlan.signalNodes[0];
  const pick = g => { for (let s = 0; s < net.lanes.st.length; s++) if (net.arriveGroup[s] === g) { const e = net.lanes.st[s] >> 1, dir = net.lanes.st[s] & 1 ? -1 : 1; const to = dir > 0 ? net.E[e].to : net.E[e].from; if (to === net.G.nodes[node].id) return s; } return -1; };
  const rows = new Map([[node, [
    { st: pick(0), group: 0, count: 1, wait_sum_s: 0, wait_max_s: 0, speed_mean: 5, crossed: 0, q_out: 0 },
    { st: pick(1), group: 1, count: 20, wait_sum_s: 40, wait_max_s: 3, speed_mean: 0, crossed: 0, q_out: 20 }
  ]]]);
  for (let t = 0; t <= 20; t += 1) controller.update(t, rows);
  assert.equal(controller.stateOf(node, 20).phases.find(p => p.group === 0).phase, 'green');
});
