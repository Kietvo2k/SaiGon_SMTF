// M5b-1b: vùng quan sát (điểm đo tốc độ, vùng cấm đỗ, tuyến ngược chiều), tác nhân WRONG-WAY, biển đọc sai định dạng
// → needs_review, và hình học cận cảnh đầu người lái (bằng chứng NO-HELMET). Tất định, chạy trong Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficGeometry31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { createPerception32, plateFormatOk32, inFrame32 } from '../violation-perception-32.js?v=32a';
import { violatorOf32 } from '../violation-rules-32.js?v=32a';
import { buildZones32 } from '../violation-zones-32.js?v=32a';
import { createWrongWayAgents32, WRONG_SLOT_BASE_32, WRONG_FIRST_S_32, WRONG_PERIOD_S_32 } from '../wrong-way-32.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { headWorldOf32, closeCamPoseOf32, CLOSE_DIST_32 } from '../camera-capture-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const cameras = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/cameras.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

// Mạng thật (Hàng Xanh) để dựng vùng từ camera registry.
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });

test('vùng quan sát: mỗi vùng nằm trọn trong FOV camera của nó và đủ dài (≥ 10 m)', () => {
  const z = buildZones32({ net, cameras });
  const by = kind => z.describe.find(d => d.kind === kind);
  const park = by('park'), speed = by('speed'), ww = by('wrong-way');
  assert.ok(park && speed && ww, JSON.stringify(z.describe));
  assert.equal(park.camera_id, 'CAM-HX-001');
  assert.equal(speed.camera_id, 'CAM-HX-001');
  assert.equal(ww.camera_id, 'CAM-HX-001');
  const cam = id => cameras.find(c => c.camera_id === id);
  for (const d of [park, speed]) {
    assert.ok(d.s1 - d.s0 >= 10, `${d.kind} đoạn ${d.s0}–${d.s1} m quá ngắn`);
    // Hai đầu và giữa đoạn đều trong khung ảnh bằng chứng (xe đỗ/đo phải nhìn thấy suốt).
    for (const s of [d.s0 + 0.5, (d.s0 + d.s1) / 2, d.s1 - 0.5]) {
      const L = net.lanes.length[d.lane];
      const p = { x: 0, z: 0 };
      // Toạ độ điểm trên làn: dùng đúng hàm hình học của mạng (cùng phép nội suy như perception).
      createTrafficGeometry31(net, null).lanePoint(d.lane, Math.min(L, s), net.lanes.offset[d.lane], p);
      assert.ok(inFrame32(p.x, p.z, cam(d.camera_id)), `${d.kind} tại s=${s.toFixed(1)} không trong FOV`);
    }
  }
  assert.ok(ww.latv < net.lanes.offset[ww.lane] - net.lanes.width[ww.lane] / 2, 'tuyến ngược chiều nằm ngoài mép trái làn');
});

// geo cho tác nhân: làn thẳng dọc trục z (x = latv, y = 1), s tăng theo +z.
const straightGeo = { lanePoint: (l, s, latv, out) => { out.x = latv; out.z = s; return out; }, laneY: () => 1 };
const zoneTest = { camera_id: 'CAM-T', l: 0, latv: -6.6, L: 100 };

test('tác nhân WRONG-WAY: chuyến đầu lúc 90 s, mỗi 240 s; chạy NGƯỢC chiều (s giảm, hướng đi đảo) và lệch sang lề trái', () => {
  const ag = createWrongWayAgents32({ zone: zoneTest, geo: straightGeo, liftY: null });
  assert.equal(ag.activeAt(WRONG_FIRST_S_32 - 1).length, 0, 'chưa đến chuyến đầu');
  const a = ag.activeAt(WRONG_FIRST_S_32 + 1);
  assert.equal(a.length, 1);
  assert.equal(a[0].slot, WRONG_SLOT_BASE_32);
  assert.ok(Math.abs(a[0].z - (100 - 1 * 5.5)) < 1e-6, `s phải giảm từ đầu tuyến, z=${a[0].z}`);
  assert.equal(a[0].x, -6.6, 'lệch sang lề trái');
  assert.ok(Math.abs(a[0].hx) < 1e-9 && Math.abs(a[0].hz + 1) < 1e-9, 'hướng đi ngược trục làn (−z)');
  assert.equal(ag.activeAt(WRONG_FIRST_S_32 + WRONG_PERIOD_S_32 + 1)[0].slot, WRONG_SLOT_BASE_32 + 1, 'chuyến thứ hai sau 240 s');
  assert.equal(ag.activeAt(WRONG_FIRST_S_32 + 100 / 5.5 + 1).length, 0, 'đi hết tuyến thì biến mất');
});

