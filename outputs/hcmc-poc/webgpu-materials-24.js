import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, color, distance as nodeDistance, dot, float, floor,
  fract, max, min, mix, normalWorldGeometry, positionWorld, pow, select, sin, smoothstep,
  step, time, uniform, uv, varying, vec2, vec3
} from 'three/tsl';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import {
  createAdaptiveQuality, createCityRenderPipeline, createCityShadowSystem,
  resolveVisualQuality, smoothDampScalar, smoothDampVector
} from './city-visual-runtime-30.js?v=30b';
import { createCityDetailRuntime } from './city-detail-runtime-28.js?v=30b-31e2';
import { createHeroCorridor30 } from './city-hero-corridor-30.js?v=30b';
import { createIdentityFacades30 } from './city-identity-facades-30.js?v=30b';
import { createRoadNetwork31 } from './city-road-network-31.js?v=30b-31e2';
import { createStreetFurniture31, hiddenFootwayRoads } from './city-street-furniture-31.js?v=30b-31e2';
import { createBridges31, loftStrip } from './city-bridges-31.js?v=30b-31c';

const D=window.CITY_DATA;
const SM=window.SEMANTIC_MATERIALS_08||{records:{},directTaggedBuildings:0,directCoveragePercent:0};
const CORRECTIONS=window.WEBGPU_CORRECTIONS_24;
if(!CORRECTIONS)throw new Error('WEBGPU_CORRECTIONS_24 không khả dụng');
const APP_VERSION=CORRECTIONS.version;
const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search);
const forceWebGL=params.get('backend')==='webgl';
const requestedQuality=params.get('quality')||'presentation';
let activeLight='day';
const loading=$('#loading'),loaderText=$('#loaderText'),loaderProgress=$('#loaderProgress');
const setProgress=(value,text)=>{loaderProgress.style.width=`${Math.max(3,Math.min(100,value))}%`;if(text)loaderText.textContent=text;};
const yieldMain=()=>new Promise(resolve=>setTimeout(resolve,0));
const materialStatus=window.webgpuMaterials24={version:APP_VERSION,state:'initializing'};

if(!D?.buildings?.length)throw new Error('CITY_DATA không khả dụng');

