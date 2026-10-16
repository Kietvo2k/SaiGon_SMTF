// M5b-1: vượt đỏ TỰ NHIÊN trong 5 phút sim cao điểm (không ép luật), đo bằng Node.
// HX-02 không có camera trong registry nên đặt camera thử nghiệm trên lối vào HX-02 (cùng quy ước đặt camera của registry);
// HX-01 dùng đúng camera registry CAM-HX-001. Chạy ~1 phút: đây là kiểm chứng xác suất, không phải ép kết quả.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import { createPerception32 } from '../violation-perception-32.js?v=32a';
import { restrictedNodeIndices32 } from '../violation-rules-32.js?v=32a';
import { PEAK_HANG_XANH_DEMAND } from '../../../scripts/a1-metric-32.mjs';

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

test('5 phút cao điểm: có vượt đỏ tự nhiên ở HX-01 hoặc HX-02, đúng lúc đèn đỏ', async () => {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const idxOf = id => G.nodes.findIndex(n => n.id === nodeMap.find(m => m.node_id === id).osm_id);
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const restricted = restrictedNodeIndices32(G, nodeMap);
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED, demand: PEAK_HANG_XANH_DEMAND,
    behavior: { restrictedNodes: restricted, parkNodes: ['HX-01', 'HX-06'].map(idxOf) } });
  // Camera thử nghiệm trên lối vào HX-02: 30 m trước nút, lệch 7 m, nhìn về nút (như registry).
  const n2 = idxOf('HX-02');
  let inL = 0; for (let l = 0; l < net.NL; l++) if (net.lanes.to[l] === n2) { inL = l; break; }
  const c = net.E[net.lanes.edge[inL]].c, m = c.length / 2;
  const ex = c[(m - 1) * 2], ez = c[(m - 1) * 2 + 1], qx = c[(m - 2) * 2], qz = c[(m - 2) * 2 + 1];
  const L = Math.hypot(ex - qx, ez - qz) || 1, dx = (ex - qx) / L, dz = (ez - qz) / L;
  const cx = ex - dx * 30 - dz * 7, cz = ez - dz * 30 + dx * 7;
  const testCam = { camera_id: 'T-CAM-HX-002', node_id: 'HX-02', x: cx, z: cz, height_m: 7,
    yaw_deg: Math.atan2(G.nodes[n2].z - cz, G.nodes[n2].x - cx) * 180 / Math.PI, pitch_deg: -20, fov_deg: 60, range_m: 60 };
  const perception = createPerception32({ net, sim, controller, nodeMap, cameras: [...cameras, testCam], codes: ['RED-LIGHT'], restrictedNodes: restricted });
  const found = [];
  for (let k = 0; k < 3000; k++) {   // 300 s sim
    sim.step();
    if (k % 5 === 0) { perception.scan(sim.counters.t); found.push(...perception.drainViolations()); }
  }
  const at = found.filter(v => v.node_id === 'HX-01' || v.node_id === 'HX-02');
  assert.ok(at.length >= 1, `phải có ≥ 1 vượt đỏ ở HX-01 hoặc HX-02, có ${at.length} (tổng ${found.length})`);
  for (const v of at) {
    assert.equal(v.violation_code, 'RED-LIGHT');
    assert.equal(v.signal.phase_for_vehicle, 'red', 'vượt đỏ phải ghi khi nhóm xe đang đỏ');
    assert.ok(v.detection.grace_s > 0);
  }
});
