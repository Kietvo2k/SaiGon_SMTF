import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = resolve(process.env.NORTH_TEST_ROOT || '.');
export const poc = 'outputs/hcmc-poc/';
export const north = `${poc}data/public-north/`;
export const seeds = 'outputs/smart-traffic/backend/app/seed/';
export const readJson = path => {assert.ok(existsSync(join(root,path)),`Thiếu JSON bắt buộc ${path}`);return JSON.parse(readFileSync(join(root, path), 'utf8').replace(/^\uFEFF/, ''));};
export const readText = path => readFileSync(join(root, path), 'utf8');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const region = JSON.parse(readFileSync(new URL('./fixtures/north-region.json', import.meta.url))).polygon;
export const sourceHashes = Object.freeze({ graph: '1da1f3d4cc8a0e9de2e050f21ee2bf4450cbe4fc9a23e16726f46ef03bdb6149', scene: '50b89a3b8035ddc23c81ce20590f1274737d7443657fc791f3a6c069cf96dfa2' });
export const targets = Object.freeze({ 'HX-01': [366390689,'HX-C1'], 'HX-02': [366440827,'HX-C2'], 'HX-03': [10118771782,'HX-C3'], 'HX-04': [12437015526,'HX-C4'], 'HX-05': [701671562,'HX-C1'], 'HX-06': [1497276515,'HX-C5'], 'Bac-01': [12310895540,'Bac-01'], 'Bac-01-02': [2351201590,'Bac-01'], 'Bac-02': [366376129,'Bac-02'], 'Bac-03': [366416151,'Bac-03'], 'Bac-04': [7975327079,'Bac-04'], 'Bac-05': [2028465981,'Bac-05'] });
export const clusters = [...new Set(Object.values(targets).map(row => row[1]))];

