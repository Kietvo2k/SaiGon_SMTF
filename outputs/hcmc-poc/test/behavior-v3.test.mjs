// behavior-v3.test.mjs — lõi hành vi behaviorV3 (T-01 + chuyển làn + quay đầu + vi phạm rõ).
// Chạy đúng cấu hình bản public: graph public-north, lọc simHidden của city-lock-32, 12 dòng đèn public,
// controller smart, region bac, fraction 0.6, light day 0.85 — giống behavior-research-harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  buildTrafficNetwork31, createTrafficSim31, createTrafficGeometry31, LIGHT_FACTOR, BEHAVIOR_V3_32
} from '../city-traffic-sim-31.js?v=v3';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=v3';
import { createSignalController32 } from '../traffic-controller-32.js?v=v3';
import { buildZones32, ZONE_SPEC_32 } from '../violation-zones-32.js?v=v3';
import { restrictedNodeIndices32, RED_RATE_32, redViolatorOf32, violatorOf32 } from '../violation-rules-32.js?v=v3';
import { regionTrafficPayload, regionOf } from '../city-region-31.js?v=v3';
import * as lock32 from '../city-lock-32.js?v=v3';
import * as sigreg from '../signature-registry-31.js?v=v3';

const readJson = abs => JSON.parse(fs.readFileSync(abs, 'utf8'));
const HCMC = path.resolve('outputs/hcmc-poc');
const PUB = path.join(HCMC, 'data/public-north');
const G = readJson(path.join(PUB, 'road-graph.json'));
const D = readJson(path.join(PUB, 'scene.json'));
const PUBLIC_CONFIG = readJson(path.join(PUB, 'runtime-sidecars.json'));
const SEED_DIR = path.resolve('outputs/smart-traffic/backend/app/seed/public-north');
const NODE_MAP = readJson(path.join(SEED_DIR, 'node_map.json'));
const CAMERAS = readJson(path.join(SEED_DIR, 'cameras.json'));
globalThis.SIGNATURE_REGISTRY_31 = PUBLIC_CONFIG.globals.SIGNATURE_REGISTRY_31;

const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const signalPlan = buildSignalPlan32({ graph: G, nodeMap: NODE_MAP, rows: PUBLIC_CONFIG.signalRows });
const nodeById = new Map(G.nodes.map(n => [n.id, n]));
const signalPoints = signalPlan.rows.map(r => nodeById.get(r.osm_id)).filter(Boolean).map(n => [n.x, n.z]);
const registry = sigreg.loadSignatureRegistry();
const roadsFilter = lock32.lockRoadFilter32({ roads: D.roads, regionOf, signalPoints, isSignatureWay: id => registry.isSignatureWay(id) });
const simHidden = new Set(roadsFilter.hidden);
for (const i of roadsFilter.keptMinor) simHidden.add(i);
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide' && !simHidden.has(i);
const NET = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const ZONES = buildZones32({ net: NET, cameras: CAMERAS, spec: ZONE_SPEC_32 });
const RESTRICTED = restrictedNodeIndices32(G, NODE_MAP);
const DEMAND = { center: [-130, -2540], radius_m: 1500, turnBias: 15, spawnBias: 200, poolScale: 5 };

function makeSim({ seed = 31031, v3 = true } = {}) {
  const controller = createSignalController32({ net: NET, sim: null, mode: 'smart' });
  const sim = createTrafficSim31(NET, {
    signalPlan, controller, seed, breakerS: 180, demand: DEMAND,
    behavior: {
      seed, restrictedNodes: RESTRICTED, parkS0: ZONES.parkS0, parkS1: ZONES.parkS1,
      yellowDecision: true, motoCreep: true, behaviorV3: v3
    }
  });
  controller.attachSim(sim);
  controller.setMode('smart', { immediate: true });
  controller.reset(0);
  sim.setRegion(regionTrafficPayload('bac'));
  sim.setFraction(0.6);
  sim.setLightFactor(LIGHT_FACTOR.day);
  return { sim, controller };
}

test('cờ behaviorV3: bật mặc định khi có behavior, tắt khi behaviorV3:false hoặc không có behavior', () => {
  assert.equal(makeSim({ v3: true }).sim.behaviorV3, true);
  assert.equal(makeSim({ v3: false }).sim.behaviorV3, false);
  const noBeh = createTrafficSim31(NET, { signalPlan, controller: null, breakerS: Infinity });
  assert.equal(noBeh.behaviorOn, false);
  assert.equal(noBeh.behaviorV3, false);
  assert.equal(BEHAVIOR_V3_32.lockDomainM, 12);
  assert.equal(BEHAVIOR_V3_32.gapPatienceS, 12);
  assert.equal(BEHAVIOR_V3_32.fairnessS, 20);
  assert.equal(BEHAVIOR_V3_32.laneChangeCooldownS, 3);
});

test('V3 tất định: cùng seed → cùng stateHash sau 400 bước; khác seed → khác', () => {
  const run = seed => { const { sim } = makeSim({ seed }); for (let k = 0; k < 400; k++) sim.step(); return sim.stateHash(); };
  assert.equal(run(31031), run(31031));
  assert.notEqual(run(31031), run(31032));
});

