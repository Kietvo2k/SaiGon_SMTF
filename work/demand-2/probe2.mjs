// DEMAND-2 — dò cấu trúc các làn kẹt nặng (chỉ đọc mạng, không chạy sim).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const { buildTrafficNetwork31 } = await import(new URL('../../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { regionPolygon } = await import(new URL('../../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
const { NORTH_DEMAND_32, lockNorthRegion32, SMART_BREAKER_S } = await import(new URL('../../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { DEMAND_BY_HOUR_32 } = await import(new URL('../../outputs/hcmc-poc/clock-32.js?v=32a', import.meta.url).href);
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const sp = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan: sp });
const { lanes, NL, E, G: GG, Rz } = net;
const byId = new Map(nodeMap.map(m => [m.osm_id, m.node_id]));
const stuck = JSON.parse(fs.readFileSync('work/demand-1/exp', 'utf8')).top_stuck_lanes;
for (const s of stuck) {
  const l = s.lane, e = lanes.edge[l];
  const from = GG.nodes[lanes.from[l]], to = GG.nodes[lanes.to[l]];
  const mid = [(net.sphere[e * 4] + net.sphere[e * 4 + 1]) / 2, (net.sphere[e * 4 + 2] + net.sphere[e * 4 + 3]) / 2];
  const dC = Math.hypot(mid[0] - NORTH_DEMAND_32.center[0], mid[1] - NORTH_DEMAND_32.center[1]).toFixed(0);
  // làn ra từ nút đích
  const outs = [];
  for (let l2 = 0; l2 < NL; l2++) if (lanes.from[l2] === lanes.to[l]) outs.push(`${l2}:${G.roads[E[lanes.edge[l2]].road]?.name || '?'}:${Math.round(lanes.length[l2])}m:g${net.arriveGroup[lanes.st[l2]]}`);
  console.log(`lane ${l} ${s.road} len=${Math.round(lanes.length[l])}m s=${s.stuck_s} from=${from.kind}->${from.id} to=${byId.get(to.id) || to.kind}->${to.id} Rz=${Math.round(Rz[lanes.to[l]] || 0)} tâm ${dC}m`);
  console.log(`    làn ra từ nút đích (${outs.length}): ${outs.join(' | ')}`);
}
