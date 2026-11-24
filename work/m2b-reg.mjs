// Rà registry: entry + tâm/bbox building trong bac (hoặc ≤250 m) + kiểm lỗi hình học cơ bản.
import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const load = f => fs.readFileSync(path.join(root, f), 'utf8');

// --- registry ---
const regTxt = load('data/signature-registry-31.js');
const reg = JSON.parse(regTxt.replace(/^window\.SIGNATURE_REGISTRY_31\s*=\s*/, '').replace(/;\s*$/, ''));
console.log('registry version', reg.version, 'entries', reg.entries.length);
for (const e of reg.entries) {
  console.log(`- key=${e.key} kind=${e.kind} name=${e.name ?? ''} ids=${(e.ids || []).length} offScene=${(e.offScene || []).length} zone=${e.zone ? 'yes' : ''}`);
}