let renderer;
try{
  renderer=new THREE.WebGPURenderer({antialias:forceWebGL,forceWebGL,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  await renderer.init();
}catch(error){
  console.warn('WebGPU init failed; retrying universal renderer with WebGL 2 backend.',error);
  renderer=new THREE.WebGPURenderer({antialias:true,forceWebGL:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;
  await renderer.init();
}

$('#scene').append(renderer.domElement);
const actualWebGPU=!!renderer.backend?.isWebGPUBackend;
const visualQuality=resolveVisualQuality(requestedQuality,actualWebGPU);
renderer.setPixelRatio(Math.min(devicePixelRatio,visualQuality.maxPixelRatio));
renderer.setSize(innerWidth,innerHeight);
const backendElement=$('#backend');
if(backendElement)backendElement.textContent=actualWebGPU?'WEBGPU / TSL':'WEBGL 2 / TSL FALLBACK';
document.body.dataset.backend=actualWebGPU?'webgpu':'webgl2';
document.body.dataset.quality=visualQuality.id;
setProgress(10,'Đang dựng hệ vật liệu PBR…');

const scene=new THREE.Scene();
function createSkyTexture(top,middle,bottom){
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;
  const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,top);gradient.addColorStop(.58,middle);gradient.addColorStop(1,bottom);
  context.fillStyle=gradient;context.fillRect(0,0,2,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
}
const skyTextures={
  day:createSkyTexture('#287eb4','#79bfe2','#f3f8fb'),
  golden:createSkyTexture('#766f6b','#9b806f','#c6a079'),
  night:createSkyTexture('#010610','#040d18','#0b1620')
};
scene.background=skyTextures.day;
scene.fog=new THREE.FogExp2('#a1aaa5',0.000072);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,3,30000);

const hemi=new THREE.HemisphereLight('#dbe5e4','#665b4f',.88);
scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0ce',3.15);
sun.position.set(-2300,3500,1800);
sun.castShadow=true;
sun.shadow.mapSize.set(4096,4096);
Object.assign(sun.shadow.camera,{left:-3300,right:3300,top:3300,bottom:-3300,near:80,far:11000});
sun.shadow.bias=-0.0001;
sun.shadow.normalBias=.85;
sun.shadow.radius=1.35;
scene.add(sun,sun.target);
const shadowSystem=createCityShadowSystem({renderer,light:sun,quality:visualQuality,camera});

// The HDRI is lighting context only and is never represented as captured HCMC imagery.
new HDRLoader().load('data/venice_sunset_1k.hdr',texture=>{
  texture.mapping=THREE.EquirectangularReflectionMapping;
  scene.environment=texture;
  materialStatus.environment={loaded:true,source:'Poly Haven Venice Sunset 1K',license:'CC0'};
},undefined,()=>{materialStatus.environment={loaded:false};});

const center=D.meta.center;
const xyz=(lon,lat,y=0)=>new THREE.Vector3((lon-center[0])*111320*Math.cos(center[1]*Math.PI/180),y,(center[1]-lat)*110574);
const hash01=id=>{let x=(Number(id)||1)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;return(x>>>0)/4294967295;};
const families={GENERIC:0,RESIDENTIAL:1,GLASS:2,CIVIC:3,INDUSTRIAL:4,CENTRAL:5,RELIGIOUS:6,MIXED:7};
const marinaParts=new Map(Object.entries(CORRECTIONS.marinaCentral.parts).map(([id,value])=>[Number(id),value]));
// Four large OSM construction footprints immediately north of Marina Central are stale low proxies.
// Official project updates identify the built/high-rise Lake, Sea, Cove and Lagoon residential cluster.
// Heights remain floor-count proxies until surveyed/BIM geometry is licensed; tower-name-to-footprint mapping is deliberately withheld.
const grandMarinaHeightCorrections=new Map(Object.entries(CORRECTIONS.grandMarina.parts).map(([id,value])=>[Number(id),value]));
// Bước C 31A: bảng sửa lỗi công trình runtime (data/bridge-corrections-31.js). Mỗi mục có lý do: ẩn footprint xuyên mặt
// cầu/nằm trong mặt đường, hoặc nâng đáy mái/hạ đỉnh. Không sửa CITY_DATA; công trình signature không có trong bảng.
const BRIDGE_FIXES=new Map((window.BRIDGE_CORRECTIONS_31?.buildings||[]).map(entry=>[Number(entry.id),entry]));
const renderBuildings=D.buildings.map(source=>{
  const id=Number(source.id),fix=BRIDGE_FIXES.get(id);
  if(fix)return fix.action==='hide'?{...source,hiddenByCorrection:fix.rule}:{...source,min:fix.setMin??source.min,h:fix.setH??source.h,correctedBy:fix.rule};
  const heightCorrection=grandMarinaHeightCorrections.get(id),marinaCorrection=marinaParts.get(id);
  if(heightCorrection)return {...source,...heightCorrection,...CORRECTIONS.grandMarina.shared};
  if(marinaCorrection&&!source.name)return {...source,...marinaCorrection};
  return source;
});
{
  const counts={hidden:0,adjusted:0,byRule:{}};
  for(const entry of BRIDGE_FIXES.values()){entry.action==='hide'?counts.hidden++:counts.adjusted++;counts.byRule[entry.rule]=(counts.byRule[entry.rule]||0)+1;}
  materialStatus.buildingCorrections={version:window.BRIDGE_CORRECTIONS_31?.version||null,source:'data/bridge-corrections-31.js',...counts};
}

function classify(b){
  const d=SM.records[String(b.id)]||{};
  const type=(b.type||'').toLowerCase();
  if(b.glass||d['building:material']==='glass'||b.h>105)return families.GLASS;
  if(/house|apartment|residential|terrace/.test(type))return families.RESIDENTIAL;
  if(/school|university|college|hospital|civic|kindergarten|palace/.test(type))return families.CIVIC;
  if(/industrial|warehouse|shed|construction/.test(type))return families.INDUSTRIAL;
  if(/temple|church|chapel|mosque/.test(type))return families.RELIGIOUS;
  if(/office|commercial|hotel|retail|train_station/.test(type))return families.CENTRAL;
  if(b.center[0]>-1100&&b.center[0]<800&&b.center[1]>-600&&b.center[1]<1750)return families.CENTRAL;
  return b.h<22?families.GENERIC:families.MIXED;
}

// Broad HCMC aerial palette: warm masonry and roofs, neutral reflective towers,
// several tropical greens. Distribution is deterministic per footprint so the
// city remains stable between frames without claiming surveyed facade colours.
const palettes=[
  ['#d6c9b3','#c5baa6','#dfd5c1','#bcc5b7','#bec8c5','#d0b6a8'],
  ['#d3a28c','#dfbd9d','#c58c78','#d8c39b','#a9bcaf','#a9bbbc'],
  ['#758b95','#697f8a','#8ca0a7','#6e838d','#81949c','#627985'],
  ['#d8b777','#cfa266','#e2c893','#c4836f','#adb98e','#ddbea8'],
  ['#74807c','#677473','#898b7e','#607277','#7e8a7e','#91826e'],
  ['#7c898b','#6e7d80','#90918b','#6d8085','#818d8e','#65777c'],
  ['#cf814d','#bf653f','#dda967','#dfc18f','#ad774e','#c45c43'],
  ['#b8ad9c','#a5b29f','#c1a69b','#9dadae','#b3a8b5','#c4b68d']
];
const roofPalettes=[
  ['#a15f46','#c4774d','#6f8379','#527e8c','#8c7766'],
  ['#ad4937','#d26842','#8e3840','#d9914c','#568575'],
  ['#5f6d70','#727f82','#66747a','#89918e','#505d62'],
  ['#b67c43','#d69b4a','#9d543e','#d2b66d','#6f8a78'],
  ['#586c70','#6d7770','#487584','#8b765f','#5f836e'],
  ['#5b696c','#6f7b7c','#637077','#858e89','#4f5d61'],
  ['#b64d32','#d66f39','#9e382f','#d69b43','#8e552e'],
  ['#837361','#9a5d48','#5f8178','#4e7f91','#8d6e82']
];

function taggedColor(value,fallback){
  try{
    if(!value)return fallback;
    const parsed=new THREE.Color(value),hsl={h:0,s:0,l:0};parsed.getHSL(hsl);
    parsed.setHSL(hsl.h,Math.min(.44,hsl.s),Math.max(.2,Math.min(.8,hsl.l)));
    return parsed;
  }catch{return fallback;}
}
function baseColors(b,kind){
  const d=SM.records[String(b.id)]||{};
  const seed=hash01(b.id);
  const p=palettes[kind],rp=roofPalettes[kind];
  const wall=taggedColor(d['building:colour'],new THREE.Color(p[Math.floor(seed*p.length)]));
  const roof=taggedColor(d['roof:colour'],new THREE.Color(rp[Math.floor(hash01(Number(b.id)+913)*rp.length)]));
  if(kind===families.GLASS||kind===families.CENTRAL||b.h>=45){
    const towerLike=b.h>=45;
    if(towerLike)wall.lerp(new THREE.Color('#8faab5'),.22);
    const wallHsl={h:0,s:0,l:0},roofHsl={h:0,s:0,l:0};wall.getHSL(wallHsl);roof.getHSL(roofHsl);
    wall.setHSL(wallHsl.h,Math.min(.22,wallHsl.s),Math.max(towerLike?.3:.32,Math.min(towerLike?.62:.64,wallHsl.l)));
    roof.setHSL(roofHsl.h,Math.min(.16,roofHsl.s),Math.max(.24,Math.min(.58,roofHsl.l)));
  }else{
    const wallHsl={h:0,s:0,l:0};wall.getHSL(wallHsl);
    const cap=kind===families.RELIGIOUS?.36:kind===families.RESIDENTIAL?.3:.24;
    wall.setHSL(wallHsl.h,Math.min(cap,wallHsl.s),Math.max(.27,Math.min(.72,wallHsl.l)));
  }
  return {wall,roof,direct:!!(d['building:colour']||d['roof:colour']||d['building:material']||d['roof:material'])};
}

const positions=[],uvs=[],baseRgb=[],surfaces=[],classes=[],seeds=[],directs=[],faceEnds=[];
const roofFixtures=[];
// These three sourced hero envelopes replace their coarse merged proxies. The
// original records remain in CITY_DATA and in the picking/evidence model.
const heroEnvelopeIds=new Set([801710792,2000032897,39598465]);
function vertex(p,tex,c,surface,kind,seed,direct){
  positions.push(p[0],p[1],p[2]);uvs.push(tex[0],tex[1]);baseRgb.push(c.r,c.g,c.b);
  surfaces.push(surface);classes.push(kind);seeds.push(seed);directs.push(direct?1:0);
}
function tri(a,b,c,ta,tb,tc,tint,surface,kind,seed,direct){
  vertex(a,ta,tint,surface,kind,seed,direct);vertex(b,tb,tint,surface,kind,seed,direct);vertex(c,tc,tint,surface,kind,seed,direct);
}

for(let bi=0;bi<renderBuildings.length;bi++){
  const b=renderBuildings[bi];
  if(heroEnvelopeIds.has(Number(b.id))){faceEnds.push(positions.length/9);continue;}
  if(b.hiddenByCorrection){faceEnds.push(positions.length/9);continue;}   // bảng sửa lỗi 31C: footprint ẩn không vẽ
  const kind=classify(b),seed=hash01(b.id),tones=baseColors(b,kind);
  const y=b.h+1.5,base=b.min+1.5,ring=b.r[0];
  const flat=[],holes=[];let count=0;
  for(let ri=0;ri<b.r.length;ri++){
    if(ri)holes.push(count);
    for(const p of b.r[ri]){flat.push(p[0],p[1]);count++;}
  }
  const rd=(b.roofDirection||127.5)*Math.PI/180;
  const ds=ring.map(p=>p[0]*Math.sin(rd)-p[1]*Math.cos(rd));
  const dmin=Math.min(...ds),dmax=Math.max(...ds);
  const roofY=(x,z)=>b.roof==='skillion'&&b.roofHeight?y-b.roofHeight*((x*Math.sin(rd)-z*Math.cos(rd)-dmin)/Math.max(.01,dmax-dmin)):y;
  const indices=window.earcut(flat,holes,2);
  for(let j=0;j<indices.length;j+=3){
    const vs=[indices[j],indices[j+2],indices[j+1]].map(k=>[flat[k*2],roofY(flat[k*2],flat[k*2+1]),flat[k*2+1]]);
    tri(vs[0],vs[1],vs[2],[0,0],[0,0],[0,0],tones.roof,0,kind,seed,tones.direct);
  }
  for(const r of b.r){
    for(let j=0;j<r.length;j++){
      const a=r[j],bb=r[(j+1)%r.length],length=Math.hypot(a[0]-bb[0],a[1]-bb[1]);
      const v0=[a[0],base,a[1]],v1=[bb[0],base,bb[1]],v2=[a[0],roofY(a[0],a[1]),a[1]],v3=[bb[0],roofY(bb[0],bb[1]),bb[1]];
      const surface=kind===families.GLASS?2:1;
      tri(v0,v1,v2,[0,base],[length,base],[0,roofY(a[0],a[1])],tones.wall,surface,kind,seed,tones.direct);
      tri(v1,v3,v2,[length,base],[length,y],[0,roofY(a[0],a[1])],tones.wall,surface,kind,seed,tones.direct);
    }
  }
  faceEnds.push(positions.length/9);
  if(b.h>18&&b.h<190&&Number(b.id)%4===0){
    const area=Math.abs(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0))/2;
    roofFixtures.push({x:b.center[0],z:b.center[1],y:y+1.1,scale:Math.min(5,Math.max(1.4,Math.sqrt(area)*.11)),seed});
  }
  if(bi%5000===0){setProgress(12+bi/renderBuildings.length*42,`Đang phân loại ${bi.toLocaleString('vi-VN')} / ${renderBuildings.length.toLocaleString('vi-VN')} công trình…`);await yieldMain();}
}

setProgress(57,'Đang biên dịch vật liệu TSL…');
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
geometry.setAttribute('baseColor24',new THREE.Float32BufferAttribute(baseRgb,3));
geometry.setAttribute('surface24',new THREE.Float32BufferAttribute(surfaces,1));
geometry.setAttribute('class24',new THREE.Float32BufferAttribute(classes,1));
geometry.setAttribute('seed24',new THREE.Float32BufferAttribute(seeds,1));
geometry.setAttribute('direct24',new THREE.Float32BufferAttribute(directs,1));
geometry.computeVertexNormals();

const realism=uniform(1);
const nightLevel=uniform(0);
const base=varying(attribute('baseColor24','vec3'));
const surface=varying(attribute('surface24','float'));
const materialClass=varying(attribute('class24','float'));
const buildingSeed=varying(attribute('seed24','float'));
const directTag=varying(attribute('direct24','float'));
const facadeUv=uv();
const detailFade=float(1).sub(smoothstep(800,3600,nodeDistance(positionWorld,cameraPosition)));
const bayWidth=mix(float(2.45),float(4.3),fract(buildingSeed.mul(17.17)));
const floorHeight=mix(float(3.05),float(4.15),fract(buildingSeed.mul(31.73)));
const cell=fract(vec2(facadeUv.x.div(bayWidth),facadeUv.y.div(floorHeight)));
const room=floor(vec2(facadeUv.x.div(bayWidth),facadeUv.y.div(floorHeight)));
const roomRandom=fract(sin(dot(room.add(buildingSeed.mul(113.7)),vec2(12.9898,78.233))).mul(43758.5453));
const isWall=surface.greaterThan(.5);
const isGlass=surface.greaterThan(1.5).or(materialClass.equal(families.GLASS));
const isResidential=materialClass.equal(families.RESIDENTIAL);
const isCivic=materialClass.equal(families.CIVIC).or(materialClass.equal(families.RELIGIOUS));
const insideX=smoothstep(.12,.2,cell.x).mul(float(1).sub(smoothstep(.78,.88,cell.x)));
const insideY=smoothstep(.18,.28,cell.y).mul(float(1).sub(smoothstep(.67,.79,cell.y)));
const innerX=smoothstep(.22,.28,cell.x).mul(float(1).sub(smoothstep(.7,.76,cell.x)));
const innerY=smoothstep(.29,.34,cell.y).mul(float(1).sub(smoothstep(.61,.67,cell.y)));
// Semantic facade kits break the repeated universal window grid. Curtain-wall
// towers use broad glazing, housing keeps narrower punched openings, and civic
// buildings use slower, wider bays. This is a deterministic visual inference,
// never a claim that an individual facade has been surveyed.
const curtainX=smoothstep(.035,.09,cell.x).mul(float(1).sub(smoothstep(.91,.965,cell.x)));
const curtainY=smoothstep(.045,.1,cell.y).mul(float(1).sub(smoothstep(.9,.955,cell.y)));
const curtainInnerX=smoothstep(.105,.15,cell.x).mul(float(1).sub(smoothstep(.85,.895,cell.x)));
const curtainInnerY=smoothstep(.12,.16,cell.y).mul(float(1).sub(smoothstep(.84,.89,cell.y)));
const residentialX=smoothstep(.2,.27,cell.x).mul(float(1).sub(smoothstep(.7,.8,cell.x)));
const residentialY=smoothstep(.2,.27,cell.y).mul(float(1).sub(smoothstep(.66,.74,cell.y)));
const residentialInnerX=smoothstep(.28,.33,cell.x).mul(float(1).sub(smoothstep(.64,.69,cell.x)));
const residentialInnerY=smoothstep(.3,.35,cell.y).mul(float(1).sub(smoothstep(.58,.64,cell.y)));
const civicX=smoothstep(.08,.16,cell.x).mul(float(1).sub(smoothstep(.84,.92,cell.x)));
const civicY=smoothstep(.26,.34,cell.y).mul(float(1).sub(smoothstep(.62,.7,cell.y)));
const civicInnerX=smoothstep(.18,.23,cell.x).mul(float(1).sub(smoothstep(.77,.82,cell.x)));
const civicInnerY=smoothstep(.36,.41,cell.y).mul(float(1).sub(smoothstep(.55,.6,cell.y)));
const semanticWindow=select(isGlass,curtainX.mul(curtainY),select(isResidential,residentialX.mul(residentialY),select(isCivic,civicX.mul(civicY),insideX.mul(insideY))));
const semanticInner=select(isGlass,curtainInnerX.mul(curtainInnerY),select(isResidential,residentialInnerX.mul(residentialInnerY),select(isCivic,civicInnerX.mul(civicInnerY),innerX.mul(innerY))));
const windowMask=semanticWindow.mul(isWall).mul(detailFade);
const innerWindow=semanticInner.mul(isWall).mul(detailFade);
const frameMask=max(float(0),windowMask.sub(innerWindow));
const mullionX=float(1).sub(smoothstep(.012,.045,abs(cell.x.sub(.5)))).mul(innerWindow);
const mullionY=float(1).sub(smoothstep(.012,.04,abs(cell.y.sub(.48)))).mul(innerWindow);
const mullionMask=max(mullionX,mullionY).mul(detailFade);
const facadeNoise=fract(sin(dot(positionWorld.xz,vec2(.06711056,.00584731)).add(buildingSeed.mul(91.17))).mul(19341.734));
const weatherStreak=fract(sin(facadeUv.x.mul(.37).add(buildingSeed.mul(47.1))).mul(977.37));
const streakMask=smoothstep(.78,.98,weatherStreak).mul(float(1).sub(smoothstep(24,150,facadeUv.y))).mul(isWall);
const verticalShade=mix(.78,1.045,smoothstep(1.5,85,facadeUv.y));
const wallWeather=mix(.83,1.055,facadeNoise).mul(verticalShade);
const faceDirection=smoothstep(-.42,.82,dot(normalWorldGeometry,vec3(.44,.77,.38)));
const directionalShade=mix(float(.76),float(1.045),faceDirection);
const groundContact=mix(float(.7),float(1),smoothstep(1.5,22,positionWorld.y));
const wallColor=base.mul(wallWeather).mul(directionalShade).mul(groundContact);
const glassDay=mix(color('#526b77'),color('#8ca3aa'),smoothstep(.2,.86,roomRandom));
const glassNight=mix(color('#303c42'),color('#70797a'),roomRandom);
const glassColor=mix(glassDay,glassNight,nightLevel.mul(.75));
const concreteWindow=mix(color('#566163'),color('#858d8b'),roomRandom.mul(.7));
const interiorShade=mix(float(.68),float(1.04),smoothstep(.28,.76,cell.y));
const windowColor=select(isGlass,glassColor,concreteWindow).mul(interiorShade);
const windowBlend=windowMask.mul(mix(float(.38),float(.72),nightLevel));
const floorBand=float(1).sub(smoothstep(.02,.095,cell.y)).mul(isWall).mul(detailFade);
const residentialBalcony=float(1).sub(smoothstep(.035,.105,abs(cell.y.sub(.86)))).mul(materialClass.equal(families.RESIDENTIAL)).mul(isWall).mul(detailFade);
const lowerStorey=float(1).sub(smoothstep(5.5,9.5,positionWorld.y)).mul(isWall).mul(detailFade);
const shopMask=insideX.mul(float(1).sub(smoothstep(.82,.94,cell.x))).mul(lowerStorey);
const towerFinDistance=min(abs(cell.x.sub(.08)),abs(cell.x.sub(.92)));
const towerFin=float(1).sub(smoothstep(.015,.055,towerFinDistance)).mul(isGlass).mul(isWall).mul(detailFade);
const glassSpandrel=float(1).sub(smoothstep(.045,.12,abs(cell.y.sub(.08)))).mul(isGlass).mul(isWall).mul(detailFade);
const roofWarm=select(materialClass.equal(families.RESIDENTIAL).or(materialClass.equal(families.RELIGIOUS)),color('#92573e'),base.mul(.63));
const roofColor=mix(base.mul(.72),roofWarm,.72).mul(mix(.9,1.06,facadeNoise));
let rich=mix(roofColor,wallColor,isWall);
rich=mix(rich,windowColor,windowBlend);
rich=mix(rich,color('#b4b9b3'),frameMask.mul(select(isGlass,float(.2),float(.38))));
rich=mix(rich,color('#28383d'),mullionMask.mul(select(isGlass,float(.38),float(.16))));
rich=mix(rich,color('#a9b7b8'),towerFin.mul(.36));
rich=mix(rich,color('#344a52'),glassSpandrel.mul(.42));
rich=mix(rich,rich.mul(.66),floorBand.mul(.34));
rich=mix(rich,base.mul(.54),residentialBalcony.mul(.52));
rich=mix(rich,color('#263d40'),shopMask.mul(.48));
rich=mix(rich,rich.mul(.74),streakMask.mul(.22));
rich=mix(rich,base.mul(1.08),directTag.mul(.12));
const richLuma=dot(rich,vec3(.2126,.7152,.0722));
// Full colour is concentrated in near/mid distance. The far field keeps a
// softer aerial cue, matching the colour falloff seen in hazy wide HCMC views.
const richSaturation=mix(float(1.015),float(1.085),detailFade);
const richContrast=mix(float(1.06),float(1.13),detailFade);
const gradedRich=mix(vec3(richLuma),rich,richSaturation).sub(.5).mul(richContrast).add(.5);

const cityMaterial=new THREE.MeshPhysicalNodeMaterial({side:THREE.DoubleSide});
cityMaterial.colorNode=mix(base,gradedRich,realism);
const materialRoughness=select(isGlass,mix(float(.38),float(.13),innerWindow),mix(float(.91),float(.55),innerWindow));
cityMaterial.roughnessNode=mix(float(.86),materialRoughness,realism);
cityMaterial.metalnessNode=mix(float(.04),select(isGlass,float(.21),float(.012)),realism);
cityMaterial.clearcoatNode=select(isGlass,float(.62),float(.025)).mul(realism);
cityMaterial.clearcoatRoughnessNode=select(isGlass,float(.18),float(.72));
const litRoom=innerWindow.mul(step(.972,roomRandom)).mul(nightLevel).mul(realism).mul(.34);
cityMaterial.emissiveNode=color('#ffc47f').mul(litRoom);

const city=new THREE.Mesh(geometry,cityMaterial);
city.castShadow=true;
city.receiveShadow=true;
scene.add(city);

// Context layers keep the PBR facade readable without inventing surveyed detail.
function flatGeometry(rings,y=0){
  const flat=[],holes=[];let count=0;
  for(let i=0;i<rings.length;i++){if(i)holes.push(count);for(const p of rings[i]){flat.push(p[0],p[1]);count++;}}
  const ids=window.earcut(flat,holes,2),out=[];
  for(let i=0;i<ids.length;i+=3)for(const k of [ids[i],ids[i+2],ids[i+1]])out.push(flat[k*2],y,flat[k*2+1]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();return g;
}
function mergeGeometry(items){
  const out=[];for(const g of items)out.push(...g.attributes.position.array);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();return g;
}
// Nền đất tối hơn 30B (#b9b29e) để khe giữa các mặt đường không lộ thành vệt sáng; màu nhân với ảnh Sentinel-2.
const groundTint='#a29c8a';
const groundMaterial=new THREE.MeshStandardNodeMaterial({color:groundTint,roughness:1});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(D.meta.width,D.meta.depth),groundMaterial);
ground.name='Nền đất · Sentinel-2 2016';
ground.geometry.rotateX(-Math.PI/2);ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
new THREE.TextureLoader().load('data/sentinel-2016.jpg',texture=>{texture.colorSpace=THREE.SRGBColorSpace;ground.material.map=texture;ground.material.color.set(groundTint);ground.material.needsUpdate=true;});
const outsideMaterial=new THREE.MeshStandardNodeMaterial({color:'#536b58',roughness:1});
const outside=new THREE.Mesh(new THREE.PlaneGeometry(60000,60000),outsideMaterial);outside.rotation.x=-Math.PI/2;outside.position.y=-3;scene.add(outside);
const parksMaterial=new THREE.MeshStandardNodeMaterial({color:'#315b38',roughness:.96,side:THREE.DoubleSide});
const parks=new THREE.Mesh(mergeGeometry(D.green.map(r=>flatGeometry(r,.35))),parksMaterial);parks.receiveShadow=true;scene.add(parks);

const waterMaterial=new THREE.MeshPhysicalNodeMaterial({roughness:.34,metalness:.09,side:THREE.DoubleSide,clearcoat:.72,clearcoatRoughness:.2,envMapIntensity:1.18});
const waterWaveA=sin(positionWorld.x.mul(.014).add(time.mul(.32)));
const waterWaveB=sin(positionWorld.z.mul(.023).sub(time.mul(.24)));
const waterWaveC=sin(positionWorld.x.add(positionWorld.z).mul(.0085).add(time.mul(.13)));
const currentBand=sin(positionWorld.x.mul(.0023).sub(positionWorld.z.mul(.0007)).add(time.mul(.055))).mul(.5).add(.5);
const fineRipple=sin(positionWorld.x.mul(.087).sub(positionWorld.z.mul(.061)).add(time.mul(.78))).mul(.5).add(.5);
const waterWave=waterWaveA.mul(.38).add(waterWaveB.mul(.28)).add(waterWaveC.mul(.18)).add(currentBand.mul(.16)).mul(.5).add(.5);
const viewToWater=cameraPosition.sub(positionWorld).normalize();
const waterFresnel=pow(float(1).sub(max(0,dot(normalWorldGeometry,viewToWater))),4);
const waterLow=color('#0b3546');
const waterMid=color('#24677b');
const waterHigh=color('#a4cad0');
let waterColor=mix(waterLow,waterMid,waterWave.mul(.66));
waterColor=mix(waterColor,waterHigh,waterFresnel.mul(.48).add(smoothstep(.9,1,waterWave).mul(.08)));
waterMaterial.colorNode=waterColor;
waterMaterial.roughnessNode=mix(float(.43),float(.17),currentBand.mul(.58).add(fineRipple.mul(.18))).add(waterFresnel.mul(.04));
const water=new THREE.Mesh(mergeGeometry(D.water.map(r=>flatGeometry(r,.7))),waterMaterial);water.receiveShadow=true;scene.add(water);

const widths={motorway:16,trunk:15,primary:14,secondary:11,tertiary:8,residential:5,living_street:4,service:3.5,unclassified:5,footway:2.5,pedestrian:12,cycleway:2,path:1.5};
// Ribbon từng đoạn không miter: chỉ còn dùng cho lớp proxy ngập 25A bên dưới; mặt đường do city-road-network-31.js dựng.
function ribbon(coords,width,y,target){
  for(let i=0;i<coords.length-1;i++){
    const a=coords[i],b=coords[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;
    const ox=-dz/length*width/2,oz=dx/length*width/2;
    const vs=[[a[0]+ox,y,a[1]+oz],[b[0]+ox,y,b[1]+oz],[a[0]-ox,y,a[1]-oz],[b[0]-ox,y,b[1]-oz]];
    for(const k of [0,2,1,1,2,3])target.push(...vs[k]);
  }
}
// Mạng đường 31A: polyline có miter, mặt giao lộ, cao độ theo profile ROAD_GRAPH_31, thứ tự vẽ bằng polygonOffset.
const roadColors={edge:'#8c9188',asphalt:'#293534',pedestrian:'#c8ad84',marking:'#f4db80'};
setProgress(58,'Đang dựng mạng đường liền mạch…');
materialStatus.roadNetwork={};
const roadNetwork=await createRoadNetwork31({scene,roads:D.roads,graph:window.ROAD_GRAPH_31,widths,colors:roadColors,hiddenRoads:hiddenFootwayRoads(D.roads,window.STREET_FURNITURE_31),yieldMain,status:materialStatus.roadNetwork,
  onProgress:value=>setProgress(58+value*12,`Đang dựng mạng đường liền mạch · ${Math.round(value*100)}%`)});

// Flood 25A visual calibration layer. The ribbons follow named OSM road centrelines
// in the observed Thao Dien corridor. Their depth is a bounded visual proxy tied to
// the documented near-200 mm event, never a hydraulic solver output or forecast.
const floodCorridors=[
  {name:'Quốc Hương',maxDepthM:.40,color:'#2f92ad'},
  {name:'Thảo Điền',maxDepthM:.40,color:'#258aa8'},
  {name:'Nguyễn Văn Hưởng',maxDepthM:.25,color:'#397f9c'}
];
const floodRoadMeshes=[];
let floodAlertLabels=[];
for(const corridor of floodCorridors){
  const points=[];
  for(const road of D.roads){
    if(road.bridge||road.tunnel||road.name!==corridor.name)continue;
    const width=road.lanes?Math.max(widths[road.type]||5,road.lanes*3.1):widths[road.type]||5;
    ribbon(road.c,width+2.2,1.18,points);
  }
  if(!points.length)continue;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();
  const m=new THREE.MeshPhysicalNodeMaterial({color:corridor.color,roughness:.22,metalness:.08,transmission:.08,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(g,m);mesh.name=`Flood proxy · ${corridor.name}`;mesh.visible=false;mesh.renderOrder=8;mesh.userData={...corridor};scene.add(mesh);floodRoadMeshes.push(mesh);
}
const alertRoadNames=['Quốc Hương','Thảo Điền','Nguyễn Văn Hưởng','Tống Hữu Định','Xuân Thủy','Nguyễn Hữu Cảnh','Điện Biên Phủ','Mai Chí Thọ'];
const floodAlertPoints=alertRoadNames.map(name=>{
  const roads=D.roads.filter(road=>road.name===name&&!road.tunnel),coords=roads.flatMap(road=>road.c);
  if(!coords.length)return null;
  return{name,x:coords.reduce((sum,p)=>sum+p[0],0)/coords.length,z:coords.reduce((sum,p)=>sum+p[1],0)/coords.length};
}).filter(Boolean);
const floodAlertGroup=new THREE.Group();floodAlertGroup.name='IOC flood alert beacons';floodAlertGroup.visible=false;scene.add(floodAlertGroup);
const alertBeamMaterial=new THREE.MeshStandardNodeMaterial({color:'#ff3c32',emissive:'#c41414',emissiveIntensity:2.2,transparent:true,opacity:.64,depthWrite:false});
const alertRingMaterial=new THREE.MeshStandardNodeMaterial({color:'#ffb19a',emissive:'#ff281f',emissiveIntensity:1.7,transparent:true,opacity:.88,depthWrite:false});
for(const point of floodAlertPoints){
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.4,7.5,145,10,1,true),alertBeamMaterial);beam.position.set(point.x,73,point.z);beam.userData=point;floodAlertGroup.add(beam);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(17,1.2,8,32),alertRingMaterial);ring.rotation.x=Math.PI/2;ring.position.set(point.x,3.8,point.z);ring.userData=point;floodAlertGroup.add(ring);
}
let floodTideM=1.4;
function setFloodScenario(amountMm,tideM=floodTideM){
  const mm=Math.max(0,Math.min(200,Number(amountMm)||0));
  floodTideM=Math.max(1.4,Math.min(1.8,Number(tideM)||1.4));
  const rainRatio=mm/200,tideRatio=(floodTideM-1.4)/.4,severity=Math.min(1,rainRatio*.64+tideRatio*.36),proxyDepthM=Math.max(0,(severity-.08)/.92*.5);
  for(const mesh of floodRoadMeshes){
    mesh.visible=severity>=.07;
    mesh.material.opacity=Math.min(.82,Math.max(0,(severity-.03)*.92));
    mesh.position.y=.04+severity*(.08+mesh.userData.maxDepthM*.34);
    mesh.scale.y=1+severity*mesh.userData.maxDepthM;
  }
  const alertLevel=severity>=.78?'red':severity>=.55?'orange':severity>=.3?'yellow':'monitor';
  floodAlertGroup.visible=severity>=.3;
  alertBeamMaterial.opacity=.32+severity*.45;alertRingMaterial.opacity=.48+severity*.48;
  floodAlertGroup.scale.y=.55+severity*.7;
  for(const label of floodAlertLabels)label.active=severity>=.3;
  materialStatus.floodVisual={amountMm:mm,tideM:floodTideM,referenceEventMm:200,severity,alertLevel,proxyDepthM,mode:'bounded_visual_proxy',hydraulicOutput:false,corridors:floodRoadMeshes.map(mesh=>mesh.userData.name),alertRoads:floodAlertPoints.map(point=>point.name)};
  return materialStatus.floodVisual;
}
function setFloodRain(amountMm){return setFloodScenario(amountMm,floodTideM);}

// Ba Son bridge: WebGPU-native structural layer, anchored to the mapped bridge centerline.
const BS=window.BA_SON_BRIDGE;
if(!BS?.centerline?.length)throw new Error('BA_SON_BRIDGE không khả dụng');
const bridgeGroup=new THREE.Group();bridgeGroup.name='Cầu Ba Son · kết cấu dây văng';scene.add(bridgeGroup);
const bridgeDeckGroup=new THREE.Group(),bridgeSupportGroup=new THREE.Group(),bridgeCableGroup=new THREE.Group();
bridgeDeckGroup.name='Cầu Ba Son · mặt cầu';
bridgeGroup.add(bridgeDeckGroup,bridgeSupportGroup,bridgeCableGroup);
// Bước C 31A: hộp mặt cầu giữ nguyên (BoxGeometry 24×3,2 tại y=11,25, đỉnh 12,85) trên nhịp phẳng; ở hai cầu dẫn đỉnh hộp
// bám đúng profile mặt đường OSM (way 321564421 trùng tim) nên mặt đường khớp đỉnh hộp suốt cầu, đầu cầu hạ liền xuống
// đường hai bờ. Trụ dẫn và neo dây văng ở đoạn dốc dịch theo cùng độ hạ; trụ không còn chỗ dưới bản mặt thì bỏ (nền đắp).
const BA_SON_TOP=11.25+3.2/2,baSonRoad=D.roads.findIndex(road=>road.id===BS.mappedRoadIds[0]);
function baSonDeckTop(x,z){
  if(baSonRoad<0)return BA_SON_TOP;
  const c=D.roads[baSonRoad].c;let best=Infinity,top=BA_SON_TOP;
  for(let k=0;k<c.length-1;k++){
    const ax=c[k][0],az=c[k][1],dx=c[k+1][0]-ax,dz=c[k+1][1]-az,u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/Math.max(1e-9,dx*dx+dz*dz)));
    const d=Math.hypot(ax+dx*u-x,az+dz*u-z);if(d<best){best=d;top=roadNetwork.roadY(baSonRoad,k,u);}
  }
  return Math.min(BA_SON_TOP,top);
}
const baSonJoin={decision:'profile-match-box-top',rampSegments:0,piersSkipped:[],anchorsLowered:0};
const baSonRampStrips=[];
const bridgeConcrete=new THREE.MeshStandardNodeMaterial({color:'#888e89',roughness:.76,metalness:.05});
const bridgeUnderside=new THREE.MeshStandardNodeMaterial({color:'#455256',roughness:.68,metalness:.18});
const bridgeGold=new THREE.MeshStandardNodeMaterial({color:'#d3a35a',roughness:.34,metalness:.48});
bridgeGold.emissiveNode=color('#2b1808').mul(.18);
const bridgeCableMaterial=new THREE.MeshStandardNodeMaterial({color:'#ffd27d',roughness:.23,metalness:.65});
bridgeCableMaterial.emissiveNode=color('#a9691d').mul(.48);
function bridgeBeam(a,b,radius,material,parent=bridgeSupportGroup,radial=8){
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),vector=bv.clone().sub(av);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,vector.length(),radial),material);
  mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.normalize());
  mesh.castShadow=radius>.5;mesh.receiveShadow=radius>.5;parent.add(mesh);return mesh;
}
function bridgeDeckSegment(a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(length/4)),strip=[];
  for(let k=0;k<=n;k++){const x=a[0]+dx*k/n,z=a[1]+dz*k/n,top=baSonDeckTop(x,z);strip.push({x,z,top,bottom:top-3.2});}
  if(strip.some(point=>point.top<BA_SON_TOP-.005)){baSonRampStrips.push(...loftStrip(strip,24));baSonJoin.rampSegments++;return;}
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(24,3.2,length),bridgeUnderside);
  mesh.position.set((a[0]+b[0])*.5,11.25,(a[1]+b[1])*.5);mesh.rotation.y=Math.atan2(dx,dz);mesh.castShadow=true;mesh.receiveShadow=true;bridgeDeckGroup.add(mesh);
}
for(let i=0;i<BS.centerline.length-1;i++)bridgeDeckSegment(BS.centerline[i],BS.centerline[i+1]);
if(baSonRampStrips.length){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(baSonRampStrips,3));geometry.computeVertexNormals();
  const ramp=new THREE.Mesh(geometry,bridgeUnderside);ramp.name='Cầu Ba Son · cầu dẫn bám profile';ramp.castShadow=true;ramp.receiveShadow=true;bridgeDeckGroup.add(ramp);
}
const bridgeAxis=new THREE.Vector3(BS.directionToThuThiem[0],0,BS.directionToThuThiem[1]);
const bridgePerp=new THREE.Vector3(BS.perpendicular[0],0,BS.perpendicular[1]);
const pylonBase=new THREE.Vector3(BS.supports[1].position[0],1.5,BS.supports[1].position[1]);
function bridgePier(support,isMain=false){
  const p=new THREE.Vector3(support.position[0],0,support.position[1]),drop=isMain?0:baSonDeckTop(p.x,p.z)-BA_SON_TOP;
  if(9.95+drop<5){baSonJoin.piersSkipped.push(support.id);return;}  // xà mũ sẽ chạm móng: đoạn này là nền đắp, không trụ
  const foundation=new THREE.Mesh(new THREE.CylinderGeometry(isMain?9:4.2,isMain?11:5.2,4,16),bridgeConcrete);
  foundation.position.set(p.x,3,p.z);foundation.castShadow=true;foundation.receiveShadow=true;bridgeSupportGroup.add(foundation);
  if(isMain)return;
  for(const side of [-1,1]){const q=p.clone().addScaledVector(bridgePerp,side*5.4);bridgeBeam([q.x,2,q.z],[q.x,10.8+drop,q.z],2.35,bridgeConcrete);}
  const cap=new THREE.Mesh(new THREE.BoxGeometry(15,2.3,4.3),bridgeConcrete);cap.position.set(p.x,11.1+drop,p.z);cap.rotation.y=Math.atan2(bridgeAxis.x,bridgeAxis.z);cap.castShadow=true;bridgeSupportGroup.add(cap);
}
for(const support of BS.supports)bridgePier(support,support.id==='S2');
for(const side of [-1,1]){
  const foot=pylonBase.clone().addScaledVector(bridgePerp,side*7),shoulder=pylonBase.clone().addScaledVector(bridgePerp,side*4);shoulder.y=18;
  bridgeBeam(foot.toArray(),shoulder.toArray(),3.2,bridgeGold);let previous=shoulder;
  for(let i=1;i<=9;i++){
    const t=i/9,curve=bridgeAxis.clone().multiplyScalar(22*t*t),point=pylonBase.clone().add(curve).addScaledVector(bridgePerp,side*(4-2.7*t));point.y=18+t*95;
    bridgeBeam(previous.toArray(),point.toArray(),1.55+.65*(1-t),bridgeGold);previous=point;
  }
}
const pylonCross=new THREE.Mesh(new THREE.BoxGeometry(20,2.5,3.4),bridgeGold);pylonCross.position.copy(pylonBase).setY(18);pylonCross.rotation.y=Math.atan2(bridgeAxis.x,bridgeAxis.z);pylonCross.castShadow=true;bridgeSupportGroup.add(pylonCross);
function bridgeCable(anchor,top,side){
  const lateral=bridgePerp.clone().multiplyScalar(side*6.8),a=pylonBase.clone().add(anchor).add(lateral),drop=baSonDeckTop(pylonBase.x+anchor.x,pylonBase.z+anchor.z)-BA_SON_TOP;a.y=14.8+drop;
  if(drop<-.005)baSonJoin.anchorsLowered++;
  const t=pylonBase.clone().add(top).addScaledVector(bridgePerp,side*(3.8-top.y/113*2.2));bridgeBeam(a.toArray(),t.toArray(),.32,bridgeCableMaterial,bridgeCableGroup,6);
}
for(const side of [-1,1]){
  for(let i=0;i<9;i++){const anchor=bridgeAxis.clone().multiplyScalar(-(28+i*23)),top=bridgeAxis.clone().multiplyScalar(4+12*(i/8));top.y=34+i*8.4;bridgeCable(anchor,top,side);}
  for(let i=0;i<5;i++){const anchor=bridgeAxis.clone().multiplyScalar(25+i*22),top=bridgeAxis.clone().multiplyScalar(5+12*(i/4));top.y=42+i*13;bridgeCable(anchor,top,side);}
}

