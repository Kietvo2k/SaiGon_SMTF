import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

test('không tham số mới: hành vi 31A y nguyên (signal 86 nút, breaker 50 s, hash ổn định)', () => {
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn });
  const sim = createTrafficSim31(net);
  let signals = 0;
  for (let n = 0; n < net.signal.length; n++) signals += net.signal[n];
  assert.equal(signals, net.stats.signals);
  assert.equal(sim.controller, null);
  const h1 = sim.stateHash();
  const sim2 = createTrafficSim31(buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn }));
  assert.equal(sim2.stateHash(), h1);
});

test('signalPlan: 6 nút HX có đèn; net.signal khớp signalNodes', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  for (const n of signalPlan.signalNodes) assert.equal(net.signal[n], 1);
  assert.equal(signalPlan.signalNodes.length, 6);
});

test('controller được attach: api sim có controller/signalGroups; update mỗi bước không ném lỗi', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  assert.equal(sim.controller, controller);
  assert.equal(sim.signalGroups.length, 5);
  for (let k = 0; k < 200; k++) sim.step();
  assert.ok(sim.counters.t > 19);
  assert.match(controller.stateHash(), /^[0-9a-f]{8}$/);
});

test('attachController sau khi tạo sim (gọi trước bước đầu) hoạt động', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const sim = createTrafficSim31(net, { signalPlan, breakerS: Infinity });
  const controller = createSignalController32({ net, sim, mode: 'smart' });
  sim.attachController(controller);
  for (let k = 0; k < 50; k++) sim.step();
  assert.equal(sim.controller, controller);
});

test('breakerS: Infinity thì không có breakerRespawns; 50 thì có khi sim dài', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const netA = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const simA = createTrafficSim31(netA, { signalPlan, breakerS: Infinity, seed: SEED });
  for (let k = 0; k < 6000; k++) simA.step();
  assert.equal(simA.stats().breakerRespawns, 0);
  const netB = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const simB = createTrafficSim31(netB, { signalPlan, breakerS: 50, seed: SEED });
  for (let k = 0; k < 6000; k++) simB.step();
  assert.ok(simB.stats().breakerRespawns > 0);
});

test('seed khác nhau → stateHash khác nhau; cùng seed → trùng nhau', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const mk = seed => {
    const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
    return createTrafficSim31(net, { signalPlan, breakerS: Infinity, seed });
  };
  const a = mk(31031), b = mk(31031), c = mk(31032);
  for (let k = 0; k < 300; k++) { a.step(); b.step(); c.step(); }
  assert.equal(a.stateHash(), b.stateHash());
  assert.notEqual(a.stateHash(), c.stateHash());
});

test('controller.update chạy trong chuỗi beginStep/workStep/finishStep: nhóm 1 có xanh trong 60 s', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  const node = signalPlan.signalNodes[0];
  let sawGroup1Green = false;
  for (let k = 0; k < 600; k++) {
    sim.beginStep(); sim.workStep(Infinity); sim.finishStep();
    if (controller.stateOf(node, sim.counters.t).phases.find(p => p.group === 1).phase === 'green') sawGroup1Green = true;
  }
  assert.ok(sim.counters.t >= 59.9, `t=${sim.counters.t}`);
  assert.ok(sawGroup1Green, 'nhóm 1 phải có lúc xanh trong 60 s');
});

test('nút 31A có đèn ngoài plan không do controller quản (giữ đèn 31A)', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const planSet = new Set(signalPlan.signalNodes);
  const outside = [];
  for (let n = 0; n < net.signal.length; n++) if (net.signal[n] && !planSet.has(n)) outside.push(n);
  assert.ok(outside.length >= 1, 'cần ≥ 1 nút đèn 31A ngoài plan');
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  for (let k = 0; k < 1200; k++) sim.step();
  assert.ok(sim.stats().edgeTransitions > 0, 'giao thông vẫn chảy qua nút 31A ngoài plan khi có controller');
});

test('buildQueues: q_out lấy từ làn RA (25 m đầu), không phải làn vào', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  const realUpdate = controller.update;
  let sawOutRow = false, sawInRowWithQout = false;
  controller.update = (t, queues) => {
    if (queues instanceof Map) for (const [, rows] of queues) for (const r of rows) {
      if (r.st === -1 && r.count === 0 && (r.q_out || 0) > 0) sawOutRow = true;
      if (r.st !== -1 && (r.q_out || 0) > 0) sawInRowWithQout = true;
    }
    return realUpdate(t, queues);
  };
  for (let k = 0; k < 400; k++) sim.step();
  assert.ok(sawOutRow, 'phải có dòng làn RA (count 0, q_out > 0)');
  assert.ok(!sawInRowWithQout, 'dòng làn vào không được gán q_out');
});

test('isGreen qua beginStep/workStep/finishStep khớp stateOf (HX-02 có cả hai nhóm)', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  const node = signalPlan.signalNodes[1];
  const pick = g => { for (let l = 0; l < net.lanes.to.length; l++) if (net.lanes.to[l] === node && net.arriveGroup[net.lanes.st[l]] === g) return net.lanes.st[l]; return -1; };
  const st0 = pick(0), st1 = pick(1);
  assert.ok(st0 >= 0 && st1 >= 0);
  let mismatch = 0;
  for (let k = 0; k < 600; k++) {
    sim.beginStep(); sim.workStep(Infinity); sim.finishStep();
    const t = sim.counters.t, ph = controller.stateOf(node, t).phases;
    if (controller.isGreen(node, st0, t) !== (ph.find(p => p.group === 0).phase === 'green')) mismatch++;
    if (controller.isGreen(node, st1, t) !== (ph.find(p => p.group === 1).phase === 'green')) mismatch++;
  }
  assert.equal(mismatch, 0, 'isGreen phải khớp stateOf qua chuỗi beginStep/workStep/finishStep');
});
