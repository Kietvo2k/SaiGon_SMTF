// Probe dữ liệu thật cho M2a (không commit).
import fs from 'node:fs';
import { regionOf, regionContains } from '../outputs/hcmc-poc/city-region-31.js';

const load = rel => {
  const code = fs.readFileSync(new URL('../outputs/hcmc-poc/' + rel, import.meta.url), 'utf8');
  const win = {};
  new Function('window', code)(win);
  return win;
};
const scene = load('data/scene.js');
const graphWin = load('data/road-graph-31.js');
const D = scene.CITY_DATA;
const G = graphWin.ROAD_GRAPH_31;
console.log('buildings', D.buildings.length, 'roads', D.roads.length, 'graphEdges', G.edges.length, 'graphRoads', G.roads.length);

const types = {};
for (const r of G.roads) types[r.type] = (types[r.type] || 0) + 1;
console.log('types', JSON.stringify(types));

const roadRec = G.roads[0];
console.log('road keys', Object.keys(roadRec).join(','));

// Buildings inside region bac
let inBac = 0, withName = 0;
for (const b of D.buildings) {
  if (regionOf(b.center[0], b.center[1]) === 'bac') { inBac++; if (b.name) withName++; }
}
console.log('buildings in bac', inBac, 'named', withName);

// Roads by region (by their node coords)
const byRegion = {};
for (const r of G.roads) {
  const c = r.center || null;
  const x = c ? c[0] : (r.nodes && r.nodes.length ? null : null);
  if (x === null) continue;
  const reg = regionOf(x, c[1]);
  byRegion[reg] = (byRegion[reg] || 0) + 1;
}
console.log('roads by region(center)', JSON.stringify(byRegion));

// Roads whose nodes are all in bac
const nodeById = new Map(G.nodes.map(n => [n.id, n]));
const MINOR = new Set(['residential', 'service', 'living_street', 'unclassified', 'footway']);
let bacRoads = 0, bacMinor = 0, bacMajor = 0;
for (const r of G.roads) {
  const ns = (r.nodes || []).map(id => nodeById.get(id)).filter(Boolean);
  if (!ns.length) continue;
  const all = ns.every(n => regionContains('bac', n.x, n.z));
  if (!all) continue;
  bacRoads++;
  if (MINOR.has(String(r.type || '').replace(/_link$/, ''))) bacMinor++; else bacMajor++;
}
console.log('roads fully in bac', bacRoads, 'minor', bacMinor, 'major', bacMajor);
