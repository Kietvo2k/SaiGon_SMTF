// DEMAND-1 (chẩn đoán G2/G3): kiểm tra các làn kẹt nặng có nằm trong spawnList (tái sinh đều, bỏ spawnBias) không.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync('outputs/smart-traffic/backend/app/seed/node_map.json', 'utf8'));
const { buildTrafficNetwork31, createTrafficSim31, STEP, LIGHT_FACTOR } = await import(new URL('../../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { regionPolygon } = await import(new URL('../../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
const { NORTH_DEMAND_32, lockNorthRegion32, SMART_BREAKER_S } = await import(new URL('../../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const { DEMAND_BY_HOUR_32 } = await import(new URL('../../outputs/hcmc-poc/clock-32.js?v=32a', import.meta.url).href);

const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const controller = createSignalController32({ net, sim: null, mode: 'smart', params: { algorithm: 'max-pressure' } });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: SMART_BREAKER_S, seed: 31031, demand: { ...NORTH_DEMAND_32 } });
lockNorthRegion32(sim, regionPolygon('bac'));
sim.setLightFactor(LIGHT_FACTOR.golden);
sim.setFraction(DEMAND_BY_HOUR_32[17]);

const stuck = JSON.parse(fs.readFileSync('work/demand-1/exp', 'utf8')).top_stuck_lanes;
const { lanes, NL } = net;
const spawnSet = new Set(sim.exportState().spawnList);
const inDem = l => {
  const c = net.G.roads?.[0]; // placeholder
  return null;
};
console.log('spawnList size =', spawnSet.size, '/ NL =', NL);
let n = 0;
for (const s of stuck) {
  const isSpawn = spawnSet.has(s.lane);
  if (isSpawn) n++;
  const fromNode = G.nodes[lanes.from[s.lane]], toNode = G.nodes[lanes.to[s.lane]];
  const e = lanes.edge[s.lane];
  const mx = (net.sphere[e * 4] + net.sphere[e * 4 + 1]) / 2, mz = (net.sphere[e * 4 + 2] + net.sphere[e * 4 + 3]) / 2;
  const inside = sim.region ? sim.region.lanes : null;
  const dR = Math.hypot(mx - NORTH_DEMAND_32.center[0], mz - NORTH_DEMAND_32.center[1]).toFixed(0);
  const inDem = dR <= NORTH_DEMAND_32.radius_m;
  const intoHx = nodeMap.some(n => n.osm_id === G.nodes[lanes.to[s.lane]]?.id);
  console.log(`lane ${s.lane} nhóm ${s.group} stuck ${s.stuck_s}s | spawnList=${isSpawn} | vàoHX=${intoHx} | trong bán kính demand=${inDem} (${dR}m) | ${s.road} | ${fromNode?.kind}->${fromNode?.id} => ${toNode?.kind}->${toNode?.id}`);
}
console.log(`\n${n}/${stuck.length} làn kẹt nặng nằm trong spawnList (điểm tái sinh đều).`);

// Phân bố demW trên spawnList: tỉ lệ làn tái sinh trong bán kính demand so với ngoài.
const demandCfg = { cx: NORTH_DEMAND_32.center[0], cz: NORTH_DEMAND_32.center[1], r2: NORTH_DEMAND_32.radius_m ** 2 };
let inR = 0, outR = 0;
for (const l of spawnSet) {
  const e = lanes.edge[l];
  const dx = net.sphere[e * 4] - demandCfg.cx, dz = net.sphere[e * 4 + 2] - demandCfg.cz;
  if (dx * dx + dz * dz <= demandCfg.r2) inR++; else outR++;
}
console.log(`spawnList trong bán kính demand: ${inR} làn (demW=${NORTH_DEMAND_32.spawnBias}), ngoài: ${outR} làn (demW=1)`);