test('V3 tắt: không chuyển làn / không quay đầu (luồng cổ điển nguyên vẹn trong 120 s)', () => {
  const { sim } = makeSim({ v3: false });
  for (let k = 0; k < 1200; k++) sim.step();
  assert.equal(sim.counters.lateralChanges, 0);
  assert.equal(sim.counters.uTurns, 0);
  assert.equal(sim.counters.gapViolations, 0);
});

test('V3 120 s: chuyển làn > 0, quay đầu > 0, không xuyên xe / không teleport', () => {
  const { sim } = makeSim({ v3: true });
  for (let k = 0; k < 1200; k++) sim.step();
  const st = sim.stats();
  assert.ok(st.lateralChanges > 0, `phải có chuyển làn, có ${st.lateralChanges}`);
  assert.ok(st.uTurns > 0, `phải có quay đầu khi hàng lớn, có ${st.uTurns}`);
  assert.equal(st.gapViolations, 0, 'không được xuyên xe cùng làn');
  assert.equal(st.teleports, 0, 'không teleport qua nút khác');
  assert.equal(st.onewayViolations, 0);
  assert.ok(st.edgeTransitions > 15000, `thông lượng không sụp: ${st.edgeTransitions}`);
});

test('vi phạm hiện rõ qua API: NO-HELMET ~6 % xe máy, mã đầy đủ + đếm theo mã', () => {
  const { sim } = makeSim({ v3: true });
  for (let k = 0; k < 300; k++) sim.step();
  const counts = sim.violationCounts();
  assert.ok(counts.active > 1500, `phải có xe hoạt động, có ${counts.active}`);
  assert.ok((counts.byCode['NO-HELMET'] || 0) > 0, 'phải có xe máy không mũ');
  assert.ok(counts.noHelmetShare > 0.03 && counts.noHelmetShare < 0.09, `tỉ lệ mũ ${counts.noHelmetShare}`);
  let traitSeen = 0;
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const c = sim.allCodeOf(i);
    if (c === 'NO-HELMET' || c === 'OVERLOAD' || c === 'PHONE' || c === 'NO-SEATBELT') traitSeen++;
  }
  assert.ok(traitSeen > 0, 'API phải trả mã trạng thái (không chỉ mã hành vi)');
  // behaviorCodeOf giữ hợp đồng cũ: chỉ mã hành vi sim tác động.
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const c = sim.behaviorCodeOf(i);
    assert.ok(c === null || ['LANE', 'SPEED', 'PARK', 'WRONG-TURN'].includes(c));
  }
});

test('RED_LIGHT: RED_RATE_32 = 0.04 (2–5 % tài xế đối diện đỏ), tất định theo (xe, chu kỳ)', () => {
  assert.ok(RED_RATE_32 >= 0.02 && RED_RATE_32 <= 0.05, `RED_RATE_32=${RED_RATE_32}`);
  let hit = 0;
  const N = 20000;
  for (let slot = 1; slot <= N; slot++) if (redViolatorOf32(slot, 7, 31031)) hit++;
  assert.ok(Math.abs(hit / N - RED_RATE_32) < 0.008, `tỉ lệ ${hit / N}`);
  assert.equal(redViolatorOf32(5, 7, 31031), redViolatorOf32(5, 7, 31031));
});

test('RED_LIGHT: sim đếm lượt qua vạch và lượt đỏ; đỏ là ngoại lệ (≤ 5 % lượt qua vạch)', () => {
  const { sim } = makeSim({ v3: true });
  for (let k = 0; k < 1200; k++) sim.step();
  const st = sim.stats();
  assert.ok(st.signalCrossings > 100, `phải có lượt qua vạch, có ${st.signalCrossings}`);
  const rate = st.redCrossings / st.signalCrossings;
  assert.ok(rate <= 0.05, `vượt đỏ phải là ngoại lệ, đo ${(100 * rate).toFixed(2)} %`);
  assert.ok(st.redRuns >= 0);
});

test('thuần: hằng số và hàm gap acceptance/domain không phụ thuộc Math.random', () => {
  // Không có Math.random trong lõi sim (tất định): đọc mã nguồn và khẳng định.
  const src = fs.readFileSync(path.join(HCMC, 'city-traffic-sim-31.js'), 'utf8');
  assert.equal(/Math\.random/.test(src), false, 'sim không được dùng Math.random');
  assert.equal(violatorOf32(1, 0, 'motorbike', 31031), violatorOf32(1, 0, 'motorbike', 31031));
  // Hình học pose vẫn dựng được với jit đang trượt làn (không NaN).
  const { sim } = makeSim({ v3: true });
  for (let k = 0; k < 200; k++) sim.step();
  const geo = createTrafficGeometry31(NET, sim), P = {};
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    geo.poseAt(i, sim.lane[i], sim.s[i], sim.next[i], sim.prevLane[i], P);
    assert.ok(Number.isFinite(P.x) && Number.isFinite(P.z), `pose xe ${i} hữu hạn`);
  }
});
