import fs from 'node:fs';
import { regionOf } from '../outputs/hcmc-poc/city-region-31.js';
const load = rel => { const code = fs.readFileSync(new URL('../outputs/hcmc-poc/' + rel, import.meta.url), 'utf8'); const win = {}; new Function('window', code)(win); return win; };
const D = load('data/scene.js').CITY_DATA;
const G = load('data/road-graph-31.js').ROAD_GRAPH_31;
console.log('D.roads[0] keys', Object.keys(D.roads[0]).join(','));
console.log('G.roads[0] keys', Object.keys(G.roads[0]).join(','));
console.log('sample D.roads[0]', JSON.stringify(D.roads[0]).slice(0, 300));
let sig = 0, sigNorth = 0;
for (let i = 0; i < D.roads.length; i++) {
  const s = D.roads[i].signature || G.roads[i].signature;
  if (!s) continue; sig++;
  const pts = D.roads[i].c || [];
  if (pts.length && pts.every(p => regionOf(p[0], p[1]) === 'bac')) sigNorth++;
}
console.log('signature roads', sig, 'north', sigNorth);
console.log('G.roads[0].signature', G.roads[0].signature, 'D.roads[0].signature', D.roads[0].signature);
