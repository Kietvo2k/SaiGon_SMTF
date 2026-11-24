import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const D = JSON.parse(fs.readFileSync(path.join(root, 'data/scene.js'), 'utf8').replace(/^window\.CITY_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const bbox = ring => ring.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const L = [1124, -1768];
const near = [];
for (const b of D.buildings) {
  for (const ring of b.r || []) {
    const bb = bbox(ring);
    const cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
    if (Math.hypot(cx - L[0], cz - L[1]) <= 180) {
      near.push({ id: b.id, name: b.name, h: b.h, min: b.min, q: b.q, levels: b.levels, cx: +cx.toFixed(1), cz: +cz.toFixed(1), w: +(bb[2] - bb[0]).toFixed(1), d: +(bb[3] - bb[1]).toFixed(1), rings: b.r.length, keys: Object.keys(b) });
      break;
    }
  }
}
near.sort((a, b) => b.h - a.h);
console.log('near L81:', near.length);
for (const n of near.slice(0, 25)) console.log(JSON.stringify(n));
console.log('\n--- các building cao > 100 trong bán kính 400 m ---');
const hi = [];
for (const b of D.buildings) {
  if (!(b.h > 60)) continue;
  for (const ring of b.r || []) {
    const bb = bbox(ring); const cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
    if (Math.hypot(cx - L[0], cz - L[1]) <= 400) { hi.push({ id: b.id, h: b.h, min: b.min, q: b.q, levels: b.levels, cx: +cx.toFixed(1), cz: +cz.toFixed(1), w: +(bb[2] - bb[0]).toFixed(1), d: +(bb[3] - bb[1]).toFixed(1) }); break; }
  }
}
hi.sort((a, b) => b.h - a.h);
for (const n of hi) console.log(JSON.stringify(n));
