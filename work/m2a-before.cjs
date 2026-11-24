// M2a (không commit): dựng lại cảnh TRƯỚC M2a để đo renderer.info trước/sau.
// "before" = bản webgpu-materials-24.js tại commit 2e50c0e (chưa đụng file cảnh).
const fs = require('fs');
const { execFileSync } = require('child_process');
const dir = 'outputs/hcmc-poc';
const repo = 'C:/Users/Admin/orca/workspaces/SaiGon_SMTF/smart-bac';
const js = execFileSync('git', ['-C', repo, 'show', '2e50c0e:outputs/hcmc-poc/webgpu-materials-24.js'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
fs.writeFileSync(dir + '/tmp-before-24.js', js);
let html = fs.readFileSync(dir + '/webgpu-materials-24.html', 'utf8');
html = html.replace("'./webgpu-materials-24.js?v=32a'", "'./tmp-before-24.js?v=32a'").replace("'./webgpu-materials-24.js?v=31a'", "'./tmp-before-24.js?v=31a'");
fs.writeFileSync(dir + '/tmp-before-24.html', html);
console.log('before files:', js.length, 'bytes js;', html.length, 'bytes html');
