// M5b-1: luật vi phạm (perception trên mạng tổng hợp nhỏ, tất định) + hành vi sim (lane/rẽ/đỗ/đèn) + phạt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, TRAFFIC_KINDS } from '../city-traffic-sim-31.js?v=32a';
import { createPerception32, inFrame32 } from '../violation-perception-32.js?v=32a';
import { violatorOf32, redViolatorOf32, penaltyOf32, ALL_CODES_32, BEHAVIOR_CODES_32, TRAIT_CODES_32,
  RED_RATE_32, CODE_LABEL_32, restrictedNodeIndices32, RESTRICTED_NODE_IDS_32 } from '../violation-rules-32.js?v=32a';
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

// ---------- mạng tổng hợp: 3 nút, làn 0 (2 làn, k=0) đi +z tới nút 1; làn 1 (1 làn) đi tiếp tới nút 2.
function fakeWorld({ phaseAt = () => 'red', stoppedLeader = false, nextTurn = null } = {}) {
  const lanes = {
    edge: Int32Array.from([0, 1]), dir: Int8Array.from([1, 1]), from: Int32Array.from([0, 1]), to: Int32Array.from([1, 2]),
    length: Float32Array.from([100, 100]), offset: Float32Array.from([0, 0]), k: Uint8Array.from([0, 0]), n: Uint8Array.from([2, 1]),
    width: Float32Array.from([3, 3]), rank: Uint8Array.from([4, 4]), speed: Float32Array.from([13.9, 13.9]), st: Int32Array.from([0, 1]),
    pinch: Float32Array.from([0, 0])
  };
  const net = {
    G: { nodes: [{ id: 101, x: 0, z: 100 }, { id: 102, x: 0, z: 200 }, { id: 103, x: -100, z: 200 }], roads: [{ type: 'primary', maxspeed: '50' }] },
    E: [{ c: [0, 0, 0, 100], road: 0 }, { c: [0, 100, -100, 200], road: 0 }],
    lanes, Rz: [0, 10, 10], arriveGroup: [0, 0], nextSt: [nextTurn ? [{ st: 1, turn: nextTurn, rank: 4, sameName: false }] : [], []],
    NL: 2, NE: 2, NN: 3, NS: 2, signal: [1, 1, 0], needsLock: [0, 1, 0]
  };
  const controller = {
    isGreen: (node, st, t) => phaseAt(t) === 'green', stateOf: (node, t) => ({ cluster_id: 'T', cycle_s: 48, phases: [{ group: 0, phase: phaseAt(t) }, { group: 1, phase: 'red' }] }),
    cycleIdOf: (node, t) => Math.floor(t / 48), getMode: () => 'fixed'
  };
  const nodeMapT = [{ node_id: 'T-1', osm_id: 102, label: 'Nút thử nghiệm', prefix: 'T' }, { node_id: 'T-0', osm_id: 101, label: 'Nút đầu', prefix: 'T' }, { node_id: 'T-2', osm_id: 103, label: 'Nút cuối', prefix: 'T' }];
  return { net, controller, nodeMapT, lanes, stoppedLeader };
}
// Sim giả: một xe ở vị trí s trên làn l với tốc độ v; `codes[i]` là mã hành vi.
function fakeSim({ cars }) {
  const N = cars.length;
  const sim = {
    N, active: Uint8Array.from(cars.map(() => 1)), lane: Int32Array.from(cars.map(c => c.lane)), s: Float64Array.from(cars.map(c => c.s)),
    v: Float32Array.from(cars.map(c => c.v)), gen: Uint32Array.from(cars.map(c => c.gen ?? 0)), kind: Uint8Array.from(cars.map(c => c.kind)),
    len: Float32Array.from(cars.map(c => TRAFFIC_KINDS[c.kind].length)), next: Int32Array.from(cars.map(c => c.next ?? -1)),
    counters: { step: 0, t: 0 }, behaviorOn: true, behaviorCodeOf: i => cars[i].code ?? null
  };
  return sim;
}
// Chỉ số xe (slot = i+1) có mã hành vi/thuộc tính cho trước với thế hệ 0.
function slotWith(code, kindName) {
  for (let slot = 1; slot < 200000; slot++) if (violatorOf32(slot, 0, kindName, SEED) === code) return slot;
  throw new Error('không tìm được xe ' + code);
}
// Camera đặt phía sau xe, nhìn về +z (yaw 90°), độ cao 7 m, pitch −20°.
const camAt = (z, id = 'CAM-T') => ({ camera_id: id, node_id: 'T-1', x: 0, z, height_m: 7, yaw_deg: 90, pitch_deg: -20, fov_deg: 60, range_m: 60 });
// Chạy quét đều 0,5 s từ t0 đến t1 (thay đổi trạng thái giữa chừng qua hàm update).
function runScans(per, sim, t0, t1, update = () => {}) {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += 0.5) { sim.counters.t = t; update(t); per.scan(t); out.push(...per.drainViolations()); }
  return out;
}

