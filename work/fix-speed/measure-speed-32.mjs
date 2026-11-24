#!/usr/bin/env node
// Đo số vi phạm SPEED trong sim cao điểm (cùng bố trí với test "8 phút cao điểm camera HX" của violation-32.test.mjs).
// Dùng: node work/fix-speed/measure-speed-32.mjs --seed 31031 [--steps 4800]
// Mặc định 4800 bước × 0,1 s = 480 s = 8 phút cao điểm. Chạy nhiều seed để lấy trung bình.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.cwd());
const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));

globalThis.window = globalThis;
require(path.resolve(ROOT, 'outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve(ROOT, 'outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

const { buildTrafficNetwork31, createTrafficSim31, createTrafficGeometry31, STEP } = await import(new URL('../../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { createPerception32 } = await import(new URL('../../outputs/hcmc-poc/violation-perception-32.js?v=32a', import.meta.url).href);
const { buildZones32 } = await import(new URL('../../outputs/hcmc-poc/violation-zones-32.js?v=32a', import.meta.url).href);
const { createWrongWayAgents32 } = await import(new URL('../../outputs/hcmc-poc/wrong-way-32.js?v=32a', import.meta.url).href);
const { ALL_CODES_32, restrictedNodeIndices32 } = await import(new URL('../../outputs/hcmc-poc/violation-rules-32.js?v=32a', import.meta.url).href);
const { PEAK_HANG_XANH_DEMAND } = await import(new URL('../../scripts/a1-metric-32.mjs', import.meta.url).href);

const cameras = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'outputs/smart-traffic/backend/app/seed/cameras.json'), 'utf8'))
  .filter(c => String(c.camera_id).startsWith('CAM-HX'));
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const restrictedSim = restrictedNodeIndices32(G, nodeMap);

function runOnce(seed, steps) {
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const zones = buildZones32({ net, cameras });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed, demand: PEAK_HANG_XANH_DEMAND,
    behavior: { restrictedNodes: restrictedSim, parkS0: zones.parkS0, parkS1: zones.parkS1 } });
  const ghosts = zones.wrongWay ? createWrongWayAgents32({ zone: zones.wrongWay, geo: createTrafficGeometry31(net, sim) }) : null;
  const per = createPerception32({ net, sim, controller, nodeMap, cameras, zones, ghosts, codes: ALL_CODES_32, restrictedNodes: restrictedSim });
  const found = [];
  for (let k = 0; k < steps; k++) { sim.step(); if (k % 5 === 0) { per.scan(sim.counters.t); found.push(...per.drainViolations()); } }
  return found;
}

const steps = Number(args.steps ?? 4800);
const seeds = (args.seeds ?? args.seed ?? '31031').split(',').map(s => Number(s.trim()));
const minutes = (steps * STEP / 60).toFixed(1);
console.log(`Bố trí: ${cameras.length} camera HX, ${steps} bước = ${minutes} phút cao điểm, behavior bật.`);
console.log('| seed | SPEED | tổng bản ghi |');
console.log('|---|---|---|');
const perSeed = [];
for (const seed of seeds) {
  const found = runOnce(seed, steps);
  const nSpeed = found.filter(v => v.violation_code === 'SPEED').length;
  perSeed.push(nSpeed);
  console.log(`| ${seed} | ${nSpeed} | ${found.length} |`);
}
const avg = perSeed.reduce((a, b) => a + b, 0) / perSeed.length;
console.log(`\nTrung bình SPEED mỗi ${minutes} phút: ${avg.toFixed(2)} (${perSeed.join(', ')})`);