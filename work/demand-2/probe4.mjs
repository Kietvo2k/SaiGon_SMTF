// DEMAND-2 — tĩnh: phân bố pool ban đầu theo bán kính nhu cầu (không chạy sim).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const { buildTrafficNetwork31, createTrafficSim31 } = await import(new URL('../../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { regionPolygon } = await import(new URL('../../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
const { NORTH_DEMAND_32, lockNorthRegion32 } = await import(new URL('../../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const sp = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan: sp });
const { lanes, NL } = net;
const c = createSignalController32({ net, sim: null, mode: 'fixed' });
const sim = createTrafficSim31(net, { signalPlan: sp, controller: c, breakerS: 180, seed: 31031, demand: { ...NORTH_DEMAND_32 } });
lockNorthRegion32(sim, regionPolygon('bac'));
const inside = sim.exportState().insideLane;
const dem = l => { const e = lanes.edge[l], dx = net.sphere[e * 4] - NORTH_DEMAND_32.center[0], dz = net.sphere[e * 4 + 2] - NORTH_DEMAND_32.center[1]; return dx * dx + dz * dz <= NORTH_DEMAND_32.radius_m ** 2; };
let lenIn = 0, lenOut = 0, nIn = 0, nOut = 0;
for (let l = 0; l < NL; l++) { if (!inside[l]) continue; if (dem(l)) { lenIn += lanes.length[l]; nIn++; } else { lenOut += lanes.length[l]; nOut++; } }
console.log(`khu Bắc: ${nIn + nOut} làn, tổng dài ${(lenIn + lenOut) / 1000 | 0} km`);
console.log(`  trong bán kính nhu cầu: ${nIn} làn, ${(lenIn / 1000).toFixed(1)} km (${(100 * lenIn / (lenIn + lenOut)).toFixed(1)} %)`);
console.log(`  ngoài: ${nOut} làn, ${(lenOut / 1000).toFixed(1)} km`);
// Phân bố xe đang hoạt động (sau khi đặt khu, chưa chạy) theo trong/ngoài bán kính.
let aIn = 0, aOut = 0;
for (let i = 0; i < sim.N; i++) { if (!sim.active[i]) continue; if (dem(sim.lane[i])) aIn++; else aOut++; }
console.log(`xe hoạt động: ${aIn + aOut} (trong bán kính ${aIn}, ngoài ${aOut}) → ${(aIn / (aIn + aOut) * 100).toFixed(1)} % trong`);
console.log(`mật độ: trong ${(aIn / lenIn * 1000).toFixed(0)} xe/km, ngoài ${(aOut / lenOut * 1000).toFixed(0)} xe/km`);
// Số làn spawnList trong/ngoài và tổng dài của chúng.
const sl = sim.exportState().spawnList;
let sIn = 0, sOut = 0, sInL = 0, sOutL = 0;
for (const l of sl) { if (dem(l)) { sIn++; sInL += lanes.length[l]; } else { sOut++; sOutL += lanes.length[l]; } }
console.log(`spawnList ${sl.length} làn: trong ${sIn} (${(sInL / 1000).toFixed(1)} km), ngoài ${sOut} (${(sOutL / 1000).toFixed(1)} km)`);
console.log(`tỉ lệ trọng số demW trên spawnList: trong ${(sIn * NORTH_DEMAND_32.spawnBias) / (sIn * NORTH_DEMAND_32.spawnBias + sOut) * 100 | 0} %`);