// Dùng đúng vendor trong import map; không thay THREE bằng đối tượng giả.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'three' || specifier === 'three/webgpu') return { url: pathToFileURL(join(root,poc,'vendor/three186/three.webgpu.js')).href, shortCircuit: true };
  if (specifier === 'three/tsl') return { url: pathToFileURL(join(root,poc,'vendor/three186/three.tsl.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(join(root,poc,'vendor/three186/addons',specifier.slice(13))).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
export const product = name => import(pathToFileURL(join(root,poc,name)).href);
export function dataset() { return { graph: readJson(`${north}road-graph.json`), scene: readJson(`${north}scene.json`), mapping: readJson(`${north}mapping.json`), source: readJson(`${poc}data/road-graph-31.json`), sourceScene: readJson(`${poc}data/scene.json`) }; }
export function normalizePolyline(c) { return typeof c?.[0] === 'number' ? Array.from({length:c.length/2},(_,i)=>c.slice(i*2,i*2+2)) : c; }
export const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
export const lengthOf = c => {const p=normalizePolyline(c);return p.slice(1).reduce((v,x,i)=>v+distance(x,p[i]),0);};
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const lerp = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function boundaryDistance(p, ring) { return Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length],v=sub(b,a),w=sub(p,a),t=Math.max(0,Math.min(1,(v[0]*w[0]+v[1]*w[1])/(v[0]**2+v[1]**2||1)));return distance(p,lerp(a,b,t));})); }
export function pointInPolygon(p, polygon=region) {
  if (boundaryDistance(p,polygon)<1e-8) return true;
  let inside=false; for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {const a=polygon[i],b=polygon[j]; if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;} return inside;
}
// Oracle JS theo từng đoạn có station: giữ thứ tự cả khi đường tự giao hoặc đi ngược.
export function clipPolyline(c, polygon=region) {
  const points=normalizePolyline(c), fragments=[]; let station=0;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],r=sub(b,a),len=distance(a,b); if(len<1e-10) continue;
    const cuts=[0,1];
    for(let j=0;j<polygon.length;j++) {
      const q=polygon[j],s=sub(polygon[(j+1)%polygon.length],q),v=sub(q,a),den=cross(r,s);
      if(Math.abs(den)>1e-10) { const t=cross(v,s)/den,u=cross(v,r)/den; if(t>=-1e-10&&t<=1+1e-10&&u>=-1e-10&&u<=1+1e-10) cuts.push(Math.max(0,Math.min(1,t))); }
      else if(Math.abs(cross(v,r))<1e-7) for(const p of [q,polygon[(j+1)%polygon.length]]) {const t=((p[0]-a[0])*r[0]+(p[1]-a[1])*r[1])/(len*len); if(t>0&&t<1) cuts.push(t);}
    }
    const ts=[...new Set(cuts.map(t=>Math.round(t*1e12)/1e12))].sort((x,y)=>x-y);
    for(let j=1;j<ts.length;j++) {
      const t0=ts[j-1],t1=ts[j]; if(t1-t0<1e-10||!pointInPolygon(lerp(a,b,(t0+t1)/2),polygon)) continue;
      const start=station+t0*len,end=station+t1*len,first=lerp(a,b,t0),last=lerp(a,b,t1),prev=fragments.at(-1);
      if(prev&&Math.abs(prev.end_m-start)<1e-7) {if(distance(prev.c.at(-1),last)>1e-8) prev.c.push(last);prev.end_m=end;} else fragments.push({c:[first,last],start_m:start,end_m:end});
    } station+=len;
  } return fragments;
}
export const clippedLength = (c,p=region) => clipPolyline(c,p).reduce((n,f)=>n+f.end_m-f.start_m,0);
export const pointOutsideEndpoints = (c,p=region) => {c=normalizePolyline(c);return !pointInPolygon(c[0],p)&&!pointInPolygon(c.at(-1),p);};
export function profileAt(p,s) {if(s<=p[0])return p[1];for(let i=2;i<p.length;i+=2)if(s<=p[i])return p[i-1]+(p[i+1]-p[i-1])*(s-p[i-2])/(p[i]-p[i-2]);return p.at(-1);}
export function near(a,b,message,tolerance=.020001) {assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${message}: ${a} ≠ ${b}`);}
export function geometryEqual(actual,expected,message) {actual=normalizePolyline(actual);expected=normalizePolyline(expected);assert.equal(actual.length,expected.length,`${message} số đỉnh`);actual.forEach((p,i)=>{near(p[0],expected[i][0],`${message} x${i}`);near(p[1],expected[i][1],`${message} z${i}`);});}
export function project(camera, point, width=1280,height=720) {
  const yaw=camera.yaw_deg*Math.PI/180,pitch=camera.pitch_deg*Math.PI/180;
  const f=[Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw)],r=[-Math.sin(yaw),0,Math.cos(yaw)],u=[-Math.sin(pitch)*Math.cos(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.sin(yaw)];
  const v=[point[0]-camera.x,point[1]-camera.height_m,point[2]-camera.z],dot=a=>a.reduce((n,x,i)=>n+x*v[i],0),depth=dot(f),scale=height/(2*Math.tan(camera.fov_deg*Math.PI/360));
  return {depth,x:width/2+scale*dot(r)/depth,y:height/2-scale*dot(u)/depth};
}

export const widths = Object.freeze({motorway:16,trunk:15,primary:14,secondary:11,tertiary:8,residential:5,living_street:4,service:3.5,unclassified:5,footway:2.5,pedestrian:12,cycleway:2,path:1.5});
export async function publicNetwork({graph=readJson(`${north}road-graph.json`),roads=readJson(`${north}scene.json`).roads}={}) {
  const sidecars=readJson(`${north}runtime-sidecars.json`),nodeMap=readJson(`${seeds}public-north/node_map.json`);
  const [{buildSignalPlan32},{buildTrafficNetwork31},{roadWidth31},{lockRoadFilter32},{regionOf},{loadSignatureRegistry}]=await Promise.all([
    product('signal-plan-32.js'),product('city-traffic-sim-31.js'),product('city-road-network-31.js'),product('city-lock-32.js'),product('city-region-31.js'),product('signature-registry-31.js')
  ]);
  const rows=sidecars.signalRows;
  assert.ok(Array.isArray(rows)&&rows.length===12,'Public signal rows đủ 12');
  const signalPlan=buildSignalPlan32({graph,nodeMap,rows});
  const byId=new Map(graph.nodes.map((n,i)=>[n.id,{...n,index:i}])),signalPoints=rows.map(r=>{const n=byId.get(r.osm_id);assert.ok(n,`Signal OSM thiếu ${r.osm_id}`);return[n.x,n.z];});
  const globals=sidecars.globals;
  const registry=loadSignatureRegistry(globals.SIGNATURE_REGISTRY_31);
  const filter=lockRoadFilter32({roads,regionOf,signalPoints,isSignatureWay:id=>registry.isSignatureWay(id)});
  const simHidden=new Set(filter.hidden);for(const i of filter.keptMinor)simHidden.add(i);
  const widthOf=i=>roadWidth31(roads[i],widths),drawn=i=>!roads[i].tunnel&&graph.roads[i].skipRender!=='hide'&&!simHidden.has(i);
  const net=buildTrafficNetwork31({graph,roads,widthOf,drawn,signalPlan});
  return {net,graph,roads,sidecars,nodeMap:nodeMap.map(r=>({...r,index:byId.get(r.osm_id)?.index})),signalPlan,signalPoints,filter,widthOf,drawn,widths};
}
