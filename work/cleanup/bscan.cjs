// Path-aware reference scan for Group B candidates.
// Scope = current app runtime: webgpu-materials-24.{html,js,css}, flood-ui-25.js,
// data/*.js loaded by the html, *-2[4-9].js/css, *-3[0-2].js/css, qa-*-3[12].cjs,
// scripts/*.py validators, outputs/shared/**.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.cwd();
const CL = path.join(ROOT, 'work', 'cleanup');

const readNul = (f) => fs.readFileSync(path.join(CL, f), 'utf8').split('\0').filter(Boolean);
const readLines = (f) => fs.readFileSync(path.join(CL, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

const tracked = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 1 << 30 }).toString().split('\0').filter(Boolean);
const trackedSet = new Set(tracked);

// Candidate delete set = FINAL-B minus index.html, plus disputed false-positives
const finB = readNul('FINAL-B.list').filter(f => f !== 'outputs/hcmc-poc/index.html');
const disputed = [
  'outputs/hcmc-poc/bridge-detail.js',
  'outputs/hcmc-poc/data/catalog.js',
  'outputs/hcmc-poc/semantic-materials-08.js',
  'outputs/hcmc-poc/tiles/rp-r2c3/provenance.json',
];
const candidates = [...new Set([...finB, ...disputed])];
const delSet = new Set(candidates);

// Build refScope
const scope = new Set();
function add(p) { if (trackedSet.has(p)) scope.add(p); }
add('outputs/hcmc-poc/webgpu-materials-24.html');
add('outputs/hcmc-poc/webgpu-materials-24.js');
add('outputs/hcmc-poc/webgpu-materials-24.css');
add('outputs/hcmc-poc/flood-ui-25.js');
// html script/link refs
const html = fs.readFileSync('outputs/hcmc-poc/webgpu-materials-24.html', 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"?#]+)/g)) {
  const p = path.posix.normalize(path.posix.join('outputs/hcmc-poc', m[1]));
  add(p);
}
// modules
for (const f of tracked) {
  if (!f.startsWith('outputs/hcmc-poc/')) continue;
  const b = path.posix.basename(f);
  if (/^[^/]*-2[4-9]\.(js|css)$/.test(b) || /^[^/]*-3[0-2]\.(js|css)$/.test(b)) add(f);
  if (/^scripts\/qa-.*-3[12]\.cjs$/.test(f.slice('outputs/hcmc-poc/'.length))) add(f);
  if (/^scripts\/.*\.py$/.test(f.slice('outputs/hcmc-poc/'.length))) add(f);
}
for (const f of tracked) if (f.startsWith('outputs/shared/')) add(f);
// excluding deleted files themselves
for (const c of candidates) scope.delete(c);

// transitive: follow imports from scoped js modules
const textExt = /\.(js|mjs|cjs|html|css|py)$/i;
let grew = true;
while (grew) {
  grew = false;
  for (const F of [...scope]) {
    let txt; try { txt = fs.readFileSync(F, 'utf8'); } catch { continue; }
    const dir = path.posix.dirname(F);
    for (const m of txt.matchAll(/(?:from|import|require\()\s*['"]([^'"]+)['"]/g)) {
      const t = m[1];
      if (!t.startsWith('.') && !t.startsWith('/')) continue;
      const r = path.posix.normalize(path.posix.join(dir, t));
      const cands = [r, r + '.js', r + '.mjs', r + '.cjs'];
      for (const cc of cands) if (trackedSet.has(cc) && !scope.has(cc) && !delSet.has(cc)) { scope.add(cc); grew = true; }
    }
    // <script src> and href in html
    if (/\.html$/i.test(F)) {
      for (const m of txt.matchAll(/(?:src|href)="([^"?#]+)/g)) {
        const r = path.posix.normalize(path.posix.join(dir, m[1]));
        if (trackedSet.has(r) && !scope.has(r) && !delSet.has(r)) { scope.add(r); grew = true; }
      }
    }
  }
}

// tokens referencing candidates
const byBase = new Map();
for (const f of tracked) {
  const b = path.posix.basename(f);
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(f);
}
const tokenRe = /[A-Za-z0-9_@.\-\/]+\.[A-Za-z0-9]{1,8}/g;
const refs = new Map();
for (const c of candidates) refs.set(c, new Set());
for (const F of scope) {
  if (!textExt.test(F)) continue;
  let txt; try { txt = fs.readFileSync(F, 'utf8'); } catch { continue; }
  if (txt.length > 8e6) txt = txt.slice(0, 8e6);
  const dir = path.posix.dirname(F);
  for (const t0 of new Set(txt.match(tokenRe) || [])) {
    const t = t0.replace(/^\.?\//, '');
    const resolved = new Set([
      path.posix.normalize(t),
      path.posix.normalize(path.posix.join(dir, t)),
      path.posix.normalize(path.posix.join('outputs/hcmc-poc', t)),
      path.posix.normalize(path.posix.join('outputs', t)),
    ]);
    for (const r of resolved) if (delSet.has(r)) refs.get(r).add(F);
  }
}

console.log('refScope size:', scope.size);
const keep = [], del = [];
for (const c of candidates) {
  const s = [...refs.get(c)];
  if (s.length) keep.push([c, s]); else del.push(c);
}
console.log('\n=== DEL (' + del.length + ') ===');
del.slice().sort().forEach(f => console.log('  ' + f));
console.log('\n=== KEEP via reference (' + keep.length + ') ===');
keep.forEach(([c, s]) => console.log('  ' + c + '  <= ' + s.join(', ')));
fs.writeFileSync(path.join(CL, 'bscan-del.list'), del.sort().join('\0') + '\0', 'utf8');
fs.writeFileSync(path.join(CL, 'bscan-keep.json'), JSON.stringify(Object.fromEntries(keep), null, 1), 'utf8');