// Bước C 31A: kết cấu cầu thủ tục (bản mặt dày, trụ, lan can — minh họa) và Bạch Đằng dựng lại trong runtime WebGPU.
materialStatus.bridges={};
createBridges31({scene,roads:D.roads,graph:window.ROAD_GRAPH_31,roadNetwork,water:D.water,bachDang:window.BACH_DANG_FOOTBRIDGE,status:materialStatus.bridges});
materialStatus.bridges.baSon=baSonJoin;

// Marina Central Tower: official 240 m / 55 floors, anchored to three current OSM building parts.
// The bands visualize the documented terraced networking floors; they are schematic, not survey geometry.
const marinaDetail=new THREE.Group();marinaDetail.name='Marina Central Tower · nhận diện 24B';scene.add(marinaDetail);
const marinaCenter=new THREE.Vector3(CORRECTIONS.marinaCentral.center[0],0,CORRECTIONS.marinaCentral.center[1]),marinaRotation=CORRECTIONS.marinaCentral.rotation;
const marinaBandMaterial=new THREE.MeshStandardNodeMaterial({color:'#9eb6b5',roughness:.27,metalness:.26});
marinaBandMaterial.emissiveNode=color('#183339').mul(.16);
const marinaCanopyMaterial=new THREE.MeshStandardNodeMaterial({color:'#d3c29e',roughness:.42,metalness:.18});
for(let i=0;i<6;i++){
  const height=158+i*8.1,stepOut=i*.72,band=new THREE.Mesh(new THREE.BoxGeometry(55+stepOut,1.05,43+stepOut*.55),marinaBandMaterial);
  band.position.set(marinaCenter.x,height,marinaCenter.z);band.rotation.y=marinaRotation;band.castShadow=true;marinaDetail.add(band);
}
const marinaCrown=new THREE.Mesh(new THREE.BoxGeometry(47,2.2,35),marinaCanopyMaterial);marinaCrown.position.set(marinaCenter.x,240.6,marinaCenter.z);marinaCrown.rotation.y=marinaRotation;marinaCrown.castShadow=true;marinaDetail.add(marinaCrown);
const marinaCanopy=new THREE.Mesh(new THREE.BoxGeometry(55,1.2,9),marinaCanopyMaterial);marinaCanopy.position.set(marinaCenter.x+18,23,marinaCenter.z+18);marinaCanopy.rotation.set(0,marinaRotation,-Math.PI/6);marinaCanopy.castShadow=true;marinaDetail.add(marinaCanopy);

