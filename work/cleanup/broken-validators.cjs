const fs = require('fs');
const path = require('path');
const files = [
  'outputs/hcmc-poc/scripts/validate_demo_ready.py',
  'outputs/hcmc-poc/scripts/validate_ba_son_bridge.py',
  'outputs/hcmc-poc/scripts/qa-construction-change-23.cjs',
  'outputs/hcmc-poc/scripts/qa-app-integrity-30b.cjs',
];
for (const f of files) {
  const dir = path.posix.dirname(f);
  const t = fs.readFileSync(f, 'utf8');
  const set = new Set();
  for (const m of t.matchAll(/["'`]([A-Za-z0-9_\-./]+\.(?:js|json|css|html|mjs|cjs|py))["'`]/g)) set.add(m[1]);
  const miss = [...set].filter((p) => !p.startsWith('http') && !fs.existsSync(p) && !fs.existsSync('outputs/hcmc-poc/' + p) && !fs.existsSync(path.posix.join(dir, p)));
  console.log(f, '| candidate paths:', set.size, '| missing:', miss.length, miss.join(', '));
}
