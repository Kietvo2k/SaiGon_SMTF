// M2b survey: liet ke muc signature registry trong/gan khu bac. Khong commit.
import fs from 'node:fs';
const dir = 'outputs/hcmc-poc';
const regionSrc = fs.readFileSync(dir + '/city-region-31.js', 'utf8');
const R = await import('data:text/javascript,' + encodeURIComponent(regionSrc));

const regSrc = fs.readFileSync(dir + '/data/signature-registry-31.js', 'utf8');
const reg = JSON.parse(regSrc.slice(regSrc.indexOf('=') + 1).replace(/;\s*$/, ''));
const sceneSrc = fs.readFileSync(dir + '/data/scene.js', 'utf8');
const scene = JSON.parse(sceneSrc.slice(sceneSrc.indexOf('=') + 1).replace(/;\s*$/, ''));

const bById = new Map(scene.buildings.map(b => [b.id, b]));
const rById = new Map(scene.roads.map(r => [r.id, r]));

function centerOf(ids, kind) {
  const pts = [];
  for (const id of ids) {
    const o = kind === 'building' ? bById.get(id) : rById.get(id);
    if (!o) continue;
    if (kind === 'building') pts.push(o.center);
    else for (const p of (o.c || [])) pts.push(p);
  }
  if (!pts.length) return null;
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const z = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
}

const bac = R.regionById('bac');
function distToBac(x, z) {
  let best = Infinity;
  const p = bac.polygon;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], sx = b[0] - a[0], sz = b[1] - a[1];
    const l = sx * sx + sz * sz;
    const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / l)) : 0;
    best = Math.min(best, Math.hypot(a[0] + sx * t - x, a[1] + sz * t - z));
  }
  return best;
}

const out = [];
for (const e of reg.entries) {
  if (e.zone) continue;
  const kind = e.kind === 'building' ? 'building' : (e.kind === 'bridge' || e.kind === 'road') ? 'road' : null;
  if (!kind) continue;
  const c = centerOf(e.ids, kind);
  if (!c) { out.push({ ...pick(e), center: null, note: 'khong co toa do' }); continue; }
  const region = R.regionOf(c[0], c[1]);
  const d = distToBac(c[0], c[1]);
  out.push({ ...pick(e), center: c, region, distBac: Math.round(d) });
}
function pick(e) { return { kind: e.kind, group: e.group, label: e.label || e.key, ids: e.ids, source: e.source }; }

const near = out.filter(o => o.region === 'bac' || (o.distBac !== undefined && o.distBac <= 250));
console.log('== TRONG bac hoac <=250m ==');
for (const o of near.sort((a, b) => (a.distBac ?? 0) - (b.distBac ?? 0))) {
  console.log(`${o.kind} | ${o.label} | ${o.group} | center=${o.center} region=${o.region} dBac=${o.distBac} | ${o.source}`);
}
console.log('\n== TAT CA (de doi chieu) ==');
for (const o of out) console.log(`${o.kind} | ${o.label} | region=${o.region} dBac=${o.distBac} | center=${o.center}`);