test('luật tất định: cùng (xe, thế hệ, seed) → cùng mã; tỉ lệ mỗi mã gần thiết kế', () => {
  const counts = { car: {}, motorbike: {} };
  const N = 20000;
  for (let slot = 1; slot <= N; slot++) {
    const c1 = violatorOf32(slot, 0, 'car', SEED), c2 = violatorOf32(slot, 0, 'car', SEED);
    assert.equal(c1, c2);
    const m = violatorOf32(slot, 0, 'motorbike', SEED);
    if (c1) counts.car[c1] = (counts.car[c1] || 0) + 1;
    if (m) counts.motorbike[m] = (counts.motorbike[m] || 0) + 1;
    assert.ok(c1 === null || ALL_CODES_32.includes(c1));
    assert.ok(m === null || ['SPEED', 'PARK', 'WRONG-TURN', 'NO-HELMET', 'OVERLOAD', 'PHONE'].includes(m));
  }
  assert.ok(Math.abs(counts.motorbike['NO-HELMET'] / N - 0.02) < 0.005, JSON.stringify(counts.motorbike));
  assert.ok(Math.abs(counts.car['SPEED'] / N - 0.03) < 0.006, JSON.stringify(counts.car));
  assert.ok(Math.abs(counts.car['LANE'] / N - 0.3) < 0.02, 'LANE là lỗi xe con nhiều nhất trong bảng');
  assert.equal(counts.car['NO-HELMET'], undefined, 'ô tô không có lỗi mũ bảo hiểm');
  assert.equal(counts.motorbike['NO-SEATBELT'], undefined, 'xe máy không có lỗi dây an toàn');
  // Vượt đỏ theo chu kỳ: tỉ lệ ≈ RED_RATE_32
  let red = 0; for (let slot = 1; slot <= N; slot++) if (redViolatorOf32(slot, 7, SEED)) red++;
  assert.ok(Math.abs(red / N - RED_RATE_32) < 0.01, `red=${red}`);
});

test('phạt theo bảng NĐ 168/2024: số tiền, điểm và cờ verified', () => {
  assert.deepEqual([penaltyOf32('RED-LIGHT', 'car').vnd_min, penaltyOf32('RED-LIGHT', 'car').vnd_max, penaltyOf32('RED-LIGHT', 'car').license_deduction_points], [18e6, 20e6, 4]);
  assert.equal(penaltyOf32('RED-LIGHT', 'motorbike').vnd_min, 4e6);
  assert.equal(penaltyOf32('LANE', 'car').verified, false, 'LANE ô tô chưa đối chiếu');
  assert.equal(penaltyOf32('LANE', 'motorbike').verified, true);
  assert.equal(penaltyOf32('SPEED', 'car', 12).vnd_min, 4e6, 'vượt 10–20 km/h');
  assert.equal(penaltyOf32('SPEED', 'car', 40).license_deduction_points, 6, 'vượt trên 35 km/h');
  assert.equal(penaltyOf32('SPEED', 'car', 7).vnd_min, 8e5, 'vượt 5–10 km/h');
  assert.equal(penaltyOf32('NO-HELMET', 'motorbike').vnd_max, 6e5);
  assert.equal(penaltyOf32('OVERLOAD', 'car').verified, false);
  assert.equal(penaltyOf32('WRONG-WAY', 'motorbike').vnd_min, 4e6, 'xe máy ngược chiều: 4–6 triệu, 2 điểm');
  assert.equal(penaltyOf32('WRONG-WAY', 'motorbike').license_deduction_points, 2);
  assert.equal(penaltyOf32('WRONG-WAY', 'car').vnd_max, 2e7);
  assert.equal(penaltyOf32('PHONE', 'motorbike').vnd_min, 8e5);
  for (const c of ALL_CODES_32) assert.ok(CODE_LABEL_32[c], `thiếu nhãn ${c}`);
});