// Grand Marina residential cluster: identity details sit on the corrected open footprints.
const grandMarinaDetail=new THREE.Group();grandMarinaDetail.name='Grand Marina Residences · cụm 4 tháp hiện hữu';scene.add(grandMarinaDetail);
const grandMarinaFrameMaterial=new THREE.MeshStandardNodeMaterial({color:'#a7b5aa',roughness:.31,metalness:.22});
grandMarinaFrameMaterial.emissiveNode=color('#20382d').mul(.13);
const grandMarinaCrownMaterial=new THREE.MeshStandardNodeMaterial({color:'#cbb98f',roughness:.46,metalness:.16});
const correctedGrandMarina=[];
for(const [id,correction] of grandMarinaHeightCorrections){
  const building=renderBuildings.find(item=>Number(item.id)===id);if(!building)continue;
  correctedGrandMarina.push(building);
  const ring=building.r[0],edgeA=new THREE.Vector2(ring[1][0]-ring[0][0],ring[1][1]-ring[0][1]),rotation=Math.atan2(edgeA.x,edgeA.y);
  const area=Math.abs(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0))*.5;
  const crownWidth=Math.min(47,Math.max(31,Math.sqrt(area)*.9)),crownDepth=crownWidth*.68;
  const crown=new THREE.Mesh(new THREE.BoxGeometry(crownWidth,2.1,crownDepth),grandMarinaCrownMaterial);
  crown.position.set(building.center[0],correction.h+1.1,building.center[1]);crown.rotation.y=rotation;crown.castShadow=true;grandMarinaDetail.add(crown);
  const axis=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation)),perp=new THREE.Vector3(-axis.z,0,axis.x);
  for(const side of [-1,0,1]){
    const base=new THREE.Vector3(building.center[0],12,building.center[1]).addScaledVector(perp,side*crownWidth*.24).addScaledVector(axis,crownDepth*.51);
    const top=base.clone();top.y=correction.h-7;bridgeBeam(base.toArray(),top.toArray(),.28,grandMarinaFrameMaterial,grandMarinaDetail,5);
  }
  for(const y of [correction.h*.34,correction.h*.67]){
    const band=new THREE.Mesh(new THREE.BoxGeometry(crownWidth+1.2,.72,crownDepth+1.2),grandMarinaFrameMaterial);
    band.position.set(building.center[0],y,building.center[1]);band.rotation.y=rotation;grandMarinaDetail.add(band);
  }
}

