// M4b2 — exportState/importState của sim 31A: tua trước (Web Worker) phải chạy tiếp ra đúng trạng thái như sim gốc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { regionTrafficPayload } from '../city-region-31.js?v=31a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
const north = regionTrafficPayload('bac');

// Đồng hồ dùng chung cho các kịch bản: đặt khu + tỉ lệ + hệ số ánh sáng, rồi chạy n bước.
function makeSim(opts = {}) {
  const sim = createTrafficSim31(net, { seed: SEED, ...opts });
  sim.setRegion(north);
  sim.setFraction(0.6);
  sim.setLightFactor(0.85);
  return sim;
}

test('export giữa chừng không đổi hành vi: sim có export và sim không export cho cùng hash', () => {
  const plain = makeSim(), exported = makeSim();
  for (let k = 0; k < 400; k++) {
    plain.step(); exported.step();
    if (k === 199) exported.exportState();
  }
  assert.equal(exported.stateHash(), plain.stateHash());
  assert.deepEqual(exported.stats(), plain.stats());
});

test('importState: bản sao chạy tiếp cho đúng stateHash của sim gốc (có khu Bắc, tỉ lệ 0,6, ánh sáng 0,85)', () => {
  const a = makeSim();
  for (let k = 0; k < 300; k++) a.step();
  const st = structuredClone(a.exportState());   // mô phỏng việc gửi qua postMessage
  const b = createTrafficSim31(net, { seed: SEED });
  b.importState(st);
  assert.equal(b.stateHash(), a.stateHash());
  for (let k = 0; k < 400; k++) {
    a.step(); b.step();
    if (k % 80 === 79) assert.equal(b.stateHash(), a.stateHash(), `lệch hash sau ${k + 1} bước`);
  }
  assert.equal(b.counters.t, a.counters.t);
  assert.equal(b.counters.edgeTransitions, a.counters.edgeTransitions);
  assert.equal(b.counters.respawns, a.counters.respawns);
  assert.equal(b.activeCount(), a.activeCount());
  assert.equal(b.eligibleCount(), a.eligibleCount());
});

test('importState sau khi đổi tỉ lệ/ánh sáng: vẫn khớp từng bước (không cần gọi lại setRegion/setFraction)', () => {
  const a = makeSim();
  for (let k = 0; k < 150; k++) a.step();
  a.setFraction(0.35);
  a.setLightFactor(0.5);
  for (let k = 0; k < 50; k++) a.step();
  const st = structuredClone(a.exportState());
  const b = createTrafficSim31(net, { seed: SEED });
  b.importState(st);
  assert.equal(b.fraction, 0.35);
  assert.equal(b.lightFactor, 0.5);
  for (let k = 0; k < 300; k++) { a.step(); b.step(); }
  assert.equal(b.stateHash(), a.stateHash());
});

test('importState từ chối trạng thái không khớp mạng (N/NL) hoặc định dạng lạ', () => {
  const a = makeSim();
  const st = structuredClone(a.exportState());
  const b = createTrafficSim31(net, { seed: SEED });
  assert.throws(() => b.importState({ ...st, N: st.N + 1 }), RangeError);
  assert.throws(() => b.importState({ ...st, format: 2 }), RangeError);
  assert.throws(() => b.importState(null), RangeError);
});

test('hash cổ điển 31A không đổi (không truyền gì, sau 300 bước): c05ce91e', () => {
  const plainNet = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
  const base = createTrafficSim31(plainNet);
  for (let k = 0; k < 300; k++) base.step();
  assert.equal(base.stateHash(), 'c05ce91e');
});