test('khung hình bằng chứng: xe phía sau camera không nằm trong khung', () => {
  const cam = camAt(20);
  assert.equal(inFrame32(0, 70, cam), true, 'xe trước mặt camera trong khung');
  assert.equal(inFrame32(0, -40, cam), false, 'xe sau lưng camera ngoài khung');
});

test('RED-LIGHT: ân hạn chỉ tính từ lúc chuyển ĐỎ (pha vàng không ghi)', () => {
  const run = phaseAt => {
    const w = fakeWorld({ phaseAt });
    const sim = fakeSim({ cars: [{ lane: 0, s: 60, v: 10, kind: 1 }] });
    const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(40)], codes: ['RED-LIGHT'] });
    // Xe ở s=60 (cách vạch 20 m) vượt vạch (s>90) lúc t=3 s; đèn đỏ từ t=1 s (red) hoặc vàng (yellow).
    const out = runScans(per, sim, 0, 4, t => { sim.s[0] = t < 3 ? 60 : 95; });
    return out.filter(v => v.violation_code === 'RED-LIGHT');
  };
  const red = run(t => (t < 1 ? 'yellow' : 'red'));
  assert.ok(red.length === 1, `đỏ phải ghi 1 bản ghi, có ${red.length}`);
  assert.equal(red[0].signal.phase_for_vehicle, 'red');
  assert.equal(run(() => 'yellow').length, 0, 'vàng không được ghi vượt đỏ');
  // Xe vượt vạch lúc đèn vàng (sau khi đã thấy đỏ), rồi đèn đỏ lại khi xe đã đi qua: không được ghi.
  const late = run(t => (t < 1 ? 'red' : t < 3.5 ? 'yellow' : 'red'));
  assert.equal(late.length, 0, 'vượt vạch khi vàng, đỏ sau đó không được ghi');
});

test('SPEED: đo tại ĐIỂM ĐO tốc độ (đoạn đo trong FOV): vượt giới hạn + 5 km/h thì ghi; xe chậm hoặc ngoài đoạn đo thì không', () => {
  const slot = slotWith('SPEED', 'car');
  const run = (v, s) => {
    const w = fakeWorld();
    const sim = fakeSim({ cars: Array.from({ length: slot }, (_, k) => (k === slot - 1 ? { lane: 0, s, v, kind: 1, code: 'SPEED' } : { lane: 0, s: 0, v: 0, kind: 1 })) });
    sim.active.fill(0); sim.active[slot - 1] = 1;
    const zones = { NL: 2, parkS0: Float32Array.from([-1, -1]), parkS1: Float32Array.from([-1, -1]),
      speedS0: Float32Array.from([20, -1]), speedS1: Float32Array.from([45, -1]), wrongWay: null };
    const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(0)], codes: ['RED-LIGHT', 'SPEED'], zones });
    return runScans(per, sim, 0, 3).filter(x => x.violation_code === 'SPEED');
  };
  const fast = run(20, 30);   // 72 km/h > 50 + 5, trong đoạn đo [20, 45]
  assert.equal(fast.length, 1);
  assert.equal(fast[0].penalty.verified, true);
  assert.equal(fast[0].detection.measured_at, 'điểm đo tốc độ');
  assert.ok(fast[0].signal.speed_kmh > fast[0].signal.speed_limit_kmh + 5);
  assert.equal(run(10, 30).length, 0, '36 km/h không vi phạm');
  assert.equal(run(20, 52).length, 0, 'ngoài đoạn đo (sau 45 m) không ghi');
});

