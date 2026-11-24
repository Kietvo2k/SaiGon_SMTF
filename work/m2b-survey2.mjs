// M2b survey 2: moi way bridge trong/gan khu bac (khong commit).
import fs from 'node:fs';
const dir = 'outputs/hcmc-poc';
const R = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(dir + '/city-region-31.js', 'utf8')));
const scene = JSON.parse(fs.readFileSync(dir + '/data/scene.js', 'utf8').replace(/^[^=]*=/, '').replace(/;\s*$/, ''));
const g = JSON.parse(fs.readFileSync(dir + '/data/road-graph-31.js', 'utf8').replace(/^[^=]*=/, '').replace(/;\s*$/, ''));
const gById = new Map(g.roads.map(r => [r.id, r]));
const bac = R.regionById('bac');
function distToBac(x, z) {
  let best = Infinity; const p = bac.polygon;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], sx = b[0] - a[0], sz = b[1] - a[1], l = sx * sx + sz * sz;
    const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / l)) : 0;
    best = Math.min(best, Math.hypot(a[0] + sx * t - x, a[1] + sz * t - z));
  }
  return best;
}
const seen = new Map();
for (const r of scene.roads) {
  if (!r.bridge) continue;
  const pts = r.c || []; if (!pts.length) continue;
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, z = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const region = R.regionOf(x, z), d = distToBac(x, z);
  if (region !== 'bac' && d > 250) continue;
  const key = r.name || ('way ' + r.id);
  const rec = seen.get(key) || { name: key, ids: [], region, d: Math.round(d), cls: gById.get(r.id)?.elevationClass, type: r.type, c: [Math.round(x), Math.round(z)] };
  rec.ids.push(r.id); rec.d = Math.min(rec.d, Math.round(d));
  seen.set(key, rec);
}
for (const rec of [...seen.values()].sort((a, b) => a.d - b.d)) {
  console.log(`${rec.d}m | ${rec.name} | ${rec.region} | cls=${rec.cls} type=${rec.type} | c=${rec.c} | ids=${rec.ids.join(',')}`);
}
