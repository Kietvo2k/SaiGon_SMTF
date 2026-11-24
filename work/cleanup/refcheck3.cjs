// Precise resolver: edges from SURVIVING tracked files into DELETE-ALL files.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const all = fs.readFileSync(path.join(__dirname, 'DELETE-ALL.txt'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(p => path.resolve(root, p));
const tset = new Set(all);
const rel = p => path.relative(root, p).split(path.sep).join('/');

// surviving tracked text files (from git ls-files)
const tracked = require('child_process').execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const TEXT = /\.(js|mjs|cjs|html|css|json|md|py|ps1|sh|txt|ipynb)$/i;
const survive = tracked.filter(p => TEXT.test(p) && !tset.has(path.resolve(root, p)) && fs.existsSync(path.join(root, p)));

const TOKEN = /[A-Za-z0-9_\-./]+\.(?:js|mjs|cjs|json|html|css|jpg|jpeg|png|glb|txt|tif|webp|zip)\b/g;
const edges = new Map();
for (const r of survive) {
  const f = path.join(root, r);
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const dir = path.dirname(f);
  for (const m of txt.matchAll(TOKEN)) {
    const tok = m[0];
    const bases = [dir, root, path.join(root, 'outputs/hcmc-poc'), path.join(root, 'outputs'), path.join(root, 'research'), path.join(root, 'scripts')];
    for (const b of bases) {
      const c = path.resolve(b, tok);
      if (tset.has(c)) {
        const k = rel(c);
        if (!edges.has(k)) edges.set(k, new Set());
        edges.get(k).add(r);
      }
    }
    if (!tok.includes('/')) for (const t of all) if (path.basename(t) === tok) { const k = rel(t); if (!edges.has(k)) edges.set(k, new Set()); edges.get(k).add(r); }
  }
}
for (const k of [...edges.keys()].sort()) console.log(`${k}\t<= ${[...edges.get(k)].sort().join(', ')}`);
console.log(`edges: ${edges.size}, surviving scanned: ${survive.length}`);
