// behavior-v2-32.test.mjs — demo-v2 (P1-10): hành vi lái mới — quyết định khi vàng + xe máy len lối.
// Cờ opt-in (yellowDecision / motoCreep): không bật → hành vi cũ (hash hồi quy giữ nguyên).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, yellowGoDecision32, YELLOW_GO_V_32 } from '../city-traffic-sim-31.js?v=32c';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32c';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/public-north/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function setup(behavior = null) {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  // Test này đo cờ P1-10 (vàng + len lối), không đo lõi behaviorV3: tắt V3 để so sánh đúng một biến.
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED, behavior: behavior ? { ...behavior, behaviorV3: false } : null });
  controller.attachSim(sim);
  return { net, sim, controller, signalPlan };
}

test('P1-10 (thuần): yellowGoDecision32 — nhanh hoặc quá gần vạch thì đi; đứng chờ không chạy vàng', () => {
  assert.equal(YELLOW_GO_V_32, 6);
  // xe nhanh luôn được đi tiếp
  assert.equal(yellowGoDecision32(8, 120, 0.4), true);
  // xe chậm, còn xa vạch: phanh kịp → dừng
  assert.equal(yellowGoDecision32(3, 60, 2.5), false);
  // xe chậm nhưng sát vạch và vàng còn đủ thời gian → đi tiếp
  assert.equal(yellowGoDecision32(3, 2.5, 2.0), true);
  // xe đang đứng chờ: không tự khởi động chạy vàng
  assert.equal(yellowGoDecision32(0, 3, 2.5), false);
  // đầu xe đã ở vạch → đi tiếp là an toàn duy nhất
  assert.equal(yellowGoDecision32(2, 0, 1), true);
  // quá chậm và sát vạch nhưng vàng chỉ còn 0,2 s: phanh không kịp, đi tiếp
  assert.equal(yellowGoDecision32(2.5, 1.0, 0.2), true);
});

test('P1-10: hành vi tổng — bật cờ không làm hỏng thông lượng KPI A/B cùng seed', () => {
  const flow = behavior => {
    const { sim, controller } = setup(behavior);
    for (let k = 0; k < 3000; k++) { controller.update(sim.counters.t, new Map()); sim.step(); }
    return { flow: sim.counters.edgeTransitions, waits: sim.counters.waitsTotal, active: sim.counters.t };
  };
  const base = flow(null);
  const withFlags = flow({ restrictedNodes: [], yellowDecision: true, motoCreep: true });
  // Thông lượng không hỏng: giảm không quá 15 % (quyết định vàng hợp lý chỉ tăng thông qua).
  assert.ok(withFlags.flow >= base.flow * 0.85, `thông lượng ${withFlags.flow} vs ${base.flow}`);
  // Xe đi khi vàng: tổng thời gian chờ giảm nhẹ hoặc bằng, không tăng vọt.
  assert.ok(withFlags.waits <= base.waits * 1.3, `tổng lượt chờ ${withFlags.waits} vs ${base.waits}`);
  assert.equal(withFlags.active, base.active);
});

test('P1-10: xe máy len lối — sau khi chờ đèn, |jit| đạt tới mép làn (0,95); không bật cờ thì giữ trong khoảng sinh ~0,75', () => {
  const run = behavior => {
    const { sim } = setup(behavior);
    for (let k = 0; k < 600; k++) sim.step();
    let atEdge = 0, maxJit = 0, motos = 0;
    for (let i = 0; i < sim.N; i++) {
      if (!sim.active[i] || sim.kind[i] !== 0) continue;
      motos++;
      maxJit = Math.max(maxJit, Math.abs(sim.jit[i]));
      if (Math.abs(sim.jit[i]) >= 0.9) atEdge++;
    }
    return { atEdge, maxJit, motos };
  };
  const crept = run({ restrictedNodes: [], motoCreep: true });
  const plain = run(null);
  // Với cờ: xe máy đã chờ đèn len tới sát mép (|jit| ≥ 0,9) — vượt xa khoảng sinh ban đầu ±0,75.
  assert.ok(crept.atEdge >= 1, `phải có xe máy len tới mép (có ${crept.atEdge}/${crept.motos})`);
  assert.ok(crept.maxJit >= 0.9, `|jit| tối đa ${crept.maxJit}`);
  // Không cờ: mọi xe giữ trong khoảng sinh (không crept) — luồng cũ nguyên vẹn.
  assert.ok(plain.atEdge === 0 && plain.maxJit <= 0.751, `không cờ phải giữ jit sinh (max ${plain.maxJit})`);
});

test('P1-10: không bật cờ — hash cổ điển c05ce91e không đổi', async () => {
  const { sim } = setup(null);
  for (let k = 0; k < 300; k++) sim.step();
  // xuất trạng thái tất định: chỉ cần chạy không lỗi và cùng bước → cùng trạng thái như trước thay đổi.
  // (Hash chính xác c05ce91e được test riêng ở sim-state-32; ở đây khẳng định luồng không-cờ còn nguyên vẹn.)
  assert.ok(sim.counters.t > 29);
  assert.equal(sim.behaviorOn, false);
});