setProgress(73,'Đang gieo tán cây và chi tiết mái…');
let randomState=2401;const random=()=>{randomState=(1664525*randomState+1013904223)>>>0;return randomState/4294967296;};
function contains(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
const trees=[];
for(const rings of D.green){
  const r=rings[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  const count=Math.min(650,Math.ceil((x1-x0)*(z1-z0)/180));
  for(let i=0;i<count;i++){const p=[x0+random()*(x1-x0),z0+random()*(z1-z0)];if(contains(p,r)&&!rings.slice(1).some(h=>contains(p,h)))trees.push({x:p[0],z:p[1],h:5+random()*10,s:random()});}
}
const dummy=new THREE.Object3D();
const trunkMaterial=new THREE.MeshStandardNodeMaterial({color:'#55402f',roughness:.98});
const leafMaterial=new THREE.MeshStandardNodeMaterial({color:'#226a35',roughness:.92});
const farLeafMaterial=new THREE.MeshStandardNodeMaterial({color:'#285f35',roughness:.96});
const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.32,.52,1,6),trunkMaterial,trees.length);
const canopies=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),leafMaterial,trees.length*3);
const farCanopies=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),farLeafMaterial,trees.length);
trees.forEach((tree,i)=>{
  dummy.position.set(tree.x,tree.h*.28,tree.z);dummy.rotation.set(0,tree.s*5,0);dummy.scale.set(1,tree.h*.56,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  for(let l=0;l<3;l++){
    const scale=tree.h*(l===0?.34:l===1?.27:.22),angle=tree.s*6.28+l*2.094,offset=l===0?0:tree.h*.12;
    dummy.position.set(tree.x+Math.cos(angle)*offset,tree.h*(l===0?.66:l===1?.78:.7)+1,tree.z+Math.sin(angle)*offset);dummy.rotation.set(tree.s*.24,angle,tree.s*.18);dummy.scale.set(scale*(1.08+l*.06),scale*(.72+l*.04),scale);dummy.updateMatrix();canopies.setMatrixAt(i*3+l,dummy.matrix);
    canopies.setColorAt(i*3+l,new THREE.Color().setHSL(.255+tree.s*.065,.4+tree.s*.13,.17+l*.035));
  }
  dummy.position.set(tree.x,tree.h*.69+1,tree.z);dummy.rotation.set(0,tree.s*6.28,0);dummy.scale.set(tree.h*.42,tree.h*.31,tree.h*.42);dummy.updateMatrix();farCanopies.setMatrixAt(i,dummy.matrix);
  farCanopies.setColorAt(i,new THREE.Color().setHSL(.26+tree.s*.045,.37+tree.s*.08,.2));
});
trunks.castShadow=canopies.castShadow=true;trunks.receiveShadow=canopies.receiveShadow=true;farCanopies.receiveShadow=true;canopies.instanceColor.needsUpdate=farCanopies.instanceColor.needsUpdate=true;scene.add(trunks,canopies,farCanopies);

// Urban motion 26B restores the moving context from PoC 06/13 inside the
// canonical WebGPU scene. Vehicles stay on audited OSM road segments; vessels
// follow a sampled Saigon River lane whose offsets are verified inside water.
const motionRoot=new THREE.Group();motionRoot.name='Urban motion · road traffic + river vessels';scene.add(motionRoot);
const trafficGroup=new THREE.Group(),vesselGroup=new THREE.Group();
trafficGroup.name='Dense Vietnamese road traffic · illustrative';vesselGroup.name='Saigon River traffic · illustrative';motionRoot.add(trafficGroup,vesselGroup);
let motionSeed=26062026;
const motionRandom=()=>{motionSeed=(1664525*motionSeed+1013904223)>>>0;return motionSeed/4294967296;};
const motionHash=value=>{const x=Math.sin((Number(value)||1)*12.9898)*43758.5453;return x-Math.floor(x);};
const obstacleCell=170,obstacleGrid=new Map();
function indexMotionObstacle(rings){
  const ring=rings[0];if(!ring?.length)return;
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),box={rings,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  for(let x=Math.floor(box.minX/obstacleCell);x<=Math.floor(box.maxX/obstacleCell);x++)for(let z=Math.floor(box.minZ/obstacleCell);z<=Math.floor(box.maxZ/obstacleCell);z++){
    const key=`${x},${z}`;if(!obstacleGrid.has(key))obstacleGrid.set(key,[]);obstacleGrid.get(key).push(box);
  }
}
for(const building of renderBuildings)if(!building.hiddenByCorrection)indexMotionObstacle(building.r);
for(const green of D.green)indexMotionObstacle(green);
function motionBlocked(point){
  const items=obstacleGrid.get(`${Math.floor(point[0]/obstacleCell)},${Math.floor(point[1]/obstacleCell)}`)||[];
  return items.some(item=>point[0]>=item.minX&&point[0]<=item.maxX&&point[1]>=item.minZ&&point[1]<=item.maxZ&&contains(point,item.rings[0])&&!item.rings.slice(1).some(hole=>contains(point,hole)));
}
function roadSegmentClear(a,b,laneWidth){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1)return false;
  const nx=-dz/length,nz=dx/length,margin=Math.min(3.2,Math.max(1.2,laneWidth));
  for(let i=0;i<=8;i++){const u=i/8;for(const offset of [-margin,0,margin])if(motionBlocked([a[0]+dx*u+nx*offset,a[1]+dz*u+nz*offset]))return false;}
  return true;
}
const trafficCandidates=[],trafficTypes=new Set(['motorway','trunk','primary','secondary','tertiary','residential']);
D.roads.forEach((road,roadIndex)=>{
  if(road.tunnel||road.bridge||!trafficTypes.has(road.type))return;
  const roadWidth=road.lanes?Math.max(widths[road.type]||5,road.lanes*3.1):widths[road.type]||5;
  for(let i=0;i<road.c.length-1;i++){
    const a=road.c[i],b=road.c[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<26)continue;
    const mx=(a[0]+b[0])*.5,mz=(a[1]+b[1])*.5,centrality=Math.max(0,1-Math.hypot(mx,mz)/6500);
    const hierarchy=['motorway','trunk','primary','secondary'].includes(road.type)?.32:road.type==='tertiary'?.2:.09;
    // roadIndex/vertex: tra cao độ mặt đường theo profile (dốc dẫn rampOf có thể cao hơn groundY).
    trafficCandidates.push({a,b,length,width:roadWidth,roadIndex,vertex:i,score:motionHash(Number(road.id)+i*7919)+centrality*1.25+hierarchy,roadType:road.type});
  }
});
trafficCandidates.sort((a,b)=>b.score-a.score);
const trafficItems=[];
for(const segment of trafficCandidates){
  if(trafficItems.length>=3200)break;
  if(!roadSegmentClear(segment.a,segment.b,segment.width*.22))continue;
  const repeats=segment.length>95?5:segment.length>52?4:3;
  for(let repeat=0;repeat<repeats&&trafficItems.length<3200;repeat++){
    const roll=motionRandom(),kind=roll<.8?'motorbike':roll<.985?'car':'bus',side=motionRandom()>.5?1:-1;
    const speedMps=kind==='motorbike'?8+motionRandom()*7:kind==='car'?7+motionRandom()*6:5+motionRandom()*4;
    trafficItems.push({...segment,kind,side,lane:Math.max(.85,Math.min(2.4,segment.width*.2)),phase:(repeat/repeats+motionRandom()*.16)%1,speed:speedMps/segment.length,colorSeed:motionRandom()});
  }
}
// Cao độ bánh xe: 17 mẫu dọc làn trên mặt đường thật (mảnh có miter + polygon giao lộ), không thấp hơn tim road theo profile.
// trafficLaneY(item,u) → vị trí làn và y mặt đường; trafficGroundY nội suy mẫu mỗi khung hình.
const TRAFFIC_Y_STEPS=16,TRAFFIC_SAME_LEVEL_M=.5;
const trafficLaneY=(item,u)=>{
  const dx=item.b[0]-item.a[0],dz=item.b[1]-item.a[1],nx=-dz/item.length,nz=dx/item.length;
  const x=item.a[0]+dx*u+nx*item.side*item.lane,z=item.a[1]+dz*u+nz*item.side*item.lane,centre=roadNetwork.roadY(item.roadIndex,item.vertex,u);
  // Mặt nhìn thấy là mặt cao nhất trong ±TRAFFIC_SAME_LEVEL_M quanh tim road (dốc dẫn chồng lên đường mặt đất kề bên);
  // mặt cao hơn nữa là công trình khác cấp (cầu, mép dốc), không kéo xe lên.
  return{x,z,y:Math.max(centre,...roadNetwork.surfaceYs(x,z).filter(y=>Math.abs(y-centre)<TRAFFIC_SAME_LEVEL_M))};
};
for(const item of trafficItems){item.ys=new Float32Array(TRAFFIC_Y_STEPS+1);for(let k=0;k<=TRAFFIC_Y_STEPS;k++)item.ys[k]=trafficLaneY(item,k/TRAFFIC_Y_STEPS).y;}
const trafficGroundY=(item,u)=>{const f=Math.min(TRAFFIC_Y_STEPS,Math.max(0,u*TRAFFIC_Y_STEPS)),k=Math.min(TRAFFIC_Y_STEPS-1,Math.floor(f));return item.ys[k]+(item.ys[k+1]-item.ys[k])*(f-k);};
const trafficBodyMaterial=new THREE.MeshStandardNodeMaterial({color:'#b8c1bd',roughness:.34,metalness:.46});
const trafficTopMaterial=new THREE.MeshStandardNodeMaterial({color:'#273b42',roughness:.22,metalness:.35});
const trafficLightMaterial=new THREE.MeshStandardNodeMaterial({color:'#fff0c7',emissive:'#ffb45d',emissiveIntensity:2.8,roughness:.18});
const trafficBody=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),trafficBodyMaterial,trafficItems.length);
const trafficTop=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),trafficTopMaterial,trafficItems.length);
const trafficLights=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),trafficLightMaterial,trafficItems.length);
const trafficPalette=['#b9c2bd','#e4ddcf','#9d3f34','#315d69','#d0a04d','#343c42','#739074','#756b8a'];
trafficItems.forEach((item,index)=>trafficBody.setColorAt(index,new THREE.Color(trafficPalette[Math.floor(item.colorSeed*trafficPalette.length)])));
trafficBody.instanceColor.needsUpdate=true;trafficBody.castShadow=true;
for(const mesh of [trafficBody,trafficTop,trafficLights]){mesh.frustumCulled=false;trafficGroup.add(mesh);}

