// Chẩn đoán STATION-b: vì sao tỉ lệ `new` thấp với 10 camera? In thống kê từng thành phần confidence.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, createTrafficGeometry31 } from '../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a';
import { createPerception32, CONF_STATUS_MIN_32, OCR_STATUS_MIN_32, CONF_WEIGHTS_32, DIST_FALLOFF_POW_32, SIZE_IDEAL_PX_32 } from '../outputs/hcmc-poc/violation-perception-32.js?v=32a';
import { restrictedNodeIndices32, RESTRICTED_NODE_IDS_32, ALL_CODES_32 } from '../outputs/hcmc-poc/violation-rules-32.js?v=32a';
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

const nw = found.filter(v => v.status === 'new');
console.log(`tổng ${found.length}, new ${nw.length} (${(100 * nw.length / found.length).toFixed(1)} %)`);

const stats = (arr) => {
  const avg = k => arr.length ? (arr.reduce((s, v) => s + k(v), 0) / arr.length) : 0;
  return { n: arr.length, conf: avg(v => v.confidence), ocr: avg(v => v.ocr_confidence), dist: avg(v => v.distance_m ?? v.distance ?? -1), px: avg(v => v.veh_px ?? -1), view: avg(v => v.view_cos ?? -1), occl: avg(v => v.occluders ?? -1) };
};
console.log('new          ', JSON.stringify(stats(nw)));
console.log('needs_review ', JSON.stringify(stats(found.filter(v => v.status === 'needs_review'))));

// Phân rã: thiếu bao nhiêu ở mỗi thành phần để đạt 0,85
const byCode = {};
for (const v of found) {
  const r = byCode[v.violation_code] || (byCode[v.violation_code] = { n: 0, nw: 0, conf: 0, ocr: 0, dist: 0 });
  r.n++; if (v.status === 'new') r.nw++;
  r.conf += v.confidence; r.ocr += v.ocr_confidence; r.dist += (v.distance_m ?? 0);
}
for (const [c, r] of Object.entries(byCode)) console.log(c, JSON.stringify({ n: r.n, nw: r.nw, conf: +(r.conf / r.n).toFixed(3), ocr: +(r.ocr / r.n).toFixed(3), dist: +(r.dist / r.n).toFixed(1) }));

// in 5 bản ghi needs_review đầu kèm thành phần
console.log('mẫu needs_review:');
for (const v of found.filter(v => v.status === 'needs_review').slice(0, 8)) console.log(JSON.stringify(v));


