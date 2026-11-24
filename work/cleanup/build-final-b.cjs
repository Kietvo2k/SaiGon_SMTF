const fs = require('fs');
const path = require('path');
const CL = path.join(__dirname);
const readNul = (f) => fs.readFileSync(path.join(CL, f), 'utf8').split('\0').filter(Boolean);
const finB = readNul('FINAL-B.list');
const disputed = [
  'outputs/hcmc-poc/bridge-detail.js',
  'outputs/hcmc-poc/data/catalog.js',
  'outputs/hcmc-poc/semantic-materials-08.js',
  'outputs/hcmc-poc/tiles/rp-r2c3/provenance.json',
];
const all = [...new Set([...finB, ...disputed])].filter(f => f !== 'outputs/hcmc-poc/index.html');
const existing = all.filter(f => fs.existsSync(f.replace(/\//g, path.sep)));
fs.writeFileSync(path.join(CL, 'final-B.list'), existing.join('\0') + '\0', 'utf8');
console.log('final-B count:', existing.length);
console.log(existing.join('\n'));
