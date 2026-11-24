// Precise, boundary-aware reference resolver for the 115 overlap files.
// Read-only. Resolves file-like tokens against real paths.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const targets = fs.readFileSync(path.join(__dirname, 'overlap.txt'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(p => path.resolve(root, p));
const tset = new Set(targets);

const rel = p => path.relative(root, p).split(path.sep).join('/');
const norm = p => path.resolve(p).toLowerCase();

const TEXT = /\.(js|mjs|cjs|html|css|json|md|py|ps1|sh|txt|ipynb)$/i;

function walk(dir, out) {
  let es;
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.venv', 'vendor'].includes(e.name)) continue;
      walk(p, out);
    } else if (TEXT.test(e.name)) out.push(p);
  }
}

const files = [];
for (const d of ['outputs/hcmc-poc', 'outputs/shared', 'scripts', 'outputs/smart-traffic']) {
  const abs = path.join(root, d);
  if (fs.existsSync(abs)) walk(abs, files);
}
for (const f of ['README.md', 'GIT-DATA-PACKAGING.md']) files.push(path.join(root, f));

const TOKEN = /[A-Za-z0-9_\-./]+\.(?:js|mjs|cjs|json|html|css|jpg|jpeg|png|glb|txt|tif|webp)\b/g;
const edges = new Map();

for (const f of files) {
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const dir = path.dirname(f);
  for (const m of txt.matchAll(TOKEN)) {
    const tok = m[0];
    const bases = [dir, root, path.join(root, 'outputs/hcmc-poc'), path.join(root, 'outputs'), path.join(root, 'research')];
    const cands = bases.map(b => path.resolve(b, tok));
    if (!tok.includes('/')) {
      // basename-only reference: also try the target's own directory
      for (const t of targets) if (path.basename(t) === tok) cands.push(t);
    }
    for (const c of cands) {
      if (tset.has(path.resolve(c))) {
        if (norm(f) === norm(c)) continue;
        const k = rel(c);
        if (!edges.has(k)) edges.set(k, new Set());
        edges.get(k).add(rel(f));
      }
    }
  }
}
const keys = [...edges.keys()].sort();
for (const k of keys) console.log(`${k}\t=> ${[...edges.get(k)].sort().join(', ')}`);
console.log(`edges: ${keys.length} / scanned files: ${files.length}`);