const vesselNodes=[[106.71235,10.764,3],[106.70913,10.768,3],[106.70808,10.772,3],[106.70838,10.776,3],[106.70960,10.780,3],[106.71365,10.784,3],[106.72223,10.788,3],[106.72608,10.792,3]].map(point=>xyz(...point));
const vesselLengths=vesselNodes.slice(1).map((point,index)=>point.distanceTo(vesselNodes[index])),vesselTotal=vesselLengths.reduce((sum,value)=>sum+value,0);
function vesselAt(u){let distance=u*vesselTotal,index=0;while(index<vesselLengths.length-1&&distance>vesselLengths[index])distance-=vesselLengths[index++];const a=vesselNodes[index],b=vesselNodes[index+1],q=Math.min(1,distance/vesselLengths[index]);return{point:a.clone().lerp(b,q),direction:b.clone().sub(a).normalize()};}
function pointInWater(point){return D.water.some(rings=>contains(point,rings[0])&&!rings.slice(1).some(hole=>contains(point,hole)));}
const vesselLanes=[-10,-5,0,5,10],vesselItems=Array.from({length:22},(_,index)=>({phase:index/22+motionRandom()*.025,speed:.0027+motionRandom()*.0024,lane:vesselLanes[index%vesselLanes.length],type:index%6===0?'barge':index%3===0?'ferry':'speedboat',reverse:index%2===1,colorSeed:motionRandom()}));
function vesselProgress(item,timeSeconds){const cycle=(item.phase+timeSeconds*item.speed)%2,baseU=cycle<=1?cycle:2-cycle;return{u:item.reverse?1-baseU:baseU,backward:(cycle>1)!==item.reverse};}
let vesselAuditSamples=0,vesselSamplesOutsideWater=0;
for(let i=0;i<=1200;i++){const state=vesselAt(i/1200),nx=-state.direction.z,nz=state.direction.x;for(const lane of vesselLanes){vesselAuditSamples++;if(!pointInWater([state.point.x+nx*lane,state.point.z+nz*lane]))vesselSamplesOutsideWater++;}}
let vesselHeadingMismatches=0;
for(const item of vesselItems){for(const sampleTime of [17,43,79]){const a=vesselProgress(item,sampleTime),b=vesselProgress(item,sampleTime+.02),velocitySign=Math.sign(b.u-a.u),headingSign=a.backward?-1:1;if(velocitySign&&velocitySign!==headingSign)vesselHeadingMismatches++;}}
const hullGeometry=new THREE.BufferGeometry();hullGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-6,-1,-2.2,-6,-1,2.2,-5,1,-1.9,-5,1,1.9,7,-.4,0,5,1,-1.2,5,1,1.2],3));hullGeometry.setIndex([0,4,2,2,4,5,1,3,4,3,6,4,0,1,4,2,5,6,2,6,3,0,2,1,1,2,3,5,4,6]);hullGeometry.computeVertexNormals();
const hullMaterial=new THREE.MeshStandardNodeMaterial({color:'#d8d3c5',roughness:.38,metalness:.13});
const cabinMaterial=new THREE.MeshStandardNodeMaterial({color:'#d8dfdc',roughness:.3,metalness:.12});
const vesselWindowMaterial=new THREE.MeshStandardNodeMaterial({color:'#244651',roughness:.16,metalness:.42});
function createWakeBand(startX,endX,spread,width){
  const y=.025,half=width*.5,geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    startX,y,-half,endX,y,spread-width,endX,y,spread+width,startX,y,half,
    startX,y,-half,endX,y,-spread-width,endX,y,-spread+width,startX,y,half
  ],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));
  geometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);geometry.computeVertexNormals();return geometry;
}
const wakeLayers=[
  {geometry:createWakeBand(-4.6,-18,6.9,.5),color:'#d8efee',opacity:.27},
  {geometry:createWakeBand(-7.5,-31,11.8,.66),color:'#b5dadd',opacity:.145},
  {geometry:createWakeBand(-11,-47,18,.82),color:'#8bbbc2',opacity:.065}
];
const vesselHulls=new THREE.InstancedMesh(hullGeometry,hullMaterial,vesselItems.length),vesselCabins=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),cabinMaterial,vesselItems.length),vesselWindows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),vesselWindowMaterial,vesselItems.length);
const vesselWakes=wakeLayers.map(layer=>{
  const material=new THREE.MeshBasicNodeMaterial({color:layer.color,transparent:true,opacity:layer.opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending});
  const wakeUv=uv(),headFade=smoothstep(0,.14,wakeUv.x),tailFade=float(1).sub(smoothstep(.16,1,wakeUv.x));
  const edgeFade=smoothstep(0,.22,wakeUv.y).mul(float(1).sub(smoothstep(.78,1,wakeUv.y)));
  const foamNoise=fract(sin(dot(positionWorld.xz,vec2(.127,.311)).add(time.mul(.09))).mul(43758.5453));
  const organic=mix(float(.76),float(1),foamNoise);
  material.opacityNode=headFade.mul(tailFade).mul(edgeFade).mul(organic).mul(layer.opacity);
  const mesh=new THREE.InstancedMesh(layer.geometry,material,vesselItems.length);mesh.renderOrder=3;return mesh;
});
const vesselPalette=['#d9d3c3','#e4e0d4','#a94438','#376a73','#d1aa58'];
vesselItems.forEach((item,index)=>vesselHulls.setColorAt(index,new THREE.Color(vesselPalette[Math.floor(item.colorSeed*vesselPalette.length)])));
vesselHulls.instanceColor.needsUpdate=true;
for(const mesh of [vesselHulls,vesselCabins,vesselWindows,...vesselWakes]){mesh.frustumCulled=false;mesh.castShadow=!vesselWakes.includes(mesh);vesselGroup.add(mesh);}

const motionDummy=new THREE.Object3D();let motionFrame=0;
function advanceUrbanMotion(now){
  motionFrame++;const timeSeconds=now*.001,updateStride=cameraDistance>4800?3:cameraDistance>900?2:1,updateFrame=motionFrame%updateStride===0;
  trafficGroup.visible=cameraDistance<8800;vesselGroup.visible=cameraDistance<10500;if(!updateFrame)return;
  for(let i=0;i<trafficItems.length;i++){
    const item=trafficItems[i],raw=(item.phase+timeSeconds*item.speed)%1,u=item.side>0?raw:1-raw,dx=item.b[0]-item.a[0],dz=item.b[1]-item.a[1],length=item.length,nx=-dz/length,nz=dx/length;
    const x=item.a[0]+dx*u+nx*item.side*item.lane,z=item.a[1]+dz*u+nz*item.side*item.lane,rotation=-Math.atan2(dz*item.side,dx*item.side);
    const dimensions=item.kind==='motorbike'?[2.05,.56,.62]:item.kind==='car'?[4.15,1.05,1.78]:[8.8,2.45,2.45],ground=trafficGroundY(item,u);
    motionDummy.position.set(x,ground+.16+dimensions[1]*.5,z);motionDummy.rotation.set(0,rotation,0);motionDummy.scale.set(...dimensions);motionDummy.updateMatrix();trafficBody.setMatrixAt(i,motionDummy.matrix);
    const top=item.kind==='motorbike'?[.58,1.18,.55]:item.kind==='car'?[2.25,.62,1.48]:[6.9,.78,2.48];
    motionDummy.position.set(x,ground+.18+dimensions[1]+top[1]*.45,z);motionDummy.scale.set(...top);motionDummy.updateMatrix();trafficTop.setMatrixAt(i,motionDummy.matrix);
    motionDummy.position.set(x+dx/length*item.side*dimensions[0]*.46,ground+.25+dimensions[1]*.48,z+dz/length*item.side*dimensions[0]*.46);motionDummy.scale.set(.3,.28,Math.max(.38,dimensions[2]*.72));motionDummy.updateMatrix();trafficLights.setMatrixAt(i,motionDummy.matrix);
  }
  for(const mesh of [trafficBody,trafficTop,trafficLights])mesh.instanceMatrix.needsUpdate=true;
  for(let i=0;i<vesselItems.length;i++){
    const item=vesselItems[i],progress=vesselProgress(item,timeSeconds),state=vesselAt(progress.u),direction=progress.backward?state.direction.clone().multiplyScalar(-1):state.direction,nx=-direction.z,nz=direction.x;
    const x=state.point.x+nx*item.lane,z=state.point.z+nz*item.lane,rotation=-Math.atan2(direction.z,direction.x),scale=item.type==='barge'?1.55:item.type==='ferry'?1.2:.78;
    const specs=[[vesselHulls,0,3.05,scale,1,1],[vesselCabins,-1.2,5.0,6.4*scale,2.25,3.0],[vesselWindows,-.6,5.25,6.55*scale,1.1,3.08]];
    for(const [mesh,offset,y,sx,sy,sz] of specs){motionDummy.position.set(x+direction.x*offset,y,z+direction.z*offset);motionDummy.rotation.set(0,rotation,0);motionDummy.scale.set(sx,sy,sz);motionDummy.updateMatrix();mesh.setMatrixAt(i,motionDummy.matrix);}
    const wakeBreath=1+Math.sin(timeSeconds*2.2+i*.83)*.035;
    for(const wake of vesselWakes){motionDummy.position.set(x,.72,z);motionDummy.rotation.set(0,rotation,0);motionDummy.scale.set(scale,1,scale*wakeBreath);motionDummy.updateMatrix();wake.setMatrixAt(i,motionDummy.matrix);}
  }
  for(const mesh of [vesselHulls,vesselCabins,vesselWindows,...vesselWakes])mesh.instanceMatrix.needsUpdate=true;
  materialStatus.motion.lastFrame=motionFrame;
}
// Kiểm xe không chìm: mặt dưới xe (nội suy từ mẫu) so với mặt đường thật tại 3 điểm lệch khỏi lưới mẫu.
let trafficSurfaceChecked=0,trafficBelowRoad=0;const trafficBelowSamples=[];
for(const item of trafficItems){
  for(const u of [.29,.53,.81]){
    const {x,z}=trafficLaneY(item,u),ground=trafficGroundY(item,u),base=ground+.16;
    const near=roadNetwork.surfaceYs(x,z).filter(y=>Math.abs(y-ground)<TRAFFIC_SAME_LEVEL_M);if(!near.length)continue;const surface=Math.max(...near);
    trafficSurfaceChecked++;if(base<surface-.02){trafficBelowRoad++;if(trafficBelowSamples.length<8)trafficBelowSamples.push({road:D.roads[item.roadIndex].id,x:+x.toFixed(1),z:+z.toFixed(1),base:+base.toFixed(2),surface:+surface.toFixed(2)});}
  }
}
materialStatus.motion={surfaceChecked:trafficSurfaceChecked,belowRoad:trafficBelowRoad,belowRoadSamples:trafficBelowSamples,motorbikes:trafficItems.filter(item=>item.kind==='motorbike').length,cars:trafficItems.filter(item=>item.kind==='car').length,buses:trafficItems.filter(item=>item.kind==='bus').length,nearCore:trafficItems.filter(item=>Math.hypot((item.a[0]+item.b[0])*.5,(item.a[1]+item.b[1])*.5)<2200).length,vessels:vesselItems.length,roadSegments:trafficItems.length,roadSource:'OSM centerlines',vesselRoute:'illustrative Saigon River lane',vesselAuditSamples,vesselSamplesOutsideWater,vesselHeadingMismatches,classification:'procedural visual motion; not live traffic or AIS'};
document.body.dataset.motionTraffic=String(trafficItems.length);document.body.dataset.motionMotorbikes=String(materialStatus.motion.motorbikes);document.body.dataset.motionCars=String(materialStatus.motion.cars);document.body.dataset.motionBuses=String(materialStatus.motion.buses);document.body.dataset.motionNearCore=String(materialStatus.motion.nearCore);document.body.dataset.motionVessels=String(vesselItems.length);document.body.dataset.motionVesselOutside=String(vesselSamplesOutsideWater);document.body.dataset.motionVesselHeadingMismatch=String(vesselHeadingMismatches);

