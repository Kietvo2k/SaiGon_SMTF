import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createDelayTracker32, hxNodeIndices, PEAK_HANG_XANH_DEMAND } from '../../../scripts/a1-metric-32.mjs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

test('chỉ số mới: tính tay trên tình huống nhỏ (vàng chậm trong 150 m trước vạch)', () => {
  const fakeNet = { lanes: { to: [0, 1], length: [200, 200], st: [0, 1], edge: [0, 1] }, Rz: [10, 0] };
  const sim = { N: 1, active: new Uint8Array([1]), lane: new Int32Array([0]), s: new Float64Array([0]), v: new Float32Array([0]), gen: new Uint32Array([0]) };
  const tr = createDelayTracker32({ net: fakeNet, hxNodes: [0], approachM: 150, window: [0, 1000] });
  const frame = (t, sVal, vVal) => { sim.s[0] = sVal; sim.v[0] = vVal; tr.tick(t, sim); };
  frame(0.1, 30, 0);     // ngoài vùng (30 < 190−150=40) → không tính
  frame(0.2, 50, 0);     // trong vùng, chậm → +0,1
  frame(0.3, 60, 0);     // +0,1
  frame(0.4, 70, 0.5);   // chậm → +0,1
  frame(0.5, 80, 2.0);   // nhanh → không cộng
  frame(0.6, 195, 5.0);  // qua vạch (80 ≤ 190 < 195) → chốt độ trễ 0,3
  const r = tr.result();
  assert.equal(r.crossings, 1);
  assert.ok(Math.abs(r.delay_avg_s - 0.3) < 1e-9, `delay_avg_s=${r.delay_avg_s}`);
  // ngoài cửa sổ → không ghi
  const sim2 = { N: 1, active: new Uint8Array([1]), lane: new Int32Array([0]), s: new Float64Array([50]), v: new Float32Array([0]), gen: new Uint32Array([0]) };
  const tr2 = createDelayTracker32({ net: fakeNet, hxNodes: [0], approachM: 150, window: [10, 100] });
  for (const [t, sVal] of [[0.1, 50], [0.2, 60], [0.3, 195]]) { sim2.s[0] = sVal; tr2.tick(t, sim2); }
  assert.equal(tr2.result().crossings, 0);
});

test('chỉ số mới chạy trên sim thật: HX có vạch, đếm xe qua và độ trễ hữu hạn', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const sim = createTrafficSim31(net, { signalPlan, breakerS: Infinity, seed: SEED });
  const hx = hxNodeIndices(net, nodeMap);
  assert.equal(hx.length, 6);
  const tr = createDelayTracker32({ net, hxNodes: hx, window: [0, 600] });
  for (let k = 0; k < 3000; k++) { sim.step(); tr.tick(sim.counters.t, sim); }
  const r = tr.result();
  assert.ok(Number.isFinite(r.delay_avg_s) && r.delay_avg_s >= 0);
  assert.ok(Number.isInteger(r.crossings));
});

test('demand: không truyền = y nguyên (hash cổ điển c05ce91e); truyền demand → khác', () => {
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
  const base = createTrafficSim31(net);
  for (let k = 0; k < 300; k++) base.step();
  assert.equal(base.stateHash(), 'c05ce91e', 'hash cổ điển phải trùng giá trị trước T2b');
  const netB = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
  const noDemand = createTrafficSim31(netB, { demand: null });
  for (let k = 0; k < 300; k++) noDemand.step();
  assert.equal(noDemand.stateHash(), base.stateHash());
  const netC = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
  const withDemand = createTrafficSim31(netC, { demand: PEAK_HANG_XANH_DEMAND });
  for (let k = 0; k < 300; k++) withDemand.step();
  assert.notEqual(withDemand.stateHash(), base.stateHash(), 'demand phải đổi hành vi');
});
