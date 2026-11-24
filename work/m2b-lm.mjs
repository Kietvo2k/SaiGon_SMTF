import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const D = JSON.parse(rd('data/scene.js').replace(/^window\.CITY_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const R = JSON.parse(rd('data/signature-registry-31.js').replace(/^window\.SIGNATURE_REGISTRY_31\s*=\s*/, '').replace(/;\s*$/, ''));

const regById = new Map();
for (const e of R.entries) for (const id of e.ids || []) regById.set(Number(id), (regById.get(Number(id)) || []).concat(e.key));

const bbox = ring => ring.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const centre = ring => { const b = bbox(ring); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
const area = ring => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]); return Math.abs(a / 2); };

const want = ['place-landmark-81', 'extra-landmark-81', 'hero-envelope-801710792', 'hero-envelope-2000032897', 'hero-envelope-39598465', 'place-marina-central-240-m', 'place-grand-marina-4-thap', 'marina-central-tower', 'grand-marina-residences'];
const ids = new Set();
for (const e of R.entries) if (want.includes(e.key)) for (const id of e.ids || []) ids.add(Number(id));

console.log('=== building entries ===');
for (const id of ids) {
  const b = D.buildings.find(x => x.id === id);
  if (!b) { console.log(id, regById.get(id), 'KHÔNG có trong CITY_DATA'); continue; }
  const rings = b.r || [];
  const info = rings.map((ring, i) => ({ i, n: ring.length, A: +area(ring).toFixed(1), bbox: bbox(ring).map(v => +v.toFixed(1)) }));
  console.log(`id=${id} keys=${regById.get(id)?.join(',')} h=${b.h} min=${b.min} q=${b.q} levels=${b.levels} rings=${rings.length}`);
  for (const it of info) console.log('   ring', it.i, 'n=' + it.n, 'A=' + it.A, 'bbox=' + JSON.stringify(it.bbox), JSON.stringify(rings[it.i]).slice(0, 400));
}

console.log('\n=== vị trí Landmark 81 so với vùng bac (city-region-31.js) ===');
