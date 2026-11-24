// DEMAND-2 — dò chuỗi làn xuôi từ các làn kẹt nặng (chỉ đọc mạng).
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
const { regionPolygon, regionTrafficPayload } = await import(new URL('../../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
const { NORTH_DEMAND_32, NORTH_BRIDGE_OPTS_32, lockNorthRegion32 } = await import(new URL('../../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const sp = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan: sp });
const { lanes, NL, E, G: GG, Rz, lanesOfSt, laneCountOfSt } = net;
const byId = new Map(nodeMap.map(m => [m.osm_id, m.node_id]));
const sim = (() => { const c = createSignalController32({ net, sim: null, mode: 'fixed' }); const s = createTrafficSim31(net, { signalPlan: sp, controller: c, breakerS: 180, seed: 31031, demand: { ...NORTH_DEMAND_32 } }); lockNorthRegion32(s, regionPolygon('bac')); return s; })();
const inside = sim.exportState().insideLane;
const stuck = JSON.parse(fs.readFileSync('work/demand-1/exp', 'utf8')).top_stuck_lanes;
for (const s of stuck.slice(0, 4)) {
  let l = s.lane;
  const chain = [];
  for (let hop = 0; hop < 6 && l >= 0; hop++) {
    const to = lanes.to[l];
    const outs = [];
    for (let l2 = 0; l2 < NL; l2++) if (lanes.from[l2] === to) outs.push(l2);
    chain.push(`L${l}(${G.roads[E[lanes.edge[l]].road]?.name || '?'},${Math.round(lanes.length[l])}m,${inside[l] ? 'TRONG' : 'NGOÀI'})`);
    if (!outs.length) { chain.push(`  → nút ${byId.get(GG.nodes[to].id) || to.kind}->${to.id}: HẾT LÀN RA`); break; }
    outs.sort((a, b) => lanes.length[b] - lanes.length[a]);
    const nxt = outs.find(x => inside[x]);
    l = nxt !== undefined ? nxt : -1;
    if (l < 0) { chain.push(`  → nút ${byId.get(GG.nodes[to].id) || to.kind}->${to.id}: mọi làn ra đều NGOÀI khu`); break; }
  }
  console.log(chain.join('\n'));
  console.log('');
}
