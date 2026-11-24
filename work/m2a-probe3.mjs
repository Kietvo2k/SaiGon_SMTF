import fs from 'node:fs';
const t = fs.readFileSync(new URL('../outputs/hcmc-poc/data/street-furniture-31.js', import.meta.url), 'utf8');
const w = {};
new Function('window', t)(w);
const S = w.STREET_FURNITURE_31;
console.log('keys', Object.keys(S).join(','));
for (const k of Object.keys(S)) { const v = S[k]; console.log(k, Array.isArray(v) ? 'array ' + v.length : typeof v); }
console.log('lamps[0]', JSON.stringify((S.lamps || [])[0]));
