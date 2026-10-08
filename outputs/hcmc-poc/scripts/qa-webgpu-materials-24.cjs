const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('webgpu-materials-24.html');
const js=read('webgpu-materials-24.js');
const corrections=read('data/webgpu-corrections-24.js');
const entry=read('webgpu-entry-24.js');
const manifest=JSON.parse(read('data/webgpu-materials-24.json'));
const evidence=JSON.parse(read('data/ba-son-marina-24.json'));
const checks=[];
function check(name,fn){fn();checks.push(name);}
check('Three.js r186 WebGPU build is vendored',()=>{
  assert(fs.existsSync(path.join(root,'vendor/three186/three.webgpu.js')));
  assert(read('vendor/three186/three.core.js').includes("const REVISION = '186'"));
});
check('Import map resolves three/webgpu and three/tsl locally',()=>{
  assert(html.includes('"three/webgpu"'));
  assert(html.includes('"three/tsl"'));
  assert(!html.includes('https://cdn.'));
});
check('Universal renderer prefers WebGPU and retains WebGL 2 fallback',()=>{
  assert(js.includes('new THREE.WebGPURenderer'));
  assert(js.includes('forceWebGL:true'));
  assert(js.includes("renderer.backend?.isWebGPUBackend"));
});
check('City material is physical TSL NodeMaterial without WebGL shader patching',()=>{
  assert(js.includes('new THREE.MeshPhysicalNodeMaterial'));
  assert(js.includes('cityMaterial.colorNode'));
  assert(!js.includes('onBeforeCompile'));
  assert(!js.includes('ShaderMaterial'));
});
check('All building vertices carry semantic material attributes',()=>{
  for(const attribute of ['baseColor24','surface24','class24','seed24','direct24'])assert(js.includes(attribute));
});
check('Visual baseline comparison and three lighting states exist',()=>{
  assert(js.includes('compareDown'));
  for(const state of ['day','golden','night'])assert(js.includes(`${state}:`));
});
check('Ba Son cable-stayed structure and Marina Central 240 m correction are present',()=>{
  assert(html.includes('data/ba-son-bridge-detail.js'));
  assert(html.includes('data/webgpu-corrections-24.js'));
  assert(html.includes('data-view="bason"'));
  assert(js.includes("bridgeGroup.name='Cầu Ba Son · kết cấu dây văng'"));
  assert(js.includes('bridgeCableGroup'));
  assert(js.includes('cables:28'));
  assert(js.includes("marinaDetail.name='Marina Central Tower · nhận diện 24B'"));
  assert(js.includes('heightM:240'));
  for(const id of ['1432358258','1432358259','1432358260'])assert(corrections.includes(id));
});
check('Four stale low Grand Marina construction footprints become residential towers',()=>{
  assert(js.includes('grandMarinaHeightCorrections'));
  assert(js.includes("grandMarinaDetail.name='Grand Marina Residences · cụm 4 tháp hiện hữu'"));
  for(const id of ['1151026864','1151026865','1151026866','1151026867'])assert(corrections.includes(id));
  assert(js.includes('correctedTowers:4'));
  assert(js.includes("towerNameMapping:'withheld_pending_official_geospatial_plan'"));
});
check('Curated corrections do not mutate the source city dataset',()=>{
  assert(js.includes('const renderBuildings=D.buildings.map'));
  assert(js.includes('const building=renderBuildings[low]'));
  assert(!js.includes('Object.assign(b,grandMarinaCorrection'));
  assert(corrections.includes("version:'30b'"));
  assert.equal(evidence.version,'24e');
});
check('Daytime glazing avoids black perforation while night retains depth',()=>{
  assert(js.includes("const glassDay=mix(color('#526b77'),color('#8ca3aa')"));
  assert(js.includes("const concreteWindow=mix(color('#566163'),color('#858d8b')"));
  assert(js.includes("const windowBlend=windowMask.mul(mix(float(.38),float(.72),nightLevel))"));
  assert(js.includes('rich=mix(rich,windowColor,windowBlend)'));
});
check('Visual 26 uses bounded haze, directional contact shading and separated PBR classes',()=>{
  assert(js.includes("day:createSkyTexture('#287eb4','#79bfe2','#f3f8fb')"));
  assert(js.includes("const groundContact=mix(float(.7),float(1),smoothstep(1.5,22,positionWorld.y))"));
  assert(js.includes("const materialRoughness=select(isGlass"));
  assert(js.includes("scene.fog.density=Math.min(activeFogDensity,Math.max(.000018,.22/cameraDistance))"));
  assert(js.includes("sun.shadow.mapSize.set(4096,4096)"));
});
check('Visual Runtime 30B uses official temporal, AO and cascade primitives',()=>{
  const runtime=read('city-visual-runtime-30.js');
  const detail=read('city-detail-runtime-28.js');
  const hero=read('city-hero-corridor-30.js');
  assert(js.includes("from './city-visual-runtime-30.js?v=30b'"));
  assert(js.includes("from './city-detail-runtime-28.js?v=30b-31e2'"));
  assert(js.includes("from './city-street-furniture-31.js?v=30b-31e2'"));
  assert(js.includes("from './city-hero-corridor-30.js?v=30b-31g'"));
  assert(js.includes("from './city-identity-facades-30.js?v=30b'"));
  assert(js.includes('createCityRenderPipeline(renderer,scene,camera,visualQuality)'));
  assert(js.includes('createCityDetailRuntime({scene,buildings:renderBuildings.filter'));
  assert(js.includes('createAdaptiveQuality(renderer'));
  assert(js.includes('createCityShadowSystem({renderer,light:sun,quality:visualQuality,camera})'));
  assert(js.includes('shadowSystem.update(target,cameraDistance)'));
  assert(js.includes('cityDetailRuntime.update(cameraDistance,nightLevel.value)'));
  assert(js.includes("heroCorridor.update(cameraDistance,nightLevel.value,activeView==='corridor')"));
  assert(js.includes("licenseIsolation:'clean-room implementation; no SpiderBench source or assets'"));
  assert(runtime.includes('new THREE.RenderPipeline(renderer)'));
  for(const primitive of ["from 'three/addons/tsl/display/GTAONode.js'","from 'three/addons/tsl/display/TRAANode.js'","from 'three/addons/tsl/display/BloomNode.js'","from 'three/addons/csm/CSMShadowNode.js'"])assert(runtime.includes(primitive));
  assert(runtime.includes('Leave `camera` null here'));
  assert(hero.includes('Opera sourced identity patch'));
  assert(hero.includes('Continental sourced facade'));
  assert(hero.includes('Caravelle sourced low wing'));
  assert(hero.includes("classification:'site photos on approximate open-map envelopes'"));
  for(const layer of ['Hero roof parapets','Hero facade ledges','Hero podium cornices','Street awnings','Ground-floor lightbox signs','Rooftop water and plant tanks'])assert(detail.includes(layer));
  // Bước E2 31A: đèn đường chuyển sang city-street-furniture-31.js (theo mép mặt đường hợp nhất).
  for(const layer of ['Street lamp poles','Street lamp heads','Zebra crossings 31'])assert(read('city-street-furniture-31.js').includes(layer));
  assert(detail.includes("classification:'inferred presentation geometry'"));
});
check('Facade, vegetation and water receive multi-scale detail',()=>{
  assert(js.includes('const frameMask='));
  assert(js.includes('const mullionMask='));
  assert(js.includes('const semanticWindow='));
  assert(js.includes('const towerFin='));
  assert(js.includes('const glassSpandrel='));
  assert(js.includes('const residentialBalcony='));
  assert(js.includes('const farCanopies='));
  assert(js.includes('const currentBand='));
  assert(js.includes('const waterFresnel='));
  assert(!js.includes('createPropWash'));
});
check('Urban motion: xe 31D chạy trên đồ thị đường, tàu 26B trong lòng sông',()=>{
  assert(js.includes("trafficGroup.name='Dense Vietnamese road traffic · illustrative'"));
  // Xe minh họa bước D 31A: module city-traffic-31.js (QA hành vi chi tiết ở qa-traffic-31.cjs).
  assert(js.includes("import { createTraffic31 } from './city-traffic-31.js?v=30b-31d'"));
  assert(js.includes('const traffic=createTraffic31({scene:trafficGroup,graph:window.ROAD_GRAPH_31'));
  assert(js.includes('traffic.update(now,cameraDistance,updateFrame)'));
  assert(!js.includes('trafficItems'), 'xe đoạn thẳng 26B phải được thay hoàn toàn');
  assert(js.includes('function createWakeBand(startX,endX,spread,width)'));
  assert(js.includes("createWakeBand(-11,-47,18,.82)"));
  assert(js.includes('const wakeUv=uv(),headFade='));
  assert(js.includes('headFade.mul(tailFade).mul(edgeFade)'));
  assert(js.includes('blending:THREE.NormalBlending'));
  assert(js.includes('motionDummy.position.set(x,.72,z)'));
  assert(js.includes('u:item.reverse?1-baseU:baseU'));
  assert(js.includes('vesselHeadingMismatches'));
  assert(js.includes('vesselSamplesOutsideWater'));
  assert(js.includes("vesselRoute:'illustrative Saigon River lane'"));
  assert(js.includes('advanceUrbanMotion(now)'));
});
check('Public entry from the stable demo exists',()=>{
  assert(entry.includes('webgpu-materials-24.html'));
  assert(read('index.html').includes('webgpu-entry-24.js'));
});
check('Manifest declares the rendered scope and limitations',()=>{
  assert.equal(manifest.version,'30b');
  assert.equal(manifest.scope.renderedBuildings,70726);
  assert.equal(manifest.scope.materialFamilies,8);
  assert(manifest.limits.length>=4);
});
check('Flood 25B focuses Thao Dien and renders bounded road-water proxies',()=>{
  assert(js.includes('flood25:{target:xyz(106.7305,10.8030,24)'));
  assert(js.includes("{name:'Quốc Hương',maxDepthM:.40"));
  assert(js.includes("{name:'Thảo Điền',maxDepthM:.40"));
  assert(js.includes("{name:'Nguyễn Văn Hưởng',maxDepthM:.25"));
  assert(js.includes("Math.min(200,Number(amountMm)"));
});
check('IOC 28B exposes compound rain-tide stress state, map beacons and compact shell',()=>{
  assert(js.includes("alertRoadNames=['Quốc Hương','Thảo Điền','Nguyễn Văn Hưởng'"));
  assert(js.includes('function setFloodScenario(amountMm,tideM=floodTideM)'));
  assert(js.includes("alertLevel=severity>=.78?'red'"));
  assert(js.includes('hydraulicOutput:false'));
});
console.log(JSON.stringify({suite:'webgpu-materials-24',passed:checks.length,checks},null,2));
