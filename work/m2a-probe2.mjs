// Probe 2: số nhà khu Bắc giữ được theo ngưỡng 40 m tới tim đường trunk/primary/secondary.
import fs from 'node:fs';
import { regionOf } from '../outputs/hcmc-poc/city-region-31.js';

const load = rel => {
  const code = fs.readFileSync(new URL('../outputs/hcmc-poc/' + rel, import.meta.url), 'utf8');
  const win = {};
  new Function('window', code)(win);
  return win;
};
const scene = load('data/scene.js');
const graphWin = load('data/road-graph-31.js');
const regWin = load('data/signature-registry-31.js');
const D = scene.CITY_DATA;
const G = graphWin.ROAD_GRAPH_31;
const REG = regWin.SIGNATURE_REGISTRY_31;

const sigIds = new Set();
for (const e of (REG.entries || [])) for (const id of (e.ids || [])) sigIds.add(Number(id));
console.log('signature entries', (REG.entries || []).length, 'ids', sigIds.size);

const MAJOR = new Set(['trunk', 'primary', 'secondary']);
const CELL = 100;
const grid = new Map();
const key = (i, j) => i * 100000 + j;
const addSeg = (x1, z1, x2, z2) => {
  const i0 = Math.floor(Math.min(x1, x2) / CELL), i1 = Math.floor(Math.max(x1, x2) / CELL);
  const j0 = Math.floor(Math.min(z1, z2) / CELL), j1 = Math.floor(Math.max(z1, z2) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = key(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([x1, z1, x2, z2]);
  }
};
let majorRoads = 0, segs = 0;
const majorRoadIdx = new Set();
for (let i = 0; i < G.roads.length; i++) {
  const t = String(G.roads[i].type || '').replace(/_link$/, '');
  if (MAJOR.has(t)) { majorRoads++; majorRoadIdx.add(i); }
}
for (const e of G.edges) {
  if (!majorRoadIdx.has(e.road)) continue;
  const c = e.c || [];
  for (let k = 0; k + 3 < c.length; k += 2) {
    addSeg(c[k], c[k + 1], c[k + 2], c[k + 3]); segs++;
  }
}
console.log('major roads', majorRoads, 'segs', segs, 'cells', grid.size);

const distToMajor = (x, z) => {
  let best = Infinity;
  const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    const a = grid.get(key(i, j)); if (!a) continue;
    for (const [x1, z1, x2, z2] of a) {
      const sx = x2 - x1, sz = z2 - z1, l = sx * sx + sz * sz;
      const t = l ? Math.max(0, Math.min(1, ((x - x1) * sx + (z - z1) * sz) / l)) : 0;
      const d = Math.hypot(x1 + sx * t - x, z1 + sz * t - z);
      if (d < best) best = d;
    }
  }
  return best;
};

for (const limit of [25, 40, 60]) {
  let inBac = 0, kinds = 0, kept = 0, sig = 0;
  for (const b of D.buildings) {
    if (regionOf(b.center[0], b.center[1]) !== 'bac') continue;
    inBac++;
    if (sigIds.has(Number(b.id))) { sig++; continue; }
    kinds++;
    if (distToMajor(b.center[0], b.center[1]) <= limit) kept++;
  }
  console.log(`limit ${limit} m: trong khu bắc ${inBac}, signature ${sig}, nhà thường ${kinds}, giữ ${kept} (${(kept / kinds * 100).toFixed(1)}% nhà thường, ${(kept / inBac * 100).toFixed(1)}% tổng)`);
}