test('LANE: ô tô đi làn 0 của trục ≥ 2 làn bị ghi; cùng xe ở làn 1 thì không', () => {
  const slot = slotWith('LANE', 'car');
  const build = lane => {
    const w = fakeWorld();
    const cars = Array.from({ length: slot }, (_, k) => (k === slot - 1 ? { lane, s: 30, v: 10, kind: 1, code: 'LANE' } : { lane: 0, s: 0, v: 0, kind: 1 }));
    const sim = fakeSim({ cars });
    sim.active.fill(0); sim.active[slot - 1] = 1;
    return { w, sim };
  };
  const a = build(0);
  const per = createPerception32({ net: a.w.net, sim: a.sim, controller: a.w.controller, nodeMap: a.w.nodeMapT, cameras: [camAt(-20)], codes: ['RED-LIGHT', 'LANE'] });
  const got = runScans(per, a.sim, 0, 1).filter(x => x.violation_code === 'LANE');
  assert.equal(got.length, 1);
  assert.equal(got[0].lane_index, 0);
  const b = build(0);
  b.sim.lane[slot - 1] = 0; b.w.net.lanes.k[0] = 1;   // cùng xe, làn không phải làn 0 → không lỗi
  const per2 = createPerception32({ net: b.w.net, sim: b.sim, controller: b.w.controller, nodeMap: b.w.nodeMapT, cameras: [camAt(-20)], codes: ['LANE'] });
  assert.equal(runScans(per2, b.sim, 0, 1).filter(x => x.violation_code === 'LANE').length, 0);
});

test('PARK: đứng yên ≥ 60 s trong VÙNG CẤM ĐỖ (trong FOV), không có xe đứng ngay trước → ghi đúng 1 lần; đầu hàng → không ghi', () => {
  const slot = slotWith('PARK', 'car');
  const run = withLeader => {
    const w = fakeWorld();
    const cars = Array.from({ length: slot }, (_, k) => (k === slot - 1 ? { lane: 0, s: 70, v: 0, kind: 1, code: 'PARK' } : { lane: 0, s: 0, v: 0, kind: 1 }));
    if (withLeader) cars.push({ lane: 0, s: 76, v: 0, kind: 1 });
    const sim = fakeSim({ cars });
    sim.active.fill(0); sim.active[slot - 1] = 1; if (withLeader) sim.active[cars.length - 1] = 1;
    const zones = { NL: 2, parkS0: Float32Array.from([60, -1]), parkS1: Float32Array.from([75, -1]),
      speedS0: Float32Array.from([-1, -1]), speedS1: Float32Array.from([-1, -1]), wrongWay: null };
    const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(20)], codes: ['RED-LIGHT', 'PARK'], zones });
    return runScans(per, sim, 0, 66).filter(x => x.violation_code === 'PARK');
  };
  const got = run(false);
  assert.equal(got.length, 1, 'xe đỗ sai phải được ghi đúng 1 lần');
  assert.ok(got[0].detection.still_s >= 60);
  assert.equal(run(true).length, 0, 'xe đầu hàng đứng sau xe khác không bị ghi PARK');
});

test('NO-HELMET: xe máy mang lỗi mũ được ghi (không cần hành vi sim); ô tô không', () => {
  const slot = slotWith('NO-HELMET', 'motorbike');
  const w = fakeWorld();
  const sim = fakeSim({ cars: Array.from({ length: slot }, (_, k) => ({ lane: 0, s: 30, v: 8, kind: k === slot - 1 ? 0 : 1 })) });
  sim.behaviorOn = false;   // không cần sim hành vi
  sim.active.fill(0); sim.active[slot - 1] = 1;
  const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(-20)], codes: ['NO-HELMET'] });
  const got = runScans(per, sim, 0, 1).filter(x => x.violation_code === 'NO-HELMET');
  assert.equal(got.length, 1);
  assert.equal(got[0].vehicle_class, 'motorbike');
  assert.equal(got[0].penalty.vnd_min, 4e5);
  assert.equal(got[0].penalty.verified, true);
  assert.equal(got[0].status === 'new' || got[0].status === 'needs_review', true);
});

