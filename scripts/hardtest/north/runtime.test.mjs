import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { join,posix } from 'node:path';
import { root,poc,north,seeds,readJson,readText,publicNetwork,product,targets,clusters,sha256 } from './oracle.mjs';

test('CAM-01 runtime installation thật truyền cùng cameras và heat config tới mọi consumer',async()=>{
  const {net,graph,roads,sidecars:config,nodeMap,signalPlan,widthOf,drawn}=await publicNetwork(),{prepareSmart32}=await product('smart-app-32.js'),requests=[],original=globalThis.fetch;
  globalThis.fetch=fetchRecorder(requests);let prep;try{prep=await prepareSmart32({graph,config});}finally{globalThis.fetch=original;}
  const calls=[],smartApp={modules:{}},smartMod={NORTH_DEMAND_32:null};for(const name of ['installSignals32','installCameraCapture32','installStation32','installHeat32','installForecast32'])smartMod[name]=(app,opts)=>{assert.equal(app,smartApp);calls.push({name,opts});};
  const source=readText(poc+'webgpu-materials-24.js'),start=source.indexOf('if(smartApp){',source.indexOf('const smartApp=')),end=source.indexOf('document.body.dataset.motionVessels',start);assert.ok(start>=0&&end>start,'Installation boundary thật');
  const ctx={smartApp,smartMod,smartPrep:prep,smartSignalPlan:signalPlan,smartRoute:{},traffic:{net,setRegion(){}},window:{ROAD_GRAPH_31:graph},D:{roads},simWidthOf:widthOf,simDrawn:drawn,THREE:{},URLSearchParams,location:{search:'?app=smart&region=bac'},REGION_URL_PARAM:'region',REGION_STORAGE_KEY:'region',history:{replaceState(){}},localStorage:{setItem(){}},console:{warn:(...v)=>{throw new Error(v.join(' '));}},fetch:fetchRecorder(requests),__import:async()=>product('city-region-31.js')};
  await vm.runInNewContext(`(async()=>{${source.slice(start,end).replace(/\bimport\s*\(/g,'__import(')}})()`,ctx,{timeout:5000});
  assert.equal(calls.length,5,'Mọi module bắt buộc được cài');
  for(const c of calls.filter(c=>['installSignals32','installCameraCapture32','installStation32'].includes(c.name)))assert.equal(c.opts.cameras,prep.cameras,'Camera registry cùng instance');
  const h=calls.find(c=>c.name==='installHeat32');assert.equal(h.opts.historyUrl,config.heatHistoryUrl,'Heat install public URL');assert.equal(h.opts.history,prep.heatHistory,'Heat install history đã expand');
  const f=calls.find(c=>c.name==='installForecast32');assert.equal(f.opts.G,graph);assert.equal(f.opts.signalPlan,signalPlan);assert.deepEqual(f.opts.stats,net.stats);assert.ok(requests.every(u=>u.includes('/public-north/')),'Install classic fetch forbidden');assert.equal(ctx.window.__smartApp,smartApp);
  delete ctx.window.__smartApp;ctx.console.warn=()=>{};smartMod.installStation32=()=>{throw new Error('intentional module failure');};
  await assert.rejects(vm.runInNewContext(`(async()=>{${source.slice(start,end).replace(/\bimport\s*\(/g,'__import(')}})()`,ctx,{timeout:5000}),/intentional module failure/,'Lỗi module bắt buộc phải chặn readiness');assert.equal(ctx.window.__smartApp,undefined,'Không publish app khi module bắt buộc hỏng');
});


