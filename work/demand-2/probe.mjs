// DEMAND-2 — dò nhanh mạng/làn vào nút HX theo nhóm pha (chỉ đọc, không sửa).
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
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const sp = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan: sp });
const idx = new Map(net.G.nodes.map((n, i) => [n.id, i]));
const byId = new Map(nodeMap.map(m => [m.osm_id, m.node_id]));
const hx = nodeMap.map(m => idx.get(m.osm_id)).filter(i => i !== undefined);
for (const h of hx) {
  const nm = byId.get(net.G.nodes[h].id) || net.G.nodes[h].id;
  const ins = [];
  for (let l = 0; l < net.NL; l++) if (net.lanes.to[l] === h) ins.push({ l, st: net.lanes.st[l], g: net.arriveGroup[net.lanes.st[l]], len: Math.round(net.lanes.length[l]), road: G.roads[net.E[net.lanes.edge[l]].road]?.name || null });
  const g0 = ins.filter(x => x.g === 0).length, g1 = ins.filter(x => x.g === 1).length;
  console.log(`${nm}  inLanes=${ins.length}  g0=${g0} g1=${g1}`);
  for (const x of ins) console.log(`    g${x.g} len=${x.len} ${x.road}`);
}
