const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const assert=require('assert');

const project=path.resolve(__dirname,'../../..');
const demo=path.join(project,'outputs/hcmc-poc');
const run=command=>cp.execFileSync('git',command,{cwd:project,encoding:'utf8'}).trim();
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};

check('No duplicate Finder-style tile is tracked',()=>{
  const tracked=run(['ls-files','outputs/hcmc-poc/data/tiles-18']);
  assert(!/(^|\n).* 2\.(glb|json)$/m.test(tracked));
});

check('Accidental tile copies are ignored',()=>{
  const ignore=fs.readFileSync(path.join(project,'.gitignore'),'utf8');
  assert(ignore.includes('outputs/hcmc-poc/data/tiles-18/**/* 2.glb'));
  assert(ignore.includes('outputs/hcmc-poc/data/tiles-18/**/* 2.json'));
});

check('Workspace cleanup is reproducible and leaves no allow-listed residue',()=>{
  const cleanup=path.join(project,'scripts/clean_workspace.py');
  assert(fs.existsSync(cleanup));
  // Windows thường chỉ có `python` (python3 là alias Microsoft Store trả mã lỗi); cho phép ghi đè bằng PYTHON.
  const python=[process.env.PYTHON,'python3','python'].find(command=>command&&cp.spawnSync(command,['--version']).status===0);
  assert(python,'Không tìm thấy trình thông dịch Python (đặt biến PYTHON)');
  const dry=cp.execFileSync(python,[cleanup],{cwd:project,encoding:'utf8'});
  assert(dry.includes('candidates=0'));
  for(const relative of ['work/archive-ui-pre-demo','work/v1-backup','work/RGBELoader.js','work/bitexco-model.html'])assert(!fs.existsSync(path.join(project,relative)));
});

check('Renderer assets are version-aligned at 30b',()=>{
  const html=fs.readFileSync(path.join(demo,'webgpu-materials-24.html'),'utf8');
  const entry=fs.readFileSync(path.join(demo,'webgpu-entry-24.js'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(demo,'data/webgpu-materials-24.json'),'utf8'));
  const evidence=JSON.parse(fs.readFileSync(path.join(demo,'data/ba-son-marina-24.json'),'utf8'));
  assert(!html.includes('?v=24d'));
  assert(html.includes('webgpu-materials-24.js?v=31a'));
  assert(entry.includes("version:'30b'"));
  assert.equal(manifest.version,'30b');
  assert.equal(evidence.version,'24e');
});

check('Unified map-first shell keeps one canonical UI and aligned collapsible panels',()=>{
  const index=fs.readFileSync(path.join(demo,'index.html'),'utf8');
  const html=fs.readFileSync(path.join(demo,'webgpu-materials-24.html'),'utf8');
  const css=fs.readFileSync(path.join(demo,'webgpu-materials-24.css'),'utf8');
  const renderer=fs.readFileSync(path.join(demo,'webgpu-materials-24.js'),'utf8');
  const flood=fs.readFileSync(path.join(demo,'flood-ui-25.js'),'utf8');
  for(const id of ['cityNav','collapseNav','collapseStory','collapse','collapseSelection','collapseFloodLab'])assert(html.includes(`id="${id}"`));
  assert(html.includes('aria-controls="floodContent"'));
  assert(index.includes("location.replace(`webgpu-materials-24.html?v=31a"));
  assert(index.includes("q.get('legacy')==='1'"));
  assert(css.includes('Unified map shell · 30B'));
  assert(css.includes('--rail:44px'));
  assert(css.includes('.collapsed>.panel-body'));
  assert(css.includes('.nav-dock'));
  assert(css.includes('.chrome-button svg,.panel-toggle svg,.nav-flood svg'));
  assert(css.includes('body.ui-hidden #toggleUi .toggle-show-icon'));
  assert(css.includes('#toggleUi .toggle-show-icon{display:none}'));
  assert(!html.includes('toggle-ui-label'));
  assert(css.includes('body.flood-open .story,body.flood-open .controls'));
  assert(!html.includes('THREE.JS r186'));
  assert(!html.includes('>×<'));
  assert(!html.includes('>⌄<'));
  assert(html.includes('data-view="overview"'));
  assert(html.includes('data-light="day"'));
  assert(renderer.includes("citylab.30b.panel.story.collapsed"));
  assert(renderer.includes("citylab.30b.panel.controls.collapsed"));
  assert(renderer.includes("citylab.30b.panel.navigation.collapsed"));
  assert(renderer.includes("hidden?'Mở giao diện':'Ẩn giao diện'"));
  assert(renderer.includes('function updateLabels()'));
  assert(flood.includes("querySelectorAll('[data-open-flood]')"));
  assert(flood.includes("querySelectorAll('.nav-views [data-view]')"));
  assert(flood.includes("citylab.30b.panel.flood.collapsed"));
});

check('Navigation remains available on compact screens with normalized control geometry',()=>{
  const html=fs.readFileSync(path.join(demo,'webgpu-materials-24.html'),'utf8');
  const css=fs.readFileSync(path.join(demo,'webgpu-materials-24.css'),'utf8');
  const buttons=html.match(/<button\b[^>]*>/g)||[];
  assert(buttons.length>=25);
  assert(buttons.every(button=>button.includes('type="button"')));
  for(const glyph of ['◐','▶','⌖','Ⅱ'])assert(!html.includes(glyph));
  assert(css.includes('--control-size:32px'));
  assert(css.includes('Legibility and interaction QA · 30B'));
  assert(css.includes('--button-text:12px'));
  assert(css.includes('grid-template-columns:1fr 1.25fr'));
  assert(!css.includes('1.30br'));
  assert(css.includes('height:40px'));
  assert(css.includes('.nav-dock.collapsed>.panel-body'));
  assert(css.includes('bottom:48px'));
  assert(css.includes('width:16px'));
  assert(css.includes('height:16px'));
});

check('Interactive markup has unique IDs, explicit button types and valid control targets',()=>{
  const html=fs.readFileSync(path.join(demo,'webgpu-materials-24.html'),'utf8');
  const css=fs.readFileSync(path.join(demo,'webgpu-materials-24.css'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  const controls=[...html.matchAll(/\baria-controls="([^"]+)"/g)].map(match=>match[1]);
  for(const target of controls)assert(ids.includes(target),`Missing aria-controls target: ${target}`);
  const buttons=html.match(/<button\b[^>]*>/g)||[];
  assert(buttons.every(button=>button.includes('type="button"')));
  assert(!/[0-9](?:gr|xp|emx|remx)\b/.test(css));
});

check('Flood model contract has evidence tiers and calibration gates',()=>{
  const contract=JSON.parse(fs.readFileSync(path.join(demo,'data/flood-model-contract-25.json'),'utf8'));
  assert.equal(contract.version,'25a');
  assert.equal(contract.pilotArea.id,'thao-dien-compound-flood');
  assert.equal(contract.excludedPilotArea.name,'Nguyen Hue - Bach Dang - Ba Son');
  assert.equal(contract.citywideScope.coverage,'Entire official Ho Chi Minh City administrative extent');
  assert.equal(contract.scenarioPolicy.controlsAreBounded,true);
  assert.equal(contract.scenarioPolicy.unboundedSlidersForbidden,true);
  assert.equal(contract.warningPolicy.levels,3);
  assert(contract.sources.length>=8);
  assert(contract.qualityGates.some(gate=>gate.id==='engineering-calibration'));
  assert(contract.outputs.includes('maximum_depth_m'));
});

console.log(JSON.stringify({suite:'project-hygiene',passed:checks.length,checks},null,2));
