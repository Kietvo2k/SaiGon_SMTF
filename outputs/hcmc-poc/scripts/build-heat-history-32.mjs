// build-heat-history-32.mjs - dựng lịch sử bản đồ nhiệt theo giờ OFFLINE (M4b2).
// Chạy sim headless khu Bắc: mỗi giờ đồng hồ chạy 10 phút sim với tỉ lệ xe (DEMAND_BY_HOUR_32) và nhóm ánh sáng
// (lightOf32 → LIGHT_FACTOR) của giờ đó, ghi mức nhiệt heat-32 (alpha 0,25, mẫu 1 s) → trung bình theo giờ × cạnh.
// Chỉ giữ cạnh trong khu và hạng ≥ tertiary. Đầu ra: outputs/hcmc-poc/data/heat-history-32.json (định dạng: heat-live-32.js expandHeatHistory32).
// Chạy: node outputs/hcmc-poc/scripts/build-heat-history-32.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTrafficNetwork31, createTrafficSim31, LIGHT_FACTOR, SEED } from '../city-traffic-sim-31.js';
import { buildSignalPlan32 } from '../signal-plan-32.js';
import { createSignalController32 } from '../traffic-controller-32.js';
import { regionTrafficPayload } from '../city-region-31.js';
import { createHeat32 } from '../heat-32.js';
import { collectSamples32, speedLimitsOf32, ALPHA_32, DAY_START_HOUR_32 } from '../heat-live-32.js';
import { DEMAND_BY_HOUR_32, lightOf32 } from '../clock-32.js';

const HCMC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(HCMC, '..', '..');
const MIN_PER_HOUR = 10;      // phút sim chạy cho mỗi giờ
const MIN_RANK = 2;           // ≥ tertiary
const WARM_STEPS = 600 * 10;  // 10 phút sim khởi động (không ghi)

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(HCMC, 'data', 'road-graph-31.js'));
require(path.join(HCMC, 'data', 'scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', 'smart-traffic', 'backend', 'app', 'seed', 'node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const controller = createSignalController32({ net, sim: null, mode: 'smart' });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED });
sim.setRegion(regionTrafficPayload('bac'));

// Cạnh giữ lại: có làn trong khu, hạng ≥ tertiary, đủ hình học.
const inLane = new Uint8Array(net.NE);
for (let l = 0; l < net.NL; l++) if (sim.insideLaneOf(l) && net.lanes.rank[l] >= MIN_RANK) inLane[net.lanes.edge[l]] = 1;
const keep = [];
for (let e = 0; e < net.NE; e++) if (inLane[e] && net.E[e].c.length >= 4) keep.push(e);

const heat = createHeat32({ edgeCount: net.NE, edgeSpeedLimit: speedLimitsOf32(net), alpha: ALPHA_32, dayStartHour: DAY_START_HOUR_32 });
const setHour = h => { sim.setFraction(DEMAND_BY_HOUR_32[h]); sim.setLightFactor(LIGHT_FACTOR[lightOf32(h)]); };

setHour(16);
for (let k = 0; k < WARM_STEPS; k++) sim.step();

const t0 = Date.now();
for (let h = 0; h < 24; h++) {
  setHour(h);
  const tHeat0 = h * 3600 - DAY_START_HOUR_32 * 3600;   // giây giờ heat: 06:00 = 0
  for (let k = 0; k < MIN_PER_HOUR * 60; k++) {
    for (let j = 0; j < 10; j++) sim.step();              // 1 s sim
    heat.ingest(tHeat0 + k, collectSamples32(sim, net));
  }
}
const hourly = heat.hourly();
const K = keep.length;
const levels = new Array(24 * K);
for (let h = 0; h < 24; h++) for (let k = 0; k < K; k++) levels[h * K + k] = Math.round(hourly[h * net.NE + keep[k]] * 100) / 100;

const out = {
  version: 'heat-history-32a',
  ne: net.NE,
  hours: 24,
  minutesPerHour: MIN_PER_HOUR,
  region: 'bac',
  minRank: MIN_RANK,
  seed: SEED,
  method: 'chạy sim headless 10 phút sim mỗi giờ với tỉ lệ và nhóm ánh sáng của giờ đó; mức nhiệt heat-32 (alpha 0,25) trung bình theo giờ',
  edges: keep,
  levels
};
const file = path.join(HCMC, 'data', 'heat-history-32.json');
fs.writeFileSync(file, JSON.stringify(out));
const bytes = fs.statSync(file).size;
const byHour = Array.from({ length: 24 }, (_, h) => {
  let s = 0; for (let k = 0; k < K; k++) s += levels[h * K + k];
  return (s / Math.max(1, K)).toFixed(3);
});
console.log(`cạnh giữ: ${K} · NE: ${net.NE} · kích thước: ${(bytes / 1024).toFixed(0)} KB · ${Date.now() - t0} ms`);
console.log('mức TB theo giờ 00–23:', byHour.join(' '));
if (bytes >= 2 * 1024 * 1024) { console.error('lỗi: file vượt 2 MB'); process.exit(1); }