// Ghi WRONG-WAY từ tác nhân: camera nhìn tới điểm (0, 30) trên tuyến; hai lần quét trong FOV (≥ 1 s) thì ghi.
const camT = { camera_id: 'CAM-T', node_id: 'T-1', x: 0, z: 40, height_m: 7, yaw_deg: 270, pitch_deg: -20, fov_deg: 60, range_m: 60 };
test('WRONG-WAY: tác nhân ngược chiều trong FOV → bản ghi WRONG-WAY (xe máy, phạt 4–6 triệu, 2 điểm) kèm tư thế bằng chứng', () => {
  const ghost = { slot: WRONG_SLOT_BASE_32, gen: 0, camera_id: 'CAM-T', kind: 0, lane: 0, x: 0, y: 1, z: 30, hx: 0, hz: -1, v: 5.5, len: 1.9, wid: 0.7, h: 1.62 };
  const ghosts = { activeAt: () => [ghost] };
  const sim = { N: 0, active: new Uint8Array(0), lane: new Int32Array(0), s: new Float64Array(0), v: new Float32Array(0), gen: new Uint32Array(0),
    kind: new Uint8Array(0), len: new Float32Array(0), next: new Int32Array(0), counters: { t: 0, step: 0 }, behaviorOn: false };
  const w = fakeWorld();
  const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camT], codes: ['WRONG-WAY'], ghosts });
  const out = [];
  for (let t = 100; t <= 102; t += 0.5) { per.scan(t); out.push(...per.drainViolations()); }
  assert.equal(out.length, 1, JSON.stringify(out.map(o => o.violation_code)));
  const r = out[0];
  assert.equal(r.violation_code, 'WRONG-WAY');
  assert.equal(r.vehicle_class, 'motorbike');
  assert.equal(r.detection.maneuver, 'đi ngược chiều');
  assert.equal(r.penalty.vnd_min, 4e6);
  assert.equal(r.penalty.license_deduction_points, 2);
  assert.equal(r._pose.hz, -1, 'tư thế bằng chứng là tư thế thật của tác nhân');
  assert.equal(r.vehicle_id, 'V-990000', 'mã xe ảo theo slot tác nhân');
});

test('WRONG-WAY: không bật mã thì không ghi', () => {
  const ghost = { slot: WRONG_SLOT_BASE_32, gen: 0, camera_id: 'CAM-T', kind: 0, lane: 0, x: 0, y: 1, z: 30, hx: 0, hz: -1, v: 5.5 };
  const sim = { N: 0, active: new Uint8Array(0), lane: new Int32Array(0), s: new Float64Array(0), v: new Float32Array(0), gen: new Uint32Array(0),
    kind: new Uint8Array(0), len: new Float32Array(0), next: new Int32Array(0), counters: { t: 0, step: 0 }, behaviorOn: false };
  const w = fakeWorld();
  const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camT], codes: ['RED-LIGHT'], ghosts: { activeAt: () => [ghost] } });
  for (let t = 100; t <= 102; t += 0.5) per.scan(t);
  assert.equal(per.drainViolations().length, 0);
});

test('biển đọc sai định dạng → needs_review với độ tin cậy ≤ 0,84; biển đúng định dạng mới có thể là new', () => {
  assert.equal(plateFormatOk32('59-X9 999.99', 'motorbike'), true);
  assert.equal(plateFormatOk32('5-U7 700.39', 'motorbike'), false, 'mất ký tự');
  assert.equal(plateFormatOk32('51K-123.45', 'car'), true);
  assert.equal(plateFormatOk32('51K-12.45', 'car'), false);
  assert.equal(plateFormatOk32('59X9 999.99', 'motorbike'), false);
  // Nhiều xe máy NO-HELMET trong FOV → OCR mất ký tự ở một số biển: mọi bản ghi phải tuân luật trạng thái.
  const slots = [];
  for (let slot = 1; slots.length < 60 && slot < 200000; slot++) if (violatorOf32(slot, 0, 'motorbike', SEED) === 'NO-HELMET') slots.push(slot);
  const maxSlot = Math.max(...slots);
  const cars = Array.from({ length: maxSlot }, (_, k) => ({ lane: 0, s: 30, v: 0, kind: 0 }));
  const sim = fakeSim({ cars });
  sim.active.fill(0); for (const s of slots) sim.active[s - 1] = 1;
  sim.behaviorOn = false;
  const w = fakeWorld();
  const per = createPerception32({ net: w.net, sim, controller: w.controller, nodeMap: w.nodeMapT, cameras: [camAt(-20)], codes: ['NO-HELMET'] });
  const out = [];
  for (let t = 0; t <= 1; t += 0.5) { sim.counters.t = t; per.scan(t); out.push(...per.drainViolations()); }
  assert.ok(out.length >= 30, `phải có nhiều bản ghi, có ${out.length}`);
  const misread = out.filter(r => !plateFormatOk32(r.plate, r.plate_format));
  assert.ok(misread.length >= 1, 'phải có ít nhất một biển đọc sai để kiểm luật');
  for (const r of misread) {
    assert.equal(r.status, 'needs_review', r.plate);
    assert.ok(r.confidence <= 0.84, `${r.plate} conf=${r.confidence}`);
  }
  for (const r of out.filter(r => r.status === 'new')) assert.ok(plateFormatOk32(r.plate, r.plate_format) && r.confidence >= 0.85);
});