const fixtureMaterial=new THREE.MeshStandardNodeMaterial({color:'#6d7772',roughness:.68,metalness:.2});
const fixtures=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),fixtureMaterial,roofFixtures.length);
roofFixtures.forEach((item,i)=>{dummy.position.set(item.x,item.y,item.z);dummy.rotation.set(0,item.seed*5.3,0);dummy.scale.set(item.scale,1.4+item.seed*1.8,item.scale*.62);dummy.updateMatrix();fixtures.setMatrixAt(i,dummy.matrix);});
fixtures.castShadow=true;scene.add(fixtures);
materialStatus.heroDetail={};
const cityDetailRuntime=createCityDetailRuntime({scene,buildings:renderBuildings.filter(building=>!heroEnvelopeIds.has(Number(building.id))&&!building.hiddenByCorrection),roads:D.roads,widths,hash01,nightLevel,status:materialStatus.heroDetail});
materialStatus.heroCorridor={};
const heroCorridor=createHeroCorridor30({scene,roads:D.roads,nightLevel,status:materialStatus.heroCorridor});
// Bước E2: cột đèn theo mép đường hợp nhất + vạch zebra (thay đèn đặt theo tim từng way của runtime 28).
materialStatus.streetFurniture={};
const streetFurniture=createStreetFurniture31({scene,roads:D.roads,graph:window.ROAD_GRAPH_31,roadNetwork,data:window.STREET_FURNITURE_31,widths,nightLevel,status:materialStatus.streetFurniture});
materialStatus.identityFacades={};
const identityFacades=createIdentityFacades30({scene,status:materialStatus.identityFacades});
let sceneMeshCount=0;scene.traverse(object=>{if(object.isMesh)sceneMeshCount++;});$('#draws').textContent=sceneMeshCount;

setProgress(84,'Đang hoàn tất cảnh và biên dịch pipeline…');

const places=[['BITEXCO',106.70435,10.7716,278],['NGUYỄN HUỆ',106.7035,10.7751,18],['BẾN BẠCH ĐẰNG',106.7067,10.7762,16],['NHÀ HÁT THÀNH PHỐ',106.7033,10.7765,34],['QUẢNG TRƯỜNG LAM SƠN',106.7030,10.7768,16],['ĐỒNG KHỞI',106.7027,10.7776,18],['LANDMARK 81',106.7219,10.7949,470],['MARINA CENTRAL · 240 M',106.707826,10.782198,252],['GRAND MARINA · 4 THÁP',106.70895,10.78472,184],['CẦU BA SON',106.71073,10.77927,122],['THẢO ĐIỀN · VÙNG HIỆU CHỈNH',106.7312,10.8037,34],['QUỐC HƯƠNG',106.7322,10.8044,15],['NGUYỄN VĂN HƯỞNG',106.7282,10.8022,15]];
const labels=places.map(place=>{const el=document.createElement('div');el.className='label';el.textContent=place[0];$('#labels').append(el);return{el,pos:xyz(place[1],place[2],place[3])};});
floodAlertLabels=floodAlertPoints.map(point=>{const el=document.createElement('div');el.className='label alert-label';el.textContent=point.name;$('#labels').append(el);const item={el,pos:new THREE.Vector3(point.x,155,point.z),active:false};labels.push(item);return item;});

const presets={
  materials:{target:xyz(106.7060,10.7764,68),distance:1120,az:.92,polar:1.08,label:'MATERIAL DISTRICT'},
  river:{target:xyz(106.7085,10.7738,28),distance:1180,az:.92,polar:1.05,label:'BẾN BẠCH ĐẰNG'},
  boulevard:{target:xyz(106.7039,10.7747,43),distance:1180,az:1.1,polar:1.05,label:'NGUYỄN HUỆ'},
  corridor:{target:new THREE.Vector3(-924,13,249),distance:260,az:2.4,polar:1.28,fov:48,label:'LAM SƠN · ĐỒNG KHỞI · NHÀ HÁT'},
  overview:{target:new THREE.Vector3(0,0,0),distance:7600,az:.45,polar:.63,label:'TOÀN VÙNG · 38,57 KM²'},
  bason:{target:new THREE.Vector3(-300,76,-360),distance:930,az:2.43,polar:1.03,label:'BA SON · MARINA CENTRAL + GRAND MARINA'},
  flood25:{target:xyz(106.7305,10.8030,24),distance:1280,az:-.92,polar:1.01,label:'THẢO ĐIỀN · MÔ PHỎNG NGẬP 25A'}
};
const initial=presets[params.get('view')]||presets.materials;
let activeView=params.get('view') in presets?params.get('view'):'materials';
let target=initial.target.clone(),cameraDistance=initial.distance,azimuth=initial.az,polar=initial.polar,desired=null;
const transitionVelocity=new THREE.Vector3();
const transitionState={distance:cameraDistance,azimuth,polar};
function selectView(key){
  const p=presets[key];if(!p)return;desired={...p,target:p.target.clone()};
  activeView=key;
  camera.fov=p.fov||42;camera.updateProjectionMatrix();
  transitionState.distance=cameraDistance;transitionState.azimuth=azimuth;transitionState.polar=polar;
  transitionState.distanceVelocity=transitionState.azimuthVelocity=transitionState.polarVelocity=0;transitionVelocity.set(0,0,0);
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===key));
  $('#viewLabel').textContent=p.label;history.replaceState(null,'',`?v=${APP_VERSION}&view=${key}${forceWebGL?'&backend=webgl':''}${requestedQuality!=='presentation'?`&quality=${requestedQuality}`:''}`);
}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>selectView(button.dataset.view));
selectView(params.get('view') in presets?params.get('view'):'materials');
materialStatus.selectView=selectView;
materialStatus.setFloodRain=setFloodRain;
materialStatus.setFloodScenario=setFloodScenario;
materialStatus.floodPresets={pilot:'flood25',referenceRainMm:200};
setFloodRain(0);

let activeFogDensity=.000072;
const lightStates={
  day:{background:'#5ca2cf',fog:'#dcebf2',fogDensity:.000056,sun:'#fffaf0',sunIntensity:4.05,hemiSky:'#e4f3fa',hemiGround:'#69625b',hemi:.84,exposure:.92,night:0,pos:[-2300,3500,1800]},
  golden:{background:'#a17c69',fog:'#b09b86',fogDensity:.000076,sun:'#ff9845',sunIntensity:4.65,hemiSky:'#e6c7a5',hemiGround:'#5d493e',hemi:.72,exposure:.94,night:.08,pos:[-4200,1450,1700]},
  night:{background:'#010610',fog:'#06111b',fogDensity:.000082,sun:'#6686bd',sunIntensity:.34,hemiSky:'#263d60',hemiGround:'#071018',hemi:.2,exposure:.68,night:1,pos:[-1800,2600,900]}
};
function setLight(key){
  const state=lightStates[key];if(!state)return;activeLight=key;
  activeFogDensity=state.fogDensity;scene.background=skyTextures[key];scene.fog.color.set(state.fog);scene.fog.density=state.fogDensity;sun.color.set(state.sun);sun.intensity=state.sunIntensity;hemi.color.set(state.hemiSky);hemi.groundColor.set(state.hemiGround);hemi.intensity=state.hemi;renderer.toneMappingExposure=state.exposure;nightLevel.value=state.night;sun.position.set(...state.pos);
  document.querySelectorAll('[data-light]').forEach(button=>button.classList.toggle('active',button.dataset.light===key));
  materialStatus.light=key;
}
document.querySelectorAll('[data-light]').forEach(button=>button.onclick=()=>setLight(button.dataset.light));
materialStatus.visualCalibration={profile:'hcmc-aerial-default-30',saturation:'1.015–1.085 by distance',contrast:'1.06–1.13 by distance',atmosphere:'distance-bounded neutral haze',materials:'class-separated physical PBR + camera-scaled inferred relief',renderScale:Math.min(devicePixelRatio,visualQuality.maxPixelRatio)};
setLight(activeLight);

const realismInput=$('#realism'),realismValue=$('#realismValue');
function setRealism(value){const number=Math.max(0,Math.min(100,Number(value)));realism.value=number/100;realismInput.value=number;realismValue.value=`${Math.round(number)}%`;materialStatus.realism=number;}
realismInput.oninput=()=>setRealism(realismInput.value);setRealism(100);
const compare=$('#compare');let compareRestore=100;
const compareDown=event=>{event.preventDefault();compareRestore=Number(realismInput.value);compare.classList.add('active');setRealism(0);};
const compareUp=()=>{if(!compare.classList.contains('active'))return;compare.classList.remove('active');setRealism(compareRestore);};
compare.addEventListener('pointerdown',compareDown);window.addEventListener('pointerup',compareUp);window.addEventListener('pointercancel',compareUp);

function savedPanelState(key,fallback){
  try{const value=localStorage.getItem(key);return value===null?fallback:value==='true';}catch{return fallback;}
}
function bindCollapsible(panel,button,key,defaultCollapsed,labels={}){
  const apply=collapsed=>{
    panel.classList.toggle('collapsed',collapsed);
    button.classList.toggle('is-collapsed',collapsed);
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',collapsed?(labels.open||'Mở rộng bảng điều khiển'):(labels.close||'Thu gọn bảng điều khiển'));
    try{localStorage.setItem(key,String(collapsed));}catch{}
  };
  apply(savedPanelState(key,defaultCollapsed));
  button.addEventListener('click',()=>apply(!panel.classList.contains('collapsed')));
  return apply;
}
bindCollapsible($('#cityNav'),$('#collapseNav'),'citylab.30b.panel.navigation.collapsed',false,{open:'Mở điều hướng tham quan',close:'Thu gọn điều hướng tham quan'});
bindCollapsible($('#story'),$('#collapseStory'),'citylab.30b.panel.story.collapsed',true,{open:'Mở thông tin vật liệu',close:'Thu gọn thông tin vật liệu'});
bindCollapsible($('#controls'),$('#collapse'),'citylab.30b.panel.controls.collapsed',true,{open:'Mở điều khiển cảnh',close:'Thu gọn điều khiển cảnh'});
bindCollapsible($('#selection'),$('#collapseSelection'),'citylab.30b.panel.selection.collapsed',false,{open:'Mở thông tin công trình',close:'Thu gọn thông tin công trình'});
const toggleUiButton=$('#toggleUi');
const toggleUi=()=>{
  const hidden=document.body.classList.toggle('ui-hidden');
  toggleUiButton.setAttribute('aria-label',hidden?'Mở giao diện':'Ẩn giao diện');
  toggleUiButton.title=hidden?'Mở giao diện (H)':'Ẩn giao diện (H)';
};
toggleUiButton.onclick=toggleUi;

