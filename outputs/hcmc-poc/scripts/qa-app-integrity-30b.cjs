const assert=require('assert');
const fs=require('fs');
const path=require('path');

const demo=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(demo,file),'utf8');
const html=read('webgpu-materials-24.html');
const css=read('webgpu-materials-24.css');
const renderer=read('webgpu-materials-24.js');
const flood=read('flood-ui-25.js');
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};

check('Canonical entry targets the 30B shell and preserves the legacy escape hatch',()=>{
  const index=read('index.html');
  assert(index.includes('webgpu-materials-24.html?v=31a'));
  assert(index.includes("q.get('legacy')==='1'"));
});

check('Every local asset referenced by the canonical HTML exists',()=>{
  const refs=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
  const imports=[...html.matchAll(/"(\.\/vendor\/[^"]+)"/g)].map(match=>match[1]);
  const local=[...new Set([...refs,...imports])]
    .filter(ref=>!ref.startsWith('data:')&&!ref.startsWith('#')&&!/^https?:/.test(ref))
    .map(ref=>ref.replace(/^\.\//,'').split('?')[0]);
  for(const ref of local)assert(fs.existsSync(path.join(demo,ref)),`Missing local asset: ${ref}`);
  assert(local.length>=10,`Unexpectedly small asset graph: ${local.length}`);
});

check('Canonical cache keys and runtime data remain aligned to 30B',()=>{
  const refs=[...html.matchAll(/(?:src|href)="([^"]+\?v=([^"]+))"/g)];
  assert(refs.length>=7);
  for(const [,asset,version] of refs)assert(version.startsWith('31a'),`Stale cache key ${version}: ${asset}`);
  assert(renderer.includes("const APP_VERSION=CORRECTIONS.version"));
  assert.equal(require(path.join(demo,'data/webgpu-materials-24.json')).version,'31a');
});

check('Interactive markup has unique IDs, explicit button types and valid control targets',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'Duplicate IDs found');
  for(const [,target] of html.matchAll(/\baria-controls="([^"]+)"/g))assert(ids.includes(target),`Missing aria-controls target: ${target}`);
  const buttons=html.match(/<button\b[^>]*>/g)||[];
  assert(buttons.length>=25);
  assert(buttons.every(button=>button.includes('type="button"')),'A button is missing type="button"');
});

check('Required JavaScript ID selectors resolve in the canonical document',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const optional=new Set(['backend']);
  const selectors=[...renderer.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g),...flood.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)];
  for(const match of selectors)assert(ids.has(match[1])||optional.has(match[1]),`Unresolved selector: #${match[1]}`);
});

check('Every navigation choice has a camera or lighting state',()=>{
  const views=new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]));
  const lights=new Set([...html.matchAll(/data-light="([^"]+)"/g)].map(match=>match[1]));
  for(const view of views)assert(new RegExp(`\\n\\s*${view}:\\{`).test(renderer),`Missing view preset: ${view}`);
  for(const light of lights)assert(new RegExp(`\\n\\s*${light}:\\{`).test(renderer),`Missing light state: ${light}`);
  assert(renderer.includes('flood25:{'), 'Missing Flood Lab camera preset');
});

check('Aerial colour system is a single bounded default with Visual 26 material separation',()=>{
  assert(!html.includes('data-grade='));
  assert(!renderer.includes('visualProfile'));
  assert(!renderer.includes('visualGrade'));
  assert(!renderer.includes('grade='));
  assert(renderer.includes("const richSaturation=mix(float(1.015),float(1.085),detailFade)"));
  assert(renderer.includes("const richContrast=mix(float(1.06),float(1.13),detailFade)"));
  assert(renderer.includes("day:{background:'#5ca2cf',fog:'#dcebf2',fogDensity:.000056"));
  assert(renderer.includes("golden:{background:'#a17c69',fog:'#b09b86',fogDensity:.000076"));
  assert(renderer.includes("const roadColors={edge:'#8c9188',asphalt:'#293534',pedestrian:'#c8ad84',marking:'#f4db80'}"));
  assert(renderer.includes("const waterLow=color('#0b3546')"));
  assert(renderer.includes('const waterFresnel='));
  assert(renderer.includes("wall.lerp(new THREE.Color('#8faab5'),.22)"));
  assert(renderer.includes("wall.setHSL(wallHsl.h,Math.min(.22,wallHsl.s)"));
  assert(renderer.includes("const glassDay=mix(color('#526b77'),color('#8ca3aa')"));
  assert(renderer.includes("profile:'hcmc-aerial-default-30'"));
  assert(!css.includes('mix-blend-mode:multiply'));
});

check('Release CSS contains no invalid units or retired component selectors',()=>{
  assert(!/[0-9](?:gr|xp|emx|remx)\b/.test(css),'Invalid CSS unit found');
  for(const retired of ['toggle-ui-label','.engine{','.pulse{','.icon-button{','.panel-toggle span','.rain-actions button span','.rain-actions .worst-case span']){
    assert(!css.includes(retired),`Retired selector remains: ${retired}`);
  }
});

check('No stale release label survives in active shell files',()=>{
  const active=[html,css,renderer,flood,read('index.html'),read('city-detail-runtime-28.js')].join('\n');
  assert(!/\b25[ef]\b/i.test(active));
});

check('Demo tree contains no common editor, Finder or duplicate-copy debris',()=>{
  const debris=[];
  const walk=folder=>{
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const absolute=path.join(folder,entry.name);
      if(entry.isDirectory())walk(absolute);
      else if(entry.name==='.DS_Store'||/\.(?:tmp|bak|log)$/.test(entry.name)||entry.name.endsWith('~')||/ 2\.[^.]+$/.test(entry.name))debris.push(path.relative(demo,absolute));
    }
  };
  walk(demo);
  assert.deepEqual(debris,[]);
});

console.log(JSON.stringify({suite:'app-integrity-30b',passed:checks.length,checks},null,2));
