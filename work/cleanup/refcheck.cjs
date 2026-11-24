// Read-only reference check for the 115 overlap files.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const overlap = fs.readFileSync(path.join(__dirname, 'overlap.txt'), 'utf8').split(/\r?\n/).filter(Boolean);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
}
function rel(p) { return path.relative(root, p).split(path.sep).join('/'); }

// Build the runtime search set.
const search = new Set();
const hp = path.join(root, 'outputs', 'hcmc-poc');
// top-level modules loaded by the WebGPU app: *-24/27/28/30/31/32.js and webgpu-materials-24.js/.html
for (const f of fs.readdirSync(hp)) {
  if (!f.endsWith('.js') && !f.endsWith('.html') && !f.endsWith('.css')) continue;
  if (/-(24|27|28|30|31|32)\.(js|css)$/.test(f) || /^webgpu-materials-24\.(js|html)$/.test(f)) {
    search.add(rel(path.join(hp, f)));
  }
}
// shared/**
const shared = path.join(root, 'outputs', 'shared');
if (fs.existsSync(shared)) { const l = []; walk(shared, l); l.forEach(p => search.add(rel(p))); }
// QA 31/32 + hygiene
const scr = path.join(hp, 'scripts');
for (const f of fs.readdirSync(scr)) {
  if (/^qa-.*-(31|32)\.cjs$/.test(f) || f === 'qa-project-hygiene.cjs') search.add(rel(path.join(scr, f)));
}
// also index.html is inspected but it is KEPT; include to see refs
// read all search files once
const files = [...search].map(f => ({ f, txt: fs.readFileSync(path.join(root, f), 'utf8') }));

const report = [];
for (const target of overlap) {
  const base = path.basename(target);
  const stem = base.replace(/\.[^.]+$/, '');
  const hits = [];
  for (const { f, txt } of files) {
    if (txt.includes(base) || txt.includes(target)) hits.push(f);
  }
  report.push({ target, base, hits });
}
for (const r of report) {
  console.log(`${r.target}\t${r.hits.length ? r.hits.join(',') : '-'}`);
}
console.error('search files: ' + search.size);