test('cận cảnh đầu người lái: đầu đặt sau tâm xe 0,26 m, camera cận cảnh cách đầu đúng CLOSE_DIST và nhìn vào đầu', () => {
  const head = headWorldOf32({ x: 10, z: 5, hx: 1, hz: 0, len: 1.9, wid: 0.7, h: 1.62 });
  assert.ok(Math.abs(head.x - (10 - 0.26)) < 1e-9 && Math.abs(head.z - 5) < 1e-9, 'đầu ở phía sau xe (ngược hướng đi)');
  assert.ok(Math.abs(head.y - (1.0 + 1.44)) < 1e-9, 'cao 1,44 m trên mặt đường (y=1,0)');
  const pose = closeCamPoseOf32(head, { x: 40, z: 5 });
  const dist = Math.hypot(pose.pos[0] - head.x, pose.pos[2] - head.z);
  assert.ok(Math.abs(dist - CLOSE_DIST_32) < 1e-9, `khoảng cách camera–đầu ${dist}`);
  assert.ok(pose.pos[0] > head.x, 'camera ở phía camera chụp');
  assert.deepEqual(pose.target, [head.x, head.y, head.z]);
});

// ---- dựng sim giả (giống violation-32.test.mjs, tối giản).
function fakeWorld() {
  const lanes = {
    edge: Int32Array.from([0, 1]), dir: Int8Array.from([1, 1]), from: Int32Array.from([0, 1]), to: Int32Array.from([1, 2]),
    length: Float32Array.from([100, 100]), offset: Float32Array.from([0, 0]), k: Uint8Array.from([0, 0]), n: Uint8Array.from([2, 1]),
    width: Float32Array.from([3, 3]), rank: Uint8Array.from([4, 4]), speed: Float32Array.from([13.9, 13.9]), st: Int32Array.from([0, 1]),
    pinch: Float32Array.from([0, 0])
  };
  const net = {
    G: { nodes: [{ id: 101, x: 0, z: 100 }, { id: 102, x: 0, z: 200 }, { id: 103, x: -100, z: 200 }], roads: [{ type: 'primary', maxspeed: '50' }] },
    E: [{ c: [0, 0, 0, 100], road: 0 }, { c: [0, 100, -100, 200], road: 0 }],
    lanes, Rz: [0, 10, 10], arriveGroup: [0, 0], nextSt: [[], []],
    NL: 2, NE: 2, NN: 3, NS: 2, signal: [1, 1, 0], needsLock: [0, 1, 0]
  };
  const controller = {
    isGreen: () => false, stateOf: () => ({ cluster_id: 'T', cycle_s: 48, phases: [{ group: 0, phase: 'red' }, { group: 1, phase: 'red' }] }),
    cycleIdOf: (node, t) => Math.floor(t / 48), getMode: () => 'fixed'
  };
  const nodeMapT = [{ node_id: 'T-1', osm_id: 102, label: 'Nút thử nghiệm', prefix: 'T' }, { node_id: 'T-0', osm_id: 101, label: 'Nút đầu', prefix: 'T' }, { node_id: 'T-2', osm_id: 103, label: 'Nút cuối', prefix: 'T' }];
  return { net, controller, nodeMapT };
}
function fakeSim({ cars }) {
  const N = cars.length;
  return {
    N, active: Uint8Array.from(cars.map(() => 1)), lane: Int32Array.from(cars.map(c => c.lane)), s: Float64Array.from(cars.map(c => c.s)),
    v: Float32Array.from(cars.map(c => c.v)), gen: Uint32Array.from(cars.map(() => 0)), kind: Uint8Array.from(cars.map(c => c.kind)),
    len: Float32Array.from(cars.map(() => 1.9)), next: Int32Array.from(cars.map(() => -1)),
    counters: { step: 0, t: 0 }, behaviorOn: true
  };
}
const camAt = (z, id = 'CAM-T') => ({ camera_id: id, node_id: 'T-1', x: 0, z, height_m: 7, yaw_deg: 90, pitch_deg: -20, fov_deg: 60, range_m: 60 });
