// DUMP: vị trí phát hiện bình quân theo từng nút giao lộ (để đặt camera gần chỗ xe thật sự bị vi phạm).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, createTrafficGeometry31 } from '../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a';
import { createPerception32 } from '../outputs/hcmc-poc/violation-perception-32.js?v=32a';
import { restrictedNodeIndices32, ALL_CODES_32 } from '../outputs/hcmc-poc/violation-rules-32.js?v=32a';
import { buildSignalPlan32 } from '../outputs/hcmc-poc/signal-plan-32.js?v=32a';
import { createSignalController32 } from '../outputs/hcmc-poc/traffic-controller-32.js?v=32a';
import { buildZones32 } from '../outputs/hcmc-poc/violation-zones-32.js?v=32a';
import { createWrongWayAgents32 } from '../outputs/hcmc-poc/wrong-way-32.js?v=32a';
import { PEAK_HANG_XANH_DEMAND } from '../scripts/a1-metric-32.mjs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

const cameras = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/cameras.json'), 'utf8'))
  .filter(c => String(c.camera_id).startsWith('CAM-HX'));
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const restrictedSim = restrictedNodeIndices32(G, nodeMap);
const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
const zones = buildZones32({ net, cameras });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED, demand: PEAK_HANG_XANH_DEMAND,
  behavior: { restrictedNodes: restrictedSim, parkS0: zones.parkS0, parkS1: zones.parkS1 } });
const ghosts = zones.wrongWay ? createWrongWayAgents32({ zone: zones.wrongWay, geo: createTrafficGeometry31(net, sim) }) : null;
const per = createPerception32({ net, sim, controller, nodeMap, cameras, zones, ghosts, codes: ALL_CODES_32, restrictedNodes: restrictedSim });

const found = [];
for (let k = 0; k < 4800; k++) { sim.step(); if (k % 5 === 0) { per.scan(sim.counters.t); found.push(...per.drainViolations()); } }

const byNode = {};
for (const v of found) {
  if (!v._pose) continue;
  const r = byNode[v.node_id] || (byNode[v.node_id] = { n: 0, sx: 0, sz: 0, sx2: 0, sz2: 0, codes: {}, conf: 0, nw: 0, dist: 0 });
  r.n++; r.sx += v._pose.x; r.sz += v._pose.z; r.sx2 += v._pose.x ** 2; r.sz2 += v._pose.z ** 2;
  r.conf += v.confidence; r.nw += v.status === 'new' ? 1 : 0; r.dist += v.detection.distance_m;
  r.codes[v.violation_code] = (r.codes[v.violation_code] || 0) + 1;
}
for (const [nid, r] of Object.entries(byNode)) {
  const mx = r.sx / r.n, mz = r.sz / r.n;
  console.log(JSON.stringify({ node: nid, n: r.n, mx: +mx.toFixed(1), mz: +mz.toFixed(1),
    sd: +Math.sqrt(r.sx2 / r.n - mx * mx + r.sz2 / r.n - mz * mz).toFixed(1),
    newRate: +(100 * r.nw / r.n).toFixed(0), conf: +(r.conf / r.n).toFixed(3), dist: +(r.dist / r.n).toFixed(1), codes: r.codes }));
}