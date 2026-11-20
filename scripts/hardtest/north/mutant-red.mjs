import assert from 'node:assert/strict';
import { cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join,relative,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root as sourceRoot,poc,north,seeds,sha256 } from './oracle.mjs';
import { describeArtifact } from '../artifacts.mjs';

const taskRoot=resolve('.'),logParent=join(taskRoot,'work/smtf-agent/logs/north-r2-hardtest');
mkdirSync(logParent,{recursive:true});const logs=mkdtempSync(join(logParent,'mutant-')),sandbox=join(logs,'sandbox');
const suiteRoot=dirname(fileURLToPath(import.meta.url)),suites=['north-data.test.mjs','consumer.test.mjs','runtime.test.mjs'].map(n=>join(suiteRoot,n));
const rels=new Set(['scripts/build_public_north.mjs','scripts/build_public_north.py',poc+'webgpu-materials-24.html']);
for(const ent of readdirSync(join(sourceRoot,poc),{withFileTypes:true}))if(ent.isFile()&&ent.name.endsWith('.js'))rels.add(poc+ent.name);
for(const dir of [north,seeds+'public-north/'])for(const name of readdirSync(join(sourceRoot,dir)))rels.add(dir+name);
for(const name of ['scene.json','road-graph-31.json','street-furniture-31.json','bridge-corrections-31.json','signature-registry-31.json','heat-history-32.json','semantic-materials-08.js','webgpu-corrections-24.js','ba-son-bridge-detail.json','bach-dang-footbridge.json'])rels.add(poc+'data/'+name);
for(const name of ['cameras.json','node_map.json'])rels.add(seeds+name);
for(const path of rels){assert.ok(existsSync(join(sourceRoot,path)),`Sandbox input missing ${path}`);mkdirSync(dirname(join(sandbox,path)),{recursive:true});cpSync(join(sourceRoot,path),join(sandbox,path));}
for(const path of [poc+'vendor/three186','outputs/shared/public-demo'])cpSync(join(sourceRoot,path),join(sandbox,path),{recursive:true});
const mutable=[north+'road-graph.json',north+'scene.json',north+'mapping.json',north+'manifest.json',north+'runtime-sidecars.json',north+'heat-history-32.json',seeds+'public-north/cameras.json',seeds+'public-north/node_map.json',poc+'webgpu-materials-24.js',poc+'webgpu-materials-24.html'];
const pristine=new Map(mutable.map(p=>[p,readFileSync(join(sandbox,p))])),sourceHashes=new Map(mutable.map(p=>[p,sha256(readFileSync(join(sourceRoot,p)))]));
const summary={sourceRoot,taskRoot,sourceHead:spawnSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).stdout.trim(),sourceStatus:spawnSync('git',['status','--porcelain'],{cwd:sourceRoot,encoding:'utf8'}).stdout,sourceArtifactHashes:Object.fromEntries(sourceHashes),scope:'ignored sandbox only',mutants:[],restores:[],logs};
const read=p=>JSON.parse(readFileSync(join(sandbox,p),'utf8')),write=(p,v)=>writeFileSync(join(sandbox,p),JSON.stringify(v));
function edit(p,fn){const d=read(p);fn(d);write(p,d);}
function textEdit(p,fn){const old=readFileSync(join(sandbox,p),'utf8'),next=fn(old);assert.notEqual(next,old,`Mutation không thay source ${p}`);writeFileSync(join(sandbox,p),next);}
function rehash(){const m=read(north+'manifest.json');for(const f of m.files){const b=readFileSync(join(sandbox,f.path));f.bytes=b.length;f.sha256=sha256(b);}write(north+'manifest.json',m);}
function restore(label){for(const [p,b]of pristine)writeFileSync(join(sandbox,p),b);const ok=[...pristine].every(([p,b])=>sha256(readFileSync(join(sandbox,p)))===sha256(b));assert.ok(ok,'Restore exact hash');summary.restores.push({label,exactHash:true});}
function run(label,pattern,files=suites,extraEnv={}){
  const args=['--test','--test-reporter=tap'];if(pattern)args.push('--test-name-pattern',pattern);args.push(...files);
  const r=spawnSync(process.execPath,args,{cwd:taskRoot,env:{...process.env,NORTH_TEST_ROOT:sandbox,...extraEnv},encoding:'utf8',timeout:120000,maxBuffer:16*1024**2}),tap=r.stdout||'';
  writeFileSync(join(logs,label+'.tap'),tap);writeFileSync(join(logs,label+'.stderr.log'),r.stderr||'');
  assert.equal(r.error,undefined,`Không credit spawn/timeout ${label}`);assert.ok(!/ENOENT|spawn-error|ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/.test(tap+(r.stderr||'')),`Không credit hạ tầng/setup ${label}`);
  assert.match(tap,/# skipped 0\b/,'Không skip');assert.match(tap,/# cancelled 0\b/,'Không cancel');assert.match(tap,/# todo 0\b/,'Không todo');return {exit:r.status,tap,command:[process.execPath,...args],log:join(logs,label+'.tap')};
}
function mutation(name,pattern,reason,change){
  restore('before-'+name);try{change();rehash();const r=run(name,pattern);assert.equal(r.exit,1,`Mutant phải đỏ ${name}`);assert.match(r.tap,/ERR_ASSERTION/,`Mutant phải tới assertion ${name}`);assert.match(r.tap,reason,`Đỏ đúng lý do ${name}`);assert.equal((r.tap.match(/^not ok /gm)||[]).length,1,`Một targeted assertion ${name}`);summary.mutants.push({name,exit:r.exit,assertion:reason.source,log:r.log,changedHashes:Object.fromEntries(mutable.filter(p=>sha256(readFileSync(join(sandbox,p)))!==sha256(pristine.get(p))).map(p=>[p,sha256(readFileSync(join(sandbox,p)))]))});}finally{restore('after-'+name);}
}
try {
  const clean=run('clean-before');assert.equal(clean.exit,0,`Clean primary phải xanh trước semantic mutants; xem ${clean.log}`);summary.cleanBefore=clean.log;
  mutation('remove-edge-keep-mapping','closure edgeMap',/Mỗi fragment là một road|edgeMap phải đóng/,()=>edit(north+'road-graph.json',g=>g.edges.pop()));
  mutation('empty-adjacency','adjacency reciprocal',/Adjacency rỗng/,()=>edit(north+'road-graph.json',g=>g.nodes[0].adj=[]));
  mutation('oneway','metadata, shape',/Edge metadata oneway/,()=>edit(north+'road-graph.json',g=>{g.edges[0].oneway=g.edges[0].oneway==='yes'?'no':'yes';}));
  mutation('missing-profile','metadata, shape',/Profile missing/,()=>edit(north+'road-graph.json',g=>{delete g.edges.find(e=>e.profile).profile;}));
  mutation('profile-station','metadata, shape',/Profile start/,()=>edit(north+'road-graph.json',g=>{g.edges.find(e=>e.profile).profile[0]=3;}));
  mutation('missing-road-edges','closure edgeMap',/road.edges/,()=>edit(north+'road-graph.json',g=>{g.roads[0].edges=[];}));
  mutation('source-endpoint-merge','adjacency reciprocal',/Topology endpoint nguồn không đổi ID/,()=>edit(north+'road-graph.json',g=>{const e=g.edges.find(e=>typeof e.from==='number'&&typeof e.to==='number'),a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to);b.x=a.x;b.z=a.z;for(const x of g.edges){if(x.from===b.id){x.from=a.id;x.c[0]=a.x;x.c[1]=a.z;}if(x.to===b.id){x.to=a.id;x.c[x.c.length-2]=a.x;x.c[x.c.length-1]=a.z;}}g.nodes=g.nodes.filter(n=>n.id!==b.id);const nodes=new Map(g.nodes.map(n=>{n.adj=[];return[n.id,n];}));for(const x of g.edges)for(const [id,end]of [[x.from,0],[x.to,1]]){const c=x.c,i=end?c.length-2:0,j=end?i-2:2;nodes.get(id).adj.push([x.id,end,Math.atan2(c[j]-c[i],-(c[j+1]-c[i+1]))*180/Math.PI]);}for(const n of g.nodes)n.degree=n.adj.length;}));
  mutation('missing-bac01-second-osm','^CAM-01 đủ 12 OSM',/12 target OSM/,()=>edit(seeds+'public-north/node_map.json',a=>a.splice(a.findIndex(r=>r.osm_id===2351201590),1)));
  mutation('missing-old-camera','giữ 10 camera HX',/Missing old camera/,()=>edit(seeds+'public-north/cameras.json',a=>{a.find(c=>c.camera_id==='CAM-HX-010').camera_id='CAM-HX-099';}));
  mutation('camera-outside','camera pose trong Bắc',/Camera outside north/,()=>edit(seeds+'public-north/cameras.json',a=>{a[0].x=999999;a[0].z=999999;}));
  mutation('camera-behind','camera pose trong Bắc',/Camera target outside frame/,()=>edit(seeds+'public-north/cameras.json',a=>{a.find(c=>c.camera_id==='CAM-BAC-001').yaw_deg+=180;}));
  mutation('stale-sidecar-road','sidecar references',/Sidecar road stale index/,()=>edit(north+'runtime-sidecars.json',c=>{const r=c.globals.STREET_FURNITURE_31.crossings[0];r.road=999999;}));
  mutation('stale-heat-ne','heat public expand',/Heat ne must match/,()=>edit(north+'heat-history-32.json',h=>h.ne++));
  mutation('classic-bootstrap-fetch','bootstrap thật',/Bootstrap classic fetch forbidden|Bootstrap fetch public/,()=>textEdit(poc+'webgpu-materials-24.html',s=>s.replaceAll('data/public-north/scene.json','data/scene.json').replaceAll('data/public-north/road-graph.json','data/road-graph-31.json')));
  mutation('classic-prewarm','prewarm block thật',/Prewarm regions forbidden/,()=>textEdit(poc+'webgpu-materials-24.js',s=>s.replace(/const warmRegions\s*=[^;]+;/,"const warmRegions = [...REGIONS_31];")));
  mutation('classic-prewarm-call','prewarm block thật',/Prewarm classic forbidden/,()=>textEdit(poc+'webgpu-materials-24.js',s=>s.replace('if (!isSmart32) cityDensity.prewarmRegions();','cityDensity.prewarmRegions();')));
  mutation('empty-scene-rehashed','closure edgeMap',/Scene public rỗng/,()=>edit(north+'scene.json',s=>{s.roads=[];s.buildings=[];}));
  // Gói chẩn đoán có byte artifact thật; không dùng nó làm bằng chứng browser hay package release.
  restore('before-release');const packageRoot=join(logs,'release-package'),pages=join(packageRoot,'pages'),vercel=join(packageRoot,'vercel');mkdirSync(pages,{recursive:true});mkdirSync(vercel,{recursive:true});writeFileSync(join(vercel,'index.html'),'<p>CONTROLLED HARDTEST PACKAGE</p>');
  for(const name of ['manifest.json','scene.json','road-graph.json','runtime-sidecars.json']){mkdirSync(join(pages,'data/public-north'),{recursive:true});cpSync(join(sandbox,north,name),join(pages,'data/public-north',name));}
  for(const name of ['cameras.json','node_map.json']){mkdirSync(join(pages,'seed/public-north'),{recursive:true});cpSync(join(sandbox,seeds+'public-north',name),join(pages,'seed/public-north',name));}
  const manifestPath=join(packageRoot,'manifest.json'),describe=()=>writeFileSync(manifestPath,JSON.stringify({commit:summary.sourceHead,artifacts:{pages:describeArtifact(pages,'pages'),vercel:describeArtifact(vercel,'vercel')}}));
  describe();const releaseEnv={HARDTEST_RELEASE_MANIFEST:manifestPath,HARDTEST_COMMIT:summary.sourceHead},releaseFile=[join(suiteRoot,'../release/CAM-01.test.mjs')],rc=run('release-clean',null,releaseFile,releaseEnv);assert.equal(rc.exit,0,'Release control phải xanh');
  const scenePath=join(pages,'data/public-north/scene.json'),saved=readFileSync(scenePath);try{writeFileSync(scenePath,JSON.stringify({region:'bac',roads:[],buildings:[]}));describe();const rr=run('release-empty-scene-rehashed',null,releaseFile,releaseEnv);assert.equal(rr.exit,1);assert.match(rr.tap,/ERR_ASSERTION/);assert.match(rr.tap,/CAM artifact scene rỗng/);summary.mutants.push({name:'release-empty-scene-rehashed',exit:1,assertion:'CAM artifact scene rỗng',log:rr.log});}finally{writeFileSync(scenePath,saved);describe();}
  const restoredRelease=run('release-restored',null,releaseFile,releaseEnv);assert.equal(restoredRelease.exit,0);const final=run('clean-after');assert.equal(final.exit,0,'Primary sạch sau restore');summary.cleanAfter=final.log;summary.status='passed';
} catch(error){summary.status='failed';summary.error=String(error.stack||error);process.exitCode=1;}
finally{
  restore('finally');summary.sourceUnchanged=[...sourceHashes].every(([p,h])=>sha256(readFileSync(join(sourceRoot,p)))===h);assert.ok(summary.sourceUnchanged,'Source artifact bị thay ngoài sandbox');
  const rel=relative(logs,resolve(sandbox));assert.ok(rel==='sandbox'&&!rel.startsWith('..'),'Cleanup phải trong sandbox đã xác minh');rmSync(sandbox,{recursive:true,force:true});summary.sandboxRemoved=!existsSync(sandbox);writeFileSync(join(logs,'summary.json'),JSON.stringify(summary,null,2)+'\n');
}
console.log(JSON.stringify({status:summary.status,mutants:summary.mutants.length,restores:summary.restores.length,sourceUnchanged:summary.sourceUnchanged,summary:join(logs,'summary.json'),error:summary.error}));
