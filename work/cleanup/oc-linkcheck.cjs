// Read-only: find dead relative links in the kept entry documents.
const fs = require('fs'), path = require('path');
const root = process.cwd();
const files = ['README.md', 'outputs/hcmc-poc/README.md', 'outputs/hcmc-poc/index.html', 'GIT-DATA-PACKAGING.md', 'docs/superpowers/plans/2026-10-14-m1-hang-xanh.md', 'docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md', 'outputs/smart-traffic/README.md', 'outputs/hcmc-poc/VISUAL-RUNTIME-31.md', 'outputs/hcmc-poc/RELEASE-QA-31A.md'];
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(f + ' MISSING'); continue; }
  const txt = fs.readFileSync(f, 'utf8');
  const links = [];
  for (const m of txt.matchAll(/\]\(([^)\s]+)\)/g)) links.push(m[1]);
  for (const m of txt.matchAll(/href="([^"]+)"/g)) links.push(m[1]);
  for (const m of txt.matchAll(/(?:src|href)='([^']+)'/g)) links.push(m[1]);
  const bad = new Set();
  for (const l of links) {
    if (/^(https?:|mailto:|data:|#)/.test(l)) continue;
    const p = l.split('#')[0].split('?')[0];
    if (!p) continue;
    if (!fs.existsSync(path.resolve(root, path.dirname(f), p)) && !fs.existsSync(path.join(root, p))) bad.add(l);
  }
  console.log(`${f} links=${links.length} broken=${bad.size}${bad.size ? ' :: ' + [...bad].join(', ') : ''}`);
}