test('WRONG-TURN: xe vi phạm rẽ trái tại nút cấm được ghi; lối không phải nút cấm thì không', () => {
  const slot = slotWith('WRONG-TURN', 'car');
  const run = restricted => {
    const w = fakeWorld({ nextTurn: -1.6 });
    const sim = fakeSim({ cars: Array.from({ length: slot }, (_, k) => (k === slot - 1 ? { lane: 0, s: 80, v: 8, kind: 1, next: 1, code: 'WRONG-TURN' } : { lane: 0, s: 0, v: 0, kind: 1 })) });
    sim.active.fill(0); sim.active[slot - 1] = 1;
    const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(30)], codes: ['WRONG-TURN'], restrictedNodes: restricted });
    return runScans(per, sim, 0, 1).filter(x => x.violation_code === 'WRONG-TURN');
  };
  const got = run([1]);
  assert.equal(got.length, 1);
  assert.equal(got[0].detection.maneuver, 'rẽ trái');
  assert.equal(run([]).length, 0);
});

test('mã bị tắt trong `codes` không được ghi, kể cả khi xe mang lỗi', () => {
  const slot = slotWith('NO-HELMET', 'motorbike');
  const w = fakeWorld();
  const sim = fakeSim({ cars: Array.from({ length: slot }, (_, k) => ({ lane: 0, s: 30, v: 8, kind: k === slot - 1 ? 0 : 1 })) });
  sim.active.fill(0); sim.active[slot - 1] = 1;
  const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(-20)] });
  assert.equal(runScans(per, sim, 0, 1).filter(x => x.violation_code !== 'RED-LIGHT').length, 0, 'mặc định chỉ RED-LIGHT');
});

// ---------- hành vi trong sim thật (mạng Hàng Xanh)
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const restrictedSim = restrictedNodeIndices32(G, nodeMap);
const simWith = (behavior, extra = {}) => {
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  return { controller, sim: createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED, behavior, ...extra }) };
};

test('không truyền behavior: sim tắt hành vi, mã hành vi không có (hash cổ điển giữ ở test sim-state)', () => {
  const { sim } = simWith(null);
  assert.equal(sim.behaviorOn, false);
  assert.equal(sim.behaviorCodeOf(0), null);
});

test('làn xe máy: sau 60 s, ô tô/bus/tải không đi làn 0 của trục ≥ 2 làn (trừ ô tô vi phạm LANE)', () => {
  const { sim } = simWith({ restrictedNodes: restrictedSim });
  for (let k = 0; k < 600; k++) sim.step();
  let bad = 0, sampled = 0;
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const l = sim.lane[i];
    if (net.lanes.k[l] !== 0 || net.lanes.n[l] < 2) continue;
    sampled++;
    if (sim.kind[i] !== 0 && sim.behaviorCodeOf(i) !== 'LANE') bad++;
  }
  assert.ok(sampled > 0, 'phải có xe trên làn 0');
  assert.equal(bad, 0, 'làn xe máy chỉ có xe máy hoặc ô tô vi phạm');
});

test('rẽ trái ở nút cấm: xe không vi phạm chỉ rẽ trái khi không còn lối nào khác (ngõ cụt)', () => {
  const { sim } = simWith({ restrictedNodes: restrictedSim });
  const seen = new Map();
  for (let k = 0; k < 3000; k++) {
    sim.step();
    if (k % 5) continue;
    for (let i = 0; i < sim.N; i++) {
      if (!sim.active[i] || sim.next[i] < 0) continue;
      const l = sim.lane[i];
      if (!restrictedSim.includes(net.lanes.to[l])) continue;
      if (net.lanes.length[l] - sim.s[i] > 30) continue;
      const c = net.nextSt[net.lanes.st[l]]?.find(x => x.st === net.lanes.st[sim.next[i]]);
      if (!c || c.turn >= -0.6) continue;
      const forced = net.nextSt[net.lanes.st[l]].every(x => x.turn < -0.6);
      const key = `${i}|${sim.gen[i]}`;
      if (!seen.has(key)) seen.set(key, { wrong: sim.behaviorCodeOf(i) === 'WRONG-TURN', forced });
    }
  }
  for (const [key, r] of seen) assert.ok(r.wrong || r.forced, `xe ${key} rẽ trái cấm mà không phải vi phạm hay ngõ cụt`);
});

test('mô phỏng có behavior tất định: hai lần cùng seed → cùng hash trạng thái', () => {
  const run = () => { const { sim } = simWith({ restrictedNodes: restrictedSim }); for (let k = 0; k < 400; k++) sim.step(); return sim.stateHash(); };
  assert.equal(run(), run());
});
