import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, STEP, TRAFFIC_KINDS, hashU32 } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import { plateFor32, mulberry32, ocrNoise32, createPerception32, GRACE_S, VIOLATION_RATE, SCENARIO_PLATES_32 } from '../violation-perception-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

test('mulberry32 + plateFor32 tất định, khớp định dạng biển VN', () => {
  assert.equal(typeof mulberry32(1)(), 'number');
  const a = plateFor32(42, 1, 'car'), b = plateFor32(42, 1, 'car');
  assert.deepEqual(a, b);
  assert.match(a.plate, /^[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}$/);
  assert.equal(a.plate_format, 'car');
  const m = plateFor32(42, 1, 'motorbike');
  assert.match(m.plate, /^[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2}$/);
  assert.equal(m.plate_format, 'motorbike');
  assert.ok(['trắng','đen','xám','bạc','đỏ','xanh dương','xanh lá','vàng','nâu','cam','hồng','tím'].includes(a.color));
  assert.match(a.owner_phone, /^09[0-9]{8}$/);
  assert.equal(a.is_scenario, false);
  // gen khác → biển khác (xe vật lý mới sau respawn)
  assert.notEqual(plateFor32(42, 2, 'car').plate, a.plate);
});

test('biển kịch bản: đúng 6 biển, format khớp nhóm xe, cờ is_scenario', () => {
  assert.equal(SCENARIO_PLATES_32.length, 6);
  for (const s of SCENARIO_PLATES_32) {
    const fmt = s.vehicle_class === 'motorbike' ? /^[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2}$/ : /^[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}$/;
    assert.match(s.plate, fmt, JSON.stringify(s));
  }
  const hit = SCENARIO_PLATES_32.find(s => s.vehicle_class === 'car');
  const got = plateFor32(hit.slot, hit.gen, 'car');
  assert.equal(got.is_scenario, true);
  assert.equal(got.plate, hit.plate);
});

test('ocrNoise32: nhiễu tất định, p_swap/p_miss đúng tham số, confidence trong [0,1]', () => {
  const r1 = ocrNoise32('51K-123.45', 30, 60, 12.5, 7, 1);
  const r2 = ocrNoise32('51K-123.45', 30, 60, 12.5, 7, 1);
  assert.deepEqual(r1, r2);
  assert.equal(typeof r1.ocr_confidence, 'number');
  assert.ok(r1.ocr_confidence >= 0 && r1.ocr_confidence <= 1);
  assert.ok(r1.plate_read.length >= 8 && r1.plate_read.length <= 12);
});

test('luật RED-LIGHT: máy trạng thái sinh bản ghi sau grace, chống trùng (vehicle, node, cycle)', () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const redRun = () => true;   // mọi xe chủ động vượt → chắc chắn có vi phạm
  const controller = createSignalController32({ net, sim: null, mode: 'fixed', redRun });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
  const cameras = [{ camera_id: 'CAM-T0', node_id: 'HX-01', x: -231, z: -2422, height_m: 8, yaw_deg: 222, pitch_deg: -12, fov_deg: 179, range_m: 800, label: 'test' }];
  const per = createPerception32({ net, sim, controller, nodeMap, cameras, seed: SEED });
  for (let k = 0; k < 600; k++) {   // 60 s sim
    sim.step();
    if (k % 5 === 0) per.scan(sim.counters.t);
  }
  const list = per.drainViolations();
  assert.ok(list.length >= 1, 'phải có ít nhất 1 vi phạm RED-LIGHT');
  const v = list[0];
  assert.equal(v.violation_code, 'RED-LIGHT');
  assert.equal(v.detection.grace_s, GRACE_S);
  assert.equal(VIOLATION_RATE, 0.03);
  for (const k of ['plate', 'plate_format', 'vehicle_class', 'vehicle_id', 'node_id', 'node_osm_id', 'camera_id', 'road_index', 'lane_index', 'signal', 'confidence', 'ocr_confidence', 'detection', 'penalty', 'sim']) assert.ok(k in v, `bản ghi thiếu ${k}`);
  for (const k of ['mode', 'cluster_id', 'cycle_id', 'phase_for_vehicle', 'group', 'elapsed_in_phase_s', 'cycle_s', 'speed_kmh', 'speed_limit_kmh']) assert.ok(k in v.signal, `signal thiếu ${k}`);
  assert.ok(Number.isInteger(v.signal.cycle_id));
  assert.ok(v.confidence >= 0 && v.confidence <= 1);
  // Chống trùng: quét tiếp không sinh bản ghi trùng bộ (vehicle_id, node_id, cycle_id)
  for (let k = 600; k < 900; k++) { sim.step(); if (k % 5 === 0) per.scan(sim.counters.t); }
  const more = per.drainViolations();
  const keys = new Set();
  for (const x of [...list, ...more]) {
    const key = `${x.vehicle_id}|${x.node_id}|${x.signal.cycle_id}`;
    assert.ok(!keys.has(key), `trùng ${key}`);
    keys.add(key);
  }
});

test('tất định: hai lần chạy 60 s cùng seed → cùng số vi phạm và cùng biển', () => {
  const run = () => {
    const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
    const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
    const controller = createSignalController32({ net, sim: null, mode: 'fixed', redRun: () => true });
    const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED });
    const cameras = [{ camera_id: 'CAM-T0', node_id: 'HX-01', x: -231, z: -2422, height_m: 8, yaw_deg: 222, pitch_deg: -12, fov_deg: 179, range_m: 800, label: 'test' }];
    const per = createPerception32({ net, sim, controller, nodeMap, cameras, seed: SEED });
    for (let k = 0; k < 600; k++) { sim.step(); if (k % 5 === 0) per.scan(sim.counters.t); }
    return per.drainViolations().map(v => `${v.vehicle_id}|${v.plate}|${v.signal.cycle_id}`);
  };
  assert.deepEqual(run(), run());
});