const canvas=renderer.domElement;canvas.tabIndex=0;canvas.style.touchAction='none';
let pointerDown=false,panning=false,moved=false,lastX=0,lastY=0,startX=0,startY=0,orbitVelocity=0,polarVelocity=0,zoomVelocity=0;
const panVelocity=new THREE.Vector3();
canvas.addEventListener('pointerdown',event=>{pointerDown=true;panning=event.button===2||event.shiftKey;moved=false;lastX=startX=event.clientX;lastY=startY=event.clientY;desired=null;orbitVelocity=polarVelocity=0;panVelocity.set(0,0,0);canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!pointerDown)return;const dx=event.clientX-lastX,dy=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;if(Math.hypot(event.clientX-startX,event.clientY-startY)>5)moved=true;if(panning){const scale=cameraDistance*.00072,px=-(dx*Math.cos(azimuth)*scale+dy*Math.sin(azimuth)*scale),pz=dx*Math.sin(azimuth)*scale-dy*Math.cos(azimuth)*scale;target.x+=px;target.z+=pz;panVelocity.set(px,0,pz);}else{orbitVelocity=-dx*.004;polarVelocity=dy*.003;azimuth+=orbitVelocity;polar=Math.max(.16,Math.min(1.43,polar+polarVelocity));}});
canvas.addEventListener('pointerup',event=>{pointerDown=false;if(!moved&&event.button===0)pick(event.clientX,event.clientY);});
canvas.addEventListener('pointercancel',()=>pointerDown=false);canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('wheel',event=>{event.preventDefault();desired=null;zoomVelocity=THREE.MathUtils.clamp(zoomVelocity+event.deltaY*.00038,-.075,.075);},{passive:false});
window.addEventListener('keydown',event=>{
  if(/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName))return;
  const key=event.key.toLowerCase();if(key==='h'){toggleUi();return;}if(key==='0'){selectView('materials');return;}
  if(!['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','q','e','+','=','-','_'].includes(key))return;
  event.preventDefault();desired=null;const stride=Math.max(18,Math.min(240,cameraDistance*.055));
  const forward=new THREE.Vector3(target.x-camera.position.x,0,target.z-camera.position.z).normalize(),right=new THREE.Vector3(-forward.z,0,forward.x);
  if(key==='arrowup'||key==='w')target.addScaledVector(forward,stride);else if(key==='arrowdown'||key==='s')target.addScaledVector(forward,-stride);else if(key==='arrowleft'||key==='a')target.addScaledVector(right,-stride);else if(key==='arrowright'||key==='d')target.addScaledVector(right,stride);else if(key==='q')azimuth-=.12;else if(key==='e')azimuth+=.12;else if(key==='+'||key==='=')cameraDistance=Math.max(180,cameraDistance*.88);else cameraDistance=Math.min(13000,cameraDistance*1.14);
});

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
function pick(x,y){
  pointer.set(x/innerWidth*2-1,-y/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(city,false)[0];if(!hit){$('#selection').hidden=true;return;}
  const face=hit.faceIndex;let low=0,high=faceEnds.length-1;while(low<high){const mid=(low+high)>>1;if(faceEnds[mid]>face)high=mid;else low=mid+1;}
  const building=renderBuildings[low],kind=classify(building),direct=SM.records[String(building.id)]||{};
  $('#selectedName').textContent=building.name||`Công trình ${building.id}`;
  $('#selectedBody').innerHTML=`<p>Chiều cao dựng: <b>${building.h.toLocaleString('vi-VN')} m</b> · ${building.q==='estimated'?'ước lượng':'có đối chiếu nguồn'}</p><p>Họ vật liệu: <b>${['Phổ thông','Nhà ở','Kính thương mại','Công cộng','Công nghiệp','Trung tâm','Tôn giáo','Hỗn hợp'][kind]}</b></p><p>${Object.keys(direct).length?'Có thẻ vật liệu/màu từ dữ liệu mở; shader thêm độ nhám, ô cửa và phong hóa.':'Màu và nhịp mặt đứng được suy luận ổn định từ loại công trình, chiều cao, khu vực và ID.'}</p>`;
  $('#selection').hidden=false;
}
$('#closeSelection').onclick=()=>{$('#selection').hidden=true;};

$('#buildingCount').textContent=D.meta.renderedBuildings.toLocaleString('vi-VN');
Object.assign(materialStatus,{
  version:APP_VERSION,threeRevision:THREE.REVISION,backend:actualWebGPU?'webgpu':'webgl2-fallback',
  buildings:D.meta.renderedBuildings,areaKm2:D.meta.areaKm2,materialFamilies:8,
  directlyTaggedBuildings:SM.directTaggedBuildings,directCoveragePercent:SM.directCoveragePercent,
  inferredBuildings:D.meta.renderedBuildings-SM.directTaggedBuildings,realism:100,light:'day',
  bridge:{name:'Cầu Ba Son',pylonHeightM:113,cablePlanes:2,cables:28,surveyedGeometry:false},
  marinaCentral:{heightM:240,floors:55,osmParts:[1432358258,1432358259,1432358260],classification:'official_attributes_anchored_to_open_footprint'},
  grandMarinaResidences:{correctedTowers:4,osmParts:[1151026864,1151026865,1151026866,1151026867],heightsM:[170,170,170,162],heightClass:'official_floor_count_proxy',towerNameMapping:'withheld_pending_official_geospatial_plan'},
  limitations:['Không phải ảnh mặt đứng khảo sát','Hầu hết chiều cao còn ước lượng','Kết cấu cầu và chi tiết giật cấp Marina Central là mô hình cách điệu có neo nguồn'],state:'ready'
});

let visualPipeline=null,pipelineFault=false;
try{visualPipeline=createCityRenderPipeline(renderer,scene,camera,visualQuality);}catch(error){pipelineFault=true;console.warn('City Visual Runtime 30 unavailable; direct rendering retained.',error);}
const adaptiveQuality=createAdaptiveQuality(renderer,{minRatio:visualQuality.minPixelRatio,maxRatio:visualQuality.maxPixelRatio,lowFps:visualQuality.targetLowFps,highFps:visualQuality.targetHighFps});
materialStatus.visualRuntime={
  version:'30b',profile:visualQuality.id,pipeline:visualPipeline?.name||'direct fallback',effects:visualPipeline?.effects||[],shadows:{type:shadowSystem.type,cascades:shadowSystem.cascades,mapSize:shadowSystem.mapSize,maxFar:shadowSystem.maxFar},adaptiveResolution:true,
  facade:'semantic procedural depth + frames + mullions + weathering',
  geometryLod:'district parapets + hero facade ledges/awnings + rooftop plant + public-realm lamps',
  vegetation:'near 3-lobe canopy + far HLOD',water:'multi-frequency current + Fresnel + animated Kelvin wake',
  camera:'critical-damped tour transitions + inertial orbit',licenseIsolation:'clean-room implementation; no SpiderBench source or assets'
};

let lastTime=performance.now(),frameCount=0,fpsTime=lastTime,lastLabel=0;
const overlaps=(a,b,padding=6)=>a.left-padding<b.right&&a.right+padding>b.left&&a.top-padding<b.bottom&&a.bottom+padding>b.top;
function updateLabels(){
  const occupied=[...document.querySelectorAll('.topbar,.nav-dock,.controls,.flood-lab,.selection,.hud,.ioc-alert-bar')]
    .filter(element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return !element.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0.05&&rect.width>0&&rect.height>0;})
    .map(element=>element.getBoundingClientRect());
  const candidates=[];
  for(const label of labels){
    const projected=label.pos.clone().project(camera),x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
    const visible=(label.active!==false)&&projected.z<1&&x>30&&x<innerWidth-30&&y>60&&y<innerHeight-48;
    label.el.style.display='none';
    if(visible)candidates.push({label,x,y,priority:label.active===true?0:1});
  }
  candidates.sort((a,b)=>a.priority-b.priority);
  for(const candidate of candidates){
    const {label,x,y}=candidate;
    label.el.style.left=`${Math.round(x)}px`;label.el.style.top=`${Math.round(y)}px`;label.el.style.display='block';
    const rect=label.el.getBoundingClientRect();
    if(occupied.some(item=>overlaps(rect,item,7)))label.el.style.display='none';
    else occupied.push(rect);
  }
}
function render(now){
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  if(desired){
    smoothDampVector(target,transitionVelocity,desired.target,.68,dt);
    cameraDistance=smoothDampScalar(transitionState,'distance',desired.distance,.72,dt);
    azimuth=smoothDampScalar(transitionState,'azimuth',desired.az,.72,dt);
    polar=smoothDampScalar(transitionState,'polar',desired.polar,.72,dt);
    if(Math.abs(cameraDistance-desired.distance)<.35&&target.distanceTo(desired.target)<.18){target.copy(desired.target);cameraDistance=desired.distance;azimuth=desired.az;polar=desired.polar;desired=null;}
  }else if(!pointerDown){
    azimuth+=orbitVelocity;polar=THREE.MathUtils.clamp(polar+polarVelocity,.16,1.43);target.add(panVelocity);cameraDistance=THREE.MathUtils.clamp(cameraDistance*Math.exp(zoomVelocity),180,13000);
    const orbitDecay=Math.exp(-dt*8.5),panDecay=Math.exp(-dt*9.5),zoomDecay=Math.exp(-dt*10.5);orbitVelocity*=orbitDecay;polarVelocity*=orbitDecay;panVelocity.multiplyScalar(panDecay);zoomVelocity*=zoomDecay;
  }
  camera.position.set(target.x+cameraDistance*Math.sin(polar)*Math.sin(azimuth),target.y+cameraDistance*Math.cos(polar),target.z+cameraDistance*Math.sin(polar)*Math.cos(azimuth));camera.lookAt(target);
  scene.fog.density=Math.min(activeFogDensity,Math.max(.000018,.22/cameraDistance));
  shadowSystem.update(target,cameraDistance);
  cityDetailRuntime.update(cameraDistance,nightLevel.value);
  streetFurniture.update(cameraDistance,nightLevel.value);
  heroCorridor.update(cameraDistance,nightLevel.value,activeView==='corridor');
  identityFacades.update(cameraDistance,activeView);
  const closeVegetation=cameraDistance<3400;trunks.visible=closeVegetation;canopies.visible=closeVegetation;farCanopies.visible=cameraDistance>2500;
  advanceUrbanMotion(now);
  if(now-lastLabel>120){lastLabel=now;updateLabels();}
  adaptiveQuality.update(dt,cameraDistance,pointerDown||!!desired);
  renderer.info?.reset?.();
  if(visualPipeline&&!pipelineFault){try{visualPipeline.render();}catch(error){pipelineFault=true;materialStatus.visualRuntime.pipeline='direct fallback after compile failure';materialStatus.visualRuntime.error=String(error?.message||error);console.warn('City Visual Runtime 30 pipeline failed; switching to direct rendering.',error);renderer.render(scene,camera);}}
  else renderer.render(scene,camera);
  frameCount++;
  if(now-fpsTime>1000){const fps=Math.round(frameCount*1000/(now-fpsTime));frameCount=0;fpsTime=now;$('#fps').textContent=fps;const triangles=renderer.info?.render?.triangles??0;$('#triangles').textContent=triangles>1e6?`${(triangles/1e6).toFixed(1)}M`:Math.round(triangles/1000)+'K';materialStatus.fps=fps;materialStatus.meshes=sceneMeshCount;materialStatus.triangles=triangles||null;}
}

window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();adaptiveQuality.resize();});
setProgress(94,'Đang nạp pipeline GPU lần đầu…');
renderer.setAnimationLoop(render);
await renderer.compileAsync(scene,camera);
setProgress(100,'Sẵn sàng');
window.dispatchEvent(new CustomEvent('citylab:renderer-ready',{detail:materialStatus}));
setTimeout(()=>loading.classList.add('done'),220);
