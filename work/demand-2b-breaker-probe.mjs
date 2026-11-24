import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, STEP } from '../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../outputs/hcmc-poc/signal-plan-32.js?v=32a';
import { createSignalController32 } from '../outputs/hcmc-poc/traffic-controller-32.js?v=32a';
import { regionPolygon } from '../outputs/hcmc-poc/city-region-31.js?v=31a';
import { NORTH_DEMAND_32, lockNorthRegion32 } from '../outputs/hcmc-poc/smart-app-32.js?v=32a';
import { DEMAND_BY_HOUR_32 } from '../outputs/hcmc-poc/clock-32.js?v=32a';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway:16,trunk:15,primary:14,secondary:11,tertiary:8,residential:5,living_street:4,service:3.5,unclassified:5,footway:2.5,pedestrian:12,cycleway:2,path:1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type]||4, D.roads[i].lanes*3.1) : WIDTHS[D.roads[i].type]||4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender!=='hide';
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const demand = { ...NORTH_DEMAND_32, congAvoid: 0 };
const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: 31031, demand });
lockNorthRegion32(sim, regionPolygon('bac'));
sim.setLightFactor(1); sim.setFraction(DEMAND_BY_HOUR_32[17]);
// Track gen transitions to detect breaker events
const prevGen = sim.gen.slice();
let totalBreaker = 0;
const breakerCountByCar = new Map(); // car index -> number of breaker events
const steps = Math.round(1800 / STEP);
for (let k = 0; k < steps; k++) {
  sim.step();
  for (let i = 0; i < sim.N; i++) {
    if (sim.gen[i] !== prevGen[i]) {
      // gen changed = respawn happened
      prevGen[i] = sim.gen[i];
      // Check if this was a breaker respawn (can't directly tell from outside, 
      // but we know counters.breakerRespawns increments only on breaker)
      // Actually we can't distinguish breaker vs normal respawn from outside.
      // Let's just count gen changes per car.
      breakerCountByCar.set(i, (breakerCountByCar.get(i) || 0) + 1);
    }
  }
}
console.log('total breaker_respawns:', sim.counters.breakerRespawns);
console.log('total respawns:', sim.counters.respawns);
console.log('unique cars with gen change:', breakerCountByCar.size);
const sorted = [...breakerCountByCar.entries()].sort((a,b)=>b[1]-a[1]);
console.log('top 20 cars by gen changes:', sorted.slice(0,20).map(([i,n])=>`${i}:${n}`).join(', '));
const dist = {};
for (const [,n] of breakerCountByCar) dist[n] = (dist[n]||0)+1;
console.log('gen-change distribution:', Object.entries(dist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}x:${v}`).join(', '));