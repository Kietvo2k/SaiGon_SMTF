import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDelayTracker32, hxNodeIndices, A1_WINDOW } from '../scripts/a1-metric-32.mjs';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const { buildTrafficNetwork31, createTrafficSim31, STEP, LIGHT_FACTOR } = await import(new URL('../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { DEMAND_BY_HOUR_32 } = await import(new URL('../outputs/hcmc-poc/clock-32.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { regionPolygon } = await import(new URL('../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
const { NORTH_DEMAND_32, lockNorthRegion32 } = await import(new URL('../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const { lanes, arriveGroup, E } = net;
const controller = createSignalController32({ net, sim: null, mode: 'fixed', params: { algorithm: 'max-pressure' } });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: 31031, demand: NORTH_DEMAND_32 });
lockNorthRegion32(sim, regionPolygon('bac'));
sim.setLightFactor(LIGHT_FACTOR.golden); sim.setFraction(DEMAND_BY_HOUR_32[17]);
const tracker = createDelayTracker32({ net, hxNodes: hxNodeIndices(net, nodeMap), window: A1_WINDOW });
let matched = 0, matchPrev = 0, matchCur = 0, unmatched = 0; const reasons = new Map();
let lastSeen = 0;
for (let k = 0; k < 4000; k++) {
  sim.step(); tracker.tick(sim.counters.t, sim);
  for (let r = lastSeen; r < tracker.records.length; r++) {
    const rec = tracker.records[r], i = rec.i;
    if (sim.prevLane[i] >= 0 && lanes.to[sim.prevLane[i]] === rec.node) { matched++; matchPrev++; }
    else if (lanes.to[sim.lane[i]] === rec.node) { matched++; matchCur++; }
    else {
      unmatched++;
      const key = `laneTo=${lanes.to[sim.lane[i]]} recNode=${rec.node} prevLane=${sim.prevLane[i]} prevTo=${sim.prevLane[i] >= 0 ? lanes.to[sim.prevLane[i]] : -1} active=${sim.active[i]}`;
      reasons.set(key, (reasons.get(key) || 0) + 1);
    }
  }
  lastSeen = tracker.records.length;
}
console.log('records total', tracker.records.length, 'matched', matched, 'matchPrev', matchPrev, 'matchCur', matchCur, 'unmatched', unmatched);
console.log('a1 crossings', tracker.result().crossings, 't', sim.counters.t);
const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(top);