function sidecars(){assert.ok(existsSync(join(root,north,'runtime-sidecars.json')),'Thiếu runtime sidecars public');return readJson(north+'runtime-sidecars.json');}
function fetchRecorder(requests){return async url=>{requests.push(String(url));const path=posix.normalize(poc+String(url).split('?')[0]);return {ok:true,status:200,json:async()=>readJson(path)};};}
export async function bootstrap(fetchOverride=null){
  const html=readText(poc+'webgpu-materials-24.html'),requests=[],scripts=[],imports=[],errors=[],loader={textContent:''},ctx={URLSearchParams,location:{search:'?app=smart'},console:{error:(...x)=>errors.push(x.map(String).join(' ')),warn:()=>{}},fetch:fetchRecorder(requests)};
  ctx.window=ctx;ctx.addEventListener=()=>{};ctx.document={write:html=>{for(const m of html.matchAll(/src=["']([^"']+)/g))scripts.push(m[1]);},getElementById:()=>loader};
  if(fetchOverride)ctx.fetch=fetchOverride;
  ctx.__import=async url=>{imports.push(url);assert.ok(ctx.CITY_DATA?.roads?.length&&ctx.ROAD_GRAPH_31?.edges?.length,'Bootstrap dữ liệu rỗng');assert.ok(ctx.STREET_FURNITURE_31&&ctx.SIGNATURE_REGISTRY_31,'Bootstrap sidecars trước import renderer');};
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const attrs=m[1],src=attrs.match(/src=["']([^"']+)/);if(src){scripts.push(src[1]);continue;}if(attrs.includes('importmap'))continue;
    const code=m[2].replace(/\bimport\s*\(/g,'__import(');
    await vm.runInNewContext(code,ctx,{timeout:5000});
  }
  return {requests,scripts,imports,errors,loader,ctx};
}
test('PUB-01 bootstrap thật chỉ fetch public JSON và gán sidecars trước renderer',async()=>{
  const b=await bootstrap();assert.deepEqual(b.errors,[],'Bootstrap không được nuốt lỗi config');
  assert.ok(b.imports.some(u=>u.includes('webgpu-materials-24.js')),'Renderer được import');
  for(const name of ['scene.json','road-graph.json','runtime-sidecars.json'])assert.ok(b.requests.some(u=>u.startsWith('data/public-north/'+name)),`Bootstrap fetch public ${name}`);
  assert.ok(b.requests.every(u=>u.startsWith('data/public-north/')),'Bootstrap classic fetch forbidden');
  const forbidden=/(?:^|\/)data\/(?:scene|road-graph-31|semantic-materials-08|ba-son-bridge-detail|webgpu-corrections-24|bach-dang-footbridge|bridge-corrections-31|signature-registry-31|street-furniture-31)\.(?:js|json)/;
  assert.ok(!b.scripts.some(u=>forbidden.test(u)),`Bootstrap classic scripts forbidden: ${b.scripts.join(',')}`);
  for(const key of Object.keys(sidecars().globals))assert.deepEqual(b.ctx[key],sidecars().globals[key],`Injected global ${key}`);
});
test('PUB-01 lỗi fetch config thật giữ loader lỗi và không import renderer',async()=>{
  const b=await bootstrap(async()=>({ok:false,status:503,json:async()=>({})}));assert.equal(b.imports.length,0,'Không renderer khi config hỏng');assert.ok(b.errors.length>0,'Loader ghi lỗi');assert.match(b.loader.textContent,/Lỗi nạp dữ liệu/,'Loader hiện lỗi thật');
});
test('PUB-01 prewarm block thật chỉ compile Bắc và không prewarmRegions classic',async()=>{
  const source=readText(poc+'webgpu-materials-24.js'),start=source.indexOf('// Bước H: biên dịch sẵn pipeline'),end=source.indexOf("setProgress(100",start);assert.ok(start>=0&&end>start,'Có prewarm boundary thật');
  const block=source.slice(source.indexOf('{',start),end),preview=[],compiles=[];let classic=0;
  const warm={position:{set(){}},lookAt(){},updateMatrixWorld(){}},ctx={isSmart32:true,smartApp:{modules:{signals:{},capture:{},heat:{},forecast:{ready:true}}},REGIONS_31:[{id:'bac',short:'Bắc'},{id:'trung-tam'},{id:'ven-song'},{id:'nam'}],performance:{now:()=>1},cityDensity:{region:'bac',prewarmRegions(){classic++;},previewRegion:id=>preview.push(id)},materialStatus:{region:{source:'url'}},presets:{overview:{target:{x:0,y:0,z:0},distance:1,polar:1,az:1}},camera:{clone:()=>warm},renderer:{compileAsync:async()=>compiles.push(preview.at(-1))},scene:{},setProgress(){},console:{warn:e=>{throw e;}}};
  await vm.runInNewContext(`(async()=>{${block}})()`,ctx,{timeout:5000});assert.equal(classic,0,'Prewarm classic forbidden');assert.ok(compiles.length>0);assert.ok(compiles.every(r=>r==='bac'),`Prewarm regions forbidden ${compiles}`);assert.ok(preview.every(r=>r==='bac'),'Preview classic forbidden');
});
test('CAM-01 prepareSmart32 thật fetch public config đủ 12 OSM 10 cluster 15+ camera',async()=>{
  const config=sidecars(),requests=[],original=globalThis.fetch;globalThis.fetch=fetchRecorder(requests);
  try{const {prepareSmart32}=await product('smart-app-32.js'),graph=readJson(north+'road-graph.json'),prep=await prepareSmart32({graph,config});
    assert.deepEqual(prep.nodeMap.map(r=>r.osm_id).sort((a,b)=>a-b),Object.values(targets).map(r=>r[0]).sort((a,b)=>a-b),'prepare dùng public OSM');
    assert.deepEqual(prep.signalPlan.clusters.map(c=>c.cluster_id).sort(),clusters.slice().sort());assert.equal(prep.signalPlan.rows.length,12);assert.ok(prep.cameras.length>=15);
    assert.ok(requests.includes(config.nodeMapUrl)&&requests.includes(config.camerasUrl),'prepare fetch public URLs');assert.ok(requests.every(u=>u.includes('/public-north/')),'prepare classic seed forbidden');
    assert.equal(prep.config,config,'Cùng config instance');
  }finally{globalThis.fetch=original;}
});
test('PUB-01 sidecar references remap tất cả fragment và bỏ module ngoài vùng',()=>{
  const c=sidecars(),{globals:g}=c,G=readJson(north+'road-graph.json'),S=readJson(north+'scene.json'),M=readJson(north+'mapping.json');
  assert.equal(c.schemaVersion,1);assert.equal(c.region,'bac');assert.ok(c.provenance.length>=8,'Provenance mọi input');
  for(const f of c.provenance){const bytes=Buffer.from(readText(f.path));assert.equal(sha256(bytes),f.sha256,`Sidecar source digest ${f.path}`);}
  assert.equal(g.BA_SON_BRIDGE,null);assert.equal(g.BACH_DANG_FOOTBRIDGE,null);assert.equal(g.SIGNATURE_REGISTRY_31.version,'31A');
  const ways=new Set(S.roads.map(r=>r.id)),buildings=new Set(S.buildings.map(b=>String(b.id)));
  const checkRoad=r=>assert.equal(S.roads[r.road]?.id,r.way,`Sidecar road stale index ${r.road}/${r.way}`);
  for(const key of ['crossings','hiddenFootways']){
    const rows=g.STREET_FURNITURE_31[key];assert.ok(Array.isArray(rows),`Sidecar ${key}`);rows.forEach(checkRoad);
    const original=readJson(poc+'data/street-furniture-31.json')[key];for(const row of original){const fs=M.roadMap.filter(m=>m.source_road_index===row.road);for(const f of fs)assert.ok(rows.some(r=>r.road===f.public_road_id&&r.way===row.way),`Sidecar missing fragment ${key}/${row.road}/${f.public_road_id}`);}
  }
  for(const row of g.BRIDGE_CORRECTIONS_31.buildings)assert.ok(buildings.has(String(row.id)),'Correction building missing');
  const foot=g.BRIDGE_CORRECTIONS_31.footbridges?.ways||[];for(const row of foot)checkRoad(row);
  assert.ok(JSON.stringify(foot).includes('Văn Thánh'),'Văn Thánh bridge giữ trong Bắc');
  for(const id of Object.keys(g.SEMANTIC_MATERIALS_08.records))assert.ok(buildings.has(id),'Semantic building missing');
  for(const e of g.SIGNATURE_REGISTRY_31.entries){if(e.kind==='building')for(const id of e.ids)assert.ok(buildings.has(String(id)),'Signature building missing');if(e.kind==='road'||e.kind==='bridge')for(const id of e.ids)assert.ok(ways.has(id),'Signature way missing');}
  assert.ok(!g.WEBGPU_CORRECTIONS_24.marinaCentral&&!g.WEBGPU_CORRECTIONS_24.grandMarina,'Ngoài vùng không kéo Marina');
  for(const e of G.edges)if(e.rampOf!=null)assert.ok(G.bridges.clusters.some(b=>b.id===e.rampOf),'rampOf cluster resolve');for(const b of G.bridges.clusters){for(const i of b.roads)assert.ok(G.roads[i],'Bridge road index remap');for(const id of b.wayIds)assert.ok(ways.has(id),'Bridge wayIds resolve public');assert.ok(Array.isArray(b.source_way_ids),'Bridge source way IDs provenance');}
});
test('SIM-01 heat public expand thật đúng ne và từng cột hourly nguồn',async()=>{
  const c=sidecars(),requests=[],fetch=fetchRecorder(requests),G=readJson(north+'road-graph.json'),{expandHeatHistory32}=await product('heat-live-32.js'),h=await (await fetch(c.heatHistoryUrl)).json(),src=readJson(poc+'data/heat-history-32.json'),expanded=expandHeatHistory32(h,G.edges.length);
  assert.ok(expanded,'Heat ne must match public edges');assert.equal(h.ne,G.edges.length,'Heat public ne');assert.equal(expanded.hourly.length,24*G.edges.length);
  const sourceColumns=new Map(src.edges.map((id,k)=>[id,k])),expected=G.edges.filter(e=>sourceColumns.has(e.source_edge_id));assert.deepEqual(h.edges.slice().sort((a,b)=>a-b),expected.map(e=>e.id).sort((a,b)=>a-b),'Heat remap all fragments');
  for(let k=0;k<h.edges.length;k++){const e=G.edges[h.edges[k]],sk=sourceColumns.get(e.source_edge_id);for(let hour=0;hour<24;hour++){assert.equal(h.levels[hour*h.edges.length+k],src.levels[hour*src.edges.length+sk],'Heat source column');assert.ok(Math.abs(expanded.hourly[hour*G.edges.length+e.id]-src.levels[hour*src.edges.length+sk])<1e-6,'Heat expanded column');}}
  assert.deepEqual(requests,[c.heatHistoryUrl]);assert.ok(c.heatHistoryUrl.startsWith('data/public-north/'));
});
test('SIM-01 forecast-worker thật init cùng stats và chạy một job từ state thật',async()=>{
  const {net,graph,roads,widthOf,drawn,signalPlan}=await publicNetwork(),{createTrafficSim31}=await product('city-traffic-sim-31.js'),messages=[],original=globalThis.self;globalThis.self={postMessage:m=>messages.push(m)};
  try{await product('forecast-worker-32.js');self.onmessage({data:{type:'init',graph,roads,widths:roads.map((_,i)=>widthOf(i)),drawn:roads.map((_,i)=>drawn(i)),signalPlan,expectStats:JSON.stringify(net.stats)}});
    assert.equal(messages[0]?.type,'ready',`Forecast init thật ${JSON.stringify(messages[0])}`);assert.deepEqual(messages[0].stats,net.stats);assert.ok(messages[0].NL>0);
    const sim=createTrafficSim31(net,{seed:31031,signalPlan});sim.setFraction(.01);self.onmessage({data:{type:'run',id:'north-test-job',job:{state:sim.exportState(),mode:'fixed',horizonsMin:[.02],scale:1}}});
    const result=messages.at(-1);assert.equal(result.type,'result',`Forecast job thật ${JSON.stringify(result)}`);assert.equal(result.id,'north-test-job');assert.equal(result.levels[.02].length,net.NE);assert.ok(result.active>0);
  }finally{globalThis.self=original;}
});
