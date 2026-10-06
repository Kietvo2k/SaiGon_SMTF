import * as THREE from 'three/webgpu';
import { loadSignatureRegistry } from './signature-registry-31.js?v=30b-31e2';

/*
 * City Density 31 · bước E/F kế hoạch 31A — "Mật độ chi tiết" (Đầy đủ / Cân bằng / Nhẹ / Tối thiểu).
 *
 * - Công trình: mesh gộp cũ được chia thành chunk theo lưới (frustum culling theo ô). Trong mỗi chunk công trình
 *   xếp theo hạng ưu tiên giảm dần — signature (registry) tuyệt đối đứng đầu, sau đó theo điểm xác định: diện tích,
 *   chiều cao, khoảng cách tới đường cấp cao, khoảng cách tới công trình signature, có tên. Mỗi mức chỉ là một
 *   drawRange khác (không dựng lại); chunk rỗng ẩn hẳn (bớt draw call).
 * - Instance (cây, chi tiết runtime 28, thiết bị mái): mục được bảo vệ trước, rồi theo hạng phân tầng ô 300 m (van der
 *   Corput trên Morton; thưa đều, không bỏ trọn một ô) → mỗi mức chỉ đổi .count. Nhóm nặng ở tầm gần chia chunk lưới
 *   (cull theo ô); nhóm nhẹ sắp lại ngay trong mesh nguồn (không thêm draw call).
 * - Đèn (E2), xe (bước D), tàu, lan can cầu thủ tục: qua API của từng module.
 * Bất biến F: mọi bộ lọc đi qua signature-registry-31.js; công trình/cây/đèn/module signature không bao giờ giảm.
 * Hiệu ứng hậu kỳ/bóng vẫn do hồ sơ quality (city-visual-runtime-30.js) quản lý.
 * Không có ngẫu nhiên: mọi thứ hạng là hàm xác định của dữ liệu (băm theo SEED).
 */

export const CITY_DENSITY_31_VERSION='density-31e';
const SEED=31;
const STORAGE_KEY='citylab.31e.density';
const SUGGEST_AFTER_S=8;       // FPS dưới ngưỡng liên tục bấy lâu thì đề xuất hạ mức
const SUGGEST_SNOOZE_S=120;    // bỏ qua đề xuất thì không hỏi lại trong khoảng này

// Tỉ lệ giữ lại phần KHÔNG signature của từng nhóm (signature/vùng bảo vệ luôn giữ 100 %).
export const DENSITY_LEVELS_31=Object.freeze([
  Object.freeze({id:'full',label:'Đầy đủ',buildings:1,trees:1,details:1,fixtures:1,lamps:1,vehicles:1,vessels:1,bridgeRails:true}),
  Object.freeze({id:'balanced',label:'Cân bằng',buildings:.55,trees:.6,details:.6,fixtures:.5,lamps:.65,vehicles:.6,vessels:.7,bridgeRails:true}),
  Object.freeze({id:'light',label:'Nhẹ',buildings:.32,trees:.38,details:.3,fixtures:.25,lamps:.4,vehicles:.35,vessels:.45,bridgeRails:false}),
  Object.freeze({id:'minimal',label:'Tối thiểu',buildings:.16,trees:.2,details:0,fixtures:0,lamps:.15,vehicles:.15,vessels:.25,bridgeRails:false})
]);
const levelById=new Map(DENSITY_LEVELS_31.map((level,index)=>[level.id,{...level,index}]));

const clamp01=v=>Math.max(0,Math.min(1,v));
const fract=v=>v-Math.floor(v);
function hash01(a,b=0){let h=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul(b+SEED,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;return(h>>>0)/4294967296;}
function vanDerCorput(k){let v=0,f=.5;for(k=k+1;k>0;k>>=1,f*=.5)if(k&1)v+=f;return v;}
// Morton 2D (lưới 4 m) như city-street-furniture-31.js: thứ tự kề nhau ⇒ không gian kề nhau.
function morton(x,z){const q=v=>{v=Math.max(0,Math.min(65535,Math.floor(v/4+32768)));v=(v|(v<<8))&0x00ff00ff;v=(v|(v<<4))&0x0f0f0f0f;v=(v|(v<<2))&0x33333333;return(v|(v<<1))&0x55555555;};return q(x)*2+q(z);}
function polygonArea(ring){let s=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s*.5);}
function contains(x,z,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function segmentDistance(px,pz,ax,az,bx,bz){const sx=bx-ax,sz=bz-az,l=sx*sx+sz*sz,t=l?clamp01(((px-ax)*sx+(pz-az)*sz)/l):0;return Math.hypot(ax+sx*t-px,az+sz*t-pz);}
// Số phần tử đầu của mảng tăng dần nhỏ hơn f (từ vị trí start).
function countBelow(sorted,f,start=0){let lo=start,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid]<f)lo=mid+1;else hi=mid;}return lo-start;}
const cellKey=(x,z,size)=>`${Math.floor(x/size)},${Math.floor(z/size)}`;

// Cổng registry dùng chung: công trình signature, vùng giữ cây/đèn, và chi tiết nằm trên footprint signature.
export function createSignatureGate31({registry=loadSignatureRegistry(),buildings=[],marginM=4}={}){
  const footprints=[];
  for(const building of buildings){
    if(!registry.isSignatureBuilding(building.id)||!building.r?.[0]?.length)continue;
    const ring=building.r[0],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
    footprints.push({ring,box:[Math.min(...xs)-marginM,Math.min(...zs)-marginM,Math.max(...xs)+marginM,Math.max(...zs)+marginM]});
  }
  const onSignatureFootprint=(x,z)=>footprints.some(({ring,box})=>x>=box[0]&&z>=box[1]&&x<=box[2]&&z<=box[3]&&(contains(x,z,ring)||ring.some((a,i)=>{const b=ring[(i+1)%ring.length];return segmentDistance(x,z,a[0],a[1],b[0],b[1])<=marginM;})));
  return Object.freeze({
    registry,
    isSignatureBuilding:id=>registry.isSignatureBuilding(id),
    // kind 'tree'|'lamp': vùng giữ loại đó; 'detail': mọi vùng + chi tiết gắn trên công trình signature.
    protects(x,z,kind){return kind==='detail'?registry.inProtectedZone(x,z,'any')||onSignatureFootprint(x,z):registry.inProtectedZone(x,z,kind);}
  });
}

// Điểm ưu tiên xác định của công trình (cao hơn = giữ lâu hơn). Không dùng cho signature (hạng tuyệt đối).
export function scoreBuildings31({buildings,roads,isSignature=()=>false}){
  const MAJOR=/^(motorway|trunk|primary|secondary)(_link)?$/,CELL=100,REACH=150,grid=new Map();
  for(const road of roads){
    if(road.tunnel||!MAJOR.test(road.type))continue;
    for(let k=0;k+1<road.c.length;k++){
      const [ax,az]=road.c[k],[bx,bz]=road.c[k+1];
      for(let gx=Math.floor(Math.min(ax,bx)/CELL);gx<=Math.floor(Math.max(ax,bx)/CELL);gx++)for(let gz=Math.floor(Math.min(az,bz)/CELL);gz<=Math.floor(Math.max(az,bz)/CELL);gz++){
        const key=`${gx},${gz}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push([ax,az,bx,bz]);
      }
    }
  }
  const roadDistance=(x,z)=>{
    let best=REACH;const gx=Math.floor(x/CELL),gz=Math.floor(z/CELL),r=Math.ceil(REACH/CELL);
    for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++)for(const s of grid.get(`${gx+i},${gz+j}`)||[])best=Math.min(best,segmentDistance(x,z,s[0],s[1],s[2],s[3]));
    return best;
  };
  const heroes=buildings.filter(b=>isSignature(b.id)).map(b=>b.center);
  const scores=new Float64Array(buildings.length);
  buildings.forEach((b,i)=>{
    const [x,z]=b.center;let hero=Infinity;for(const c of heroes)hero=Math.min(hero,Math.hypot(c[0]-x,c[1]-z));
    const size=clamp01(Math.log10(Math.max(1,polygonArea(b.r[0])))/Math.log10(4000));
    scores[i]=.32*size+.24*clamp01(b.h/60)+.22*(1-roadDistance(x,z)/REACH)+.12*(1-clamp01(hero/1500))+.1*(b.name?1:0)+1e-6*hash01(Number(b.id)|0);
  });
  return scores;
}

// Chia công trình thành chunk lưới; arrays là mảng đỉnh theo thứ tự công trình, faceEnds[i] = tam giác cuối (lũy kế).
export function createBuildingChunks31({arrays,itemSizes,faceEnds,buildings,material,roads,gate,cellSize=2500,name='Công trình 31E'}){
  const started=performance.now(),n=buildings.length,faceStart=i=>i?faceEnds[i-1]:0;
  const scores=scoreBuildings31({buildings,roads,isSignature:id=>gate.isSignatureBuilding(id)});
  const drawable=[];for(let i=0;i<n;i++)if(faceEnds[i]>faceStart(i))drawable.push(i);
  // Hạng toàn cục ∈ [0,1): 0 = giữ lâu nhất; signature = -1 (luôn trong drawRange).
  const rank=new Float32Array(n).fill(2);
  const ordinary=drawable.filter(i=>!gate.isSignatureBuilding(buildings[i].id)).sort((a,b)=>scores[b]-scores[a]||a-b);
  ordinary.forEach((i,k)=>{rank[i]=k/ordinary.length;});
  for(const i of drawable)if(gate.isSignatureBuilding(buildings[i].id))rank[i]=-1;
  const cells=new Map();
  for(const i of drawable){const key=cellKey(buildings[i].center[0],buildings[i].center[1],cellSize);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
  const group=new THREE.Group();group.name=`${name} · chunk lưới ${cellSize} m`;
  const meshes=[];
  for(const [key,list] of [...cells].sort((a,b)=>a[0]<b[0]?-1:1)){
    list.sort((a,b)=>rank[a]-rank[b]||a-b);
    const vertexEnds=new Int32Array(list.length),ranks=new Float32Array(list.length);let vertices=0;
    list.forEach((i,k)=>{vertices+=(faceEnds[i]-faceStart(i))*3;vertexEnds[k]=vertices;ranks[k]=rank[i];});
    const geometry=new THREE.BufferGeometry();
    for(const [attribute,size] of Object.entries(itemSizes)){
      const source=arrays[attribute],target=new Float32Array(vertices*size);let offset=0;
      for(const i of list){const from=faceStart(i)*3*size,to=faceEnds[i]*3*size;for(let s=from;s<to;s++)target[offset++]=source[s];}
      geometry.setAttribute(attribute,new THREE.Float32BufferAttribute(target,size));
    }
    geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`${name} · ô ${key}`;mesh.castShadow=true;mesh.receiveShadow=true;
    const signatureCount=ranks.findIndex(r=>r>=0);
    mesh.userData.densityChunk={cell:key,buildings:Int32Array.from(list),vertexEnds,ranks,signatureCount:signatureCount<0?list.length:signatureCount};
    group.add(mesh);meshes.push(mesh);
  }
  let shown=drawable.length;
  const setFraction=f=>{
    shown=0;let triangles=0;
    for(const mesh of meshes){
      const chunk=mesh.userData.densityChunk,k=f>=1?chunk.buildings.length:chunk.signatureCount+countBelow(chunk.ranks,f,chunk.signatureCount);
      const count=k?chunk.vertexEnds[k-1]:0;
      mesh.geometry.setDrawRange(0,count);mesh.visible=count>0;shown+=k;triangles+=count/3;
    }
    return {buildings:shown,triangles};
  };
  // Chọn công trình: raycast tôn trọng drawRange; tam giác → công trình bằng tìm nhị phân trên vertexEnds.
  const pick=raycaster=>{
    const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit)return null;
    const chunk=hit.object.userData.densityChunk,vertex=hit.faceIndex*3;let lo=0,hi=chunk.vertexEnds.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(chunk.vertexEnds[mid]>vertex)hi=mid;else lo=mid+1;}
    return chunk.buildings[lo];
  };
  const shownIds=()=>{const ids=[];for(const mesh of meshes){const chunk=mesh.userData.densityChunk,count=mesh.visible?mesh.geometry.drawRange.count:0;for(let k=0;k<chunk.buildings.length&&chunk.vertexEnds[k]<=count;k++)ids.push(Number(buildings[chunk.buildings[k]].id));}return ids;};
  const stats={chunks:meshes.length,cellSizeM:cellSize,drawable:drawable.length,signature:drawable.length-ordinary.length,triangles:faceEnds[n-1]||0,buildMs:Math.round(performance.now()-started)};
  return {group,meshes,setFraction,pick,shownIds,stats,total:drawable.length,shown:()=>shown};
}

// Thưa đều instance (cây, chi tiết runtime 28, thiết bị mái). Hạng phân tầng theo ô 300 m: trong ô có m mục (thứ tự
// Morton), hạng = (π + φ)/m với π là thứ bậc van der Corput của vị trí Morton và φ là pha băm của ô ⇒ ở tỉ lệ f mỗi ô
// giữ đúng ⌈f·m − φ⌉ mục, trải đều trong ô. Mục được bảo vệ (registry) luôn đứng đầu. Mỗi mức chỉ đổi .count.
// - nguồn inPlace (hoặc cellSize null): sắp lại ngay trong mesh nguồn theo thứ tự toàn cục (không thêm draw call) —
//   cho nhóm nhẹ (tán cây xa, thiết bị mái). Tiền tố toàn cục độ dài `shown` trùng đúng tập các tiền tố theo ô.
// - còn lại: chia InstancedMesh con theo lưới cellSize (frustum/bóng cull theo ô) — cho nhóm nặng ở tầm gần (cây, chi
//   tiết 28). Mesh nguồn giữ nguyên trong scene (runtime cũ vẫn bật/tắt .visible theo LOD) nhưng tắt layer để không vẽ.
export function createInstanceDensity31({sources,items,isProtected=()=>false,stratumM=300,cellSize=null,label='Instance 31E'}){
  const n=items.length,prot=new Uint8Array(n),rank=new Float64Array(n),strata=new Map();
  for(let k=0;k<n;k++){
    prot[k]=isProtected(items[k].x,items[k].z)?1:0;
    if(prot[k])continue;
    const key=cellKey(items[k].x,items[k].z,stratumM);if(!strata.has(key))strata.set(key,[]);strata.get(key).push(k);
  }
  for(const [key,list] of strata){
    const m=list.length,[gx,gz]=key.split(',').map(Number),phase=hash01(Math.imul(gx,73856093)^Math.imul(gz,19349663),m);
    list.sort((a,b)=>morton(items[a].x,items[a].z)-morton(items[b].x,items[b].z)||a-b);
    [...list.keys()].sort((a,b)=>vanDerCorput(a)-vanDerCorput(b)||a-b).forEach((j,pi)=>{rank[list[j]]=(pi+phase)/m;});
  }
  const order=[...Array(n).keys()].sort((a,b)=>prot[b]-prot[a]||rank[a]-rank[b]||a-b);
  // Nhóm (một nhóm nếu không chia ô); trong nhóm giữ thứ tự order ⇒ mục bảo vệ trước, rồi hạng tăng dần.
  const groups=new Map();
  for(const k of order){const key=cellSize?cellKey(items[k].x,items[k].z,cellSize):'all';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(k);}
  const cells=[...groups].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([key,list])=>{
    const protectedCount=list.filter(k=>prot[k]).length;
    return {key,list,protectedCount,ranks:Float64Array.from(list.slice(protectedCount),k=>rank[k]),meshes:[]};
  });
  const inPlace=[];
  for(const {mesh,stride=1,key:sourceKey,inPlace:own=!cellSize} of sources){
    const source=sourceKey||mesh.name;
    const copy=(attribute,size,target,list)=>{const from=attribute.array;list.forEach((k,slot)=>target.set(from.subarray(k*stride*size,(k+1)*stride*size),slot*stride*size));};
    if(own){
      for(const [attribute,size] of [[mesh.instanceMatrix,16],[mesh.instanceColor,3]]){if(!attribute)continue;const target=attribute.array.slice();copy(attribute,size,target,order);attribute.array.set(target);attribute.needsUpdate=true;}
      mesh.userData.densityInstances={source,stride,protected:order.filter(k=>prot[k]).length};
      inPlace.push({mesh,stride});
      continue;
    }
    for(const cell of cells){
      const count=cell.list.length*stride,chunk=new THREE.InstancedMesh(mesh.geometry,mesh.material,count);
      copy(mesh.instanceMatrix,16,chunk.instanceMatrix.array,cell.list);
      if(mesh.instanceColor){chunk.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3);copy(mesh.instanceColor,3,chunk.instanceColor.array,cell.list);}
      chunk.instanceMatrix.setUsage(THREE.StaticDrawUsage);chunk.instanceMatrix.needsUpdate=true;
      chunk.castShadow=mesh.castShadow;chunk.receiveShadow=mesh.receiveShadow;chunk.renderOrder=mesh.renderOrder;
      chunk.name=`${mesh.name||label} · ô ${cell.key}`;
      chunk.userData.densityInstances={source,stride,protected:cell.protectedCount};
      chunk.computeBoundingSphere();
      mesh.add(chunk);cell.meshes.push({chunk,stride});
    }
    mesh.layers.disableAll();
  }
  const protectedTotal=cells.reduce((s,c)=>s+c.protectedCount,0);
  let shown=n;
  const setFraction=f=>{
    shown=0;
    for(const cell of cells){
      const k=f>=1?cell.list.length:cell.protectedCount+countBelow(cell.ranks,f);shown+=k;
      // Chỉ đổi count, KHÔNG ẩn chunk: count 0 ⇒ three r186 bỏ qua draw (không tính draw call) nhưng pipeline vẫn được
      // dựng khi chunk vào khung nhìn ⇒ đổi mức sau đó không phải biên dịch (tránh khung đứng hình ~0,5 s).
      for(const {chunk,stride} of cell.meshes)chunk.count=k*stride;
    }
    for(const {mesh,stride} of inPlace)mesh.count=shown*stride;
    return shown;
  };
  return {setFraction,total:n,protected:protectedTotal,chunks:cells.reduce((s,c)=>s+c.meshes.length,0),shown:()=>shown};
}

// Vị trí instance đọc từ ma trận (cho mesh không lộ danh sách mục: chi tiết runtime 28, thiết bị mái).
export function instanceItems31(mesh){const m=mesh.instanceMatrix.array,out=[];for(let i=0;i<mesh.count;i++)out.push({x:m[i*16+12],z:m[i*16+14]});return out;}

// Gộp các mesh tĩnh con trực tiếp của nhóm theo (vật liệu, bóng) thành một mesh — giữ nguyên hình, bớt draw call.
// Dùng cho kết cấu signature (cầu Ba Son, Marina): không ẩn gì, chỉ gộp.
export function mergeStaticMeshes31(group){
  group.updateMatrixWorld(true);
  const inverse=group.matrixWorld.clone().invert(),buckets=new Map();
  for(const child of [...group.children]){
    if(!child.isMesh||child.isInstancedMesh||child.children.length)continue;
    const key=`${child.material.uuid}|${child.castShadow}|${child.receiveShadow}`;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(child);
  }
  let before=0,after=0;
  for(const list of buckets.values()){
    before+=list.length;
    if(list.length<2){after+=list.length;continue;}
    const positions=[],normals=[];
    for(const mesh of list){
      const g=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone());
      if(!g.attributes.normal)g.computeVertexNormals();
      g.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      positions.push(g.attributes.position.array);normals.push(g.attributes.normal.array);g.dispose();
    }
    const join=parts=>{const out=new Float32Array(parts.reduce((s,p)=>s+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(join(positions),3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(join(normals),3));
    const merged=new THREE.Mesh(geometry,list[0].material);
    merged.name=`${group.name} · gộp ${list.length}`;merged.castShadow=list[0].castShadow;merged.receiveShadow=list[0].receiveShadow;
    for(const mesh of list){mesh.removeFromParent();mesh.geometry.dispose();}
    group.add(merged);after++;
  }
  return {before,after};
}

const attachedToScene=object=>{for(let o=object;o;o=o.parent)if(o.isScene)return true;return false;};

// Bộ điều phối mật độ + UI. Mọi nhóm là tùy chọn; thiếu nhóm nào thì nhóm đó không giảm (ghi trong status).
export function createDensityController31({
  gate,buildingChunks,treeDensity,detailDensity=[],fixtureDensity=null,streetFurniture=null,traffic=null,vesselGroup=null,bridgeRails=[],
  audit:auditInputs,ui={},params=new URLSearchParams(location.search),status={},getFps=()=>60,lowFps=31,storage=globalThis.localStorage
}){
  const registry=gate.registry;
  const disabled=new Set();
  const vesselMeshes=[];vesselGroup?.traverse(o=>{if(o.isInstancedMesh){o.userData.densityCapacity=o.count;vesselMeshes.push(o);}});
  const trafficFallback=[];traffic?.group?.traverse(o=>{if(o.isInstancedMesh){o.userData.densityCapacity=o.count;trafficFallback.push(o);}});
  const vehicleTotal=()=>traffic?.api?.()?.total??trafficFallback[0]?.userData.densityCapacity??0;
  const fmt=v=>Number(v||0).toLocaleString('vi-VN');

  function setVehicles(f){
    const api=traffic?.api?.();
    if(typeof api?.setVisibleFraction==='function'){const shown=api.setVisibleFraction(f);return {shown:typeof shown==='number'?shown:Math.round(vehicleTotal()*f),via:'traffic.api.setVisibleFraction'};}
    if(typeof api?.setDensity==='function'){const shown=api.setDensity(f);return {shown:typeof shown==='number'?shown:Math.round(vehicleTotal()*f),via:'traffic.api.setDensity'};}
    // Dự phòng (chưa có API bước D): xe đã xếp theo điểm đoạn đường giảm dần → cắt đuôi giữ trục chính/trung tâm.
    let shown=0;for(const mesh of trafficFallback){mesh.count=Math.ceil(mesh.userData.densityCapacity*f);shown=mesh.count;}
    return {shown,via:'fallback mesh.count'};
  }
  const hasTrafficApi=()=>{const api=traffic?.api?.();return typeof api?.setVisibleFraction==='function'||typeof api?.setDensity==='function';};
  function syncVehicles(){
    for(const mesh of trafficFallback)mesh.count=mesh.userData.densityCapacity;   // trả mesh cũ về nguyên trạng
    const vehicles=setVehicles(current.vehicles);
    status.counts.vehicles=vehicles.shown;status.totals.vehicles=vehicleTotal();status.vehiclesVia=vehicles.via;
    document.body.dataset.densityVehicles=String(vehicles.shown);
    renderUi();
  }
  function runAudit(){
    const modules=Object.entries(auditInputs.modules||{}).filter(([,object])=>{
      const list=Array.isArray(object)?object:[object];
      return list.length>0&&list.every(o=>o&&attachedToScene(o)&&!disabled.has(o));
    }).map(([key])=>key);
    return registry.auditSignatureVisibility({buildings:[...buildingChunks.shownIds(),...(auditInputs.extraBuildingIds?.()||[])],ways:auditInputs.ways?.()||[],modules});
  }

  let current=null,source='default',suggestion=null,lowFor=0,snoozeUntil=0,simulatedFps=null,clock=0;
  function apply(id,from){
    const level=levelById.get(id);if(!level)return false;
    const started=performance.now();
    const built=buildingChunks.setFraction(level.buildings);
    const trees=treeDensity?treeDensity.setFraction(level.trees):0;
    const details=detailDensity.reduce((s,set)=>s+set.setFraction(level.details),0);
    const fixtures=fixtureDensity?fixtureDensity.setFraction(level.fixtures):0;
    const lamps=streetFurniture?streetFurniture.setVisibleFraction(level.lamps):0;
    const vehicles=setVehicles(level.vehicles);
    let vessels=0;for(const mesh of vesselMeshes){mesh.count=Math.max(1,Math.ceil(mesh.userData.densityCapacity*level.vessels));vessels=Math.max(vessels,mesh.count);}
    for(const rail of bridgeRails){rail.visible=level.bridgeRails;level.bridgeRails?disabled.delete(rail):disabled.add(rail);}
    current=level;source=from;
    const audit=runAudit();
    const applyMs=+(performance.now()-started).toFixed(2);
    Object.assign(status,{
      version:CITY_DENSITY_31_VERSION,level:level.id,label:level.label,source,applyMs,
      fractions:{buildings:level.buildings,trees:level.trees,details:level.details,fixtures:level.fixtures,lamps:level.lamps,vehicles:level.vehicles,vessels:level.vessels,bridgeRails:level.bridgeRails},
      counts:{buildings:built.buildings,buildingTriangles:built.triangles,trees,details,fixtures,lamps,vehicles:vehicles.shown,vessels},
      totals:{buildings:buildingChunks.total,trees:treeDensity?.total||0,lamps:streetFurniture?.instances?.().length||0,vehicles:vehicleTotal(),vessels:vesselMeshes[0]?.userData.densityCapacity||0},
      vehiclesVia:vehicles.via,
      audit:{complete:audit.complete,total:audit.total,visible:audit.visible,missing:audit.missing}
    });
    const body=document.body.dataset;
    body.densityLevel=level.id;body.densityAudit=audit.complete?'complete':'incomplete';
    body.densityBuildings=String(built.buildings);body.densityTrees=String(trees);body.densityLamps=String(lamps);body.densityVehicles=String(vehicles.shown);
    if(!audit.complete)console.warn('Mật độ 31E: registry signature chưa hiển thị đủ',audit.missing);
    renderUi();
    return true;
  }

  // --- UI: radiogroup roving tabindex như WAI-ARIA APG; nút đang chọn có class active như data-light/data-view.
  const buttons=ui.root?[...ui.root.querySelectorAll('[data-density]')]:[];
  function renderUi(){
    for(const button of buttons){
      const on=button.dataset.density===current?.id;
      button.classList.toggle('active',on);button.setAttribute('aria-checked',String(on));button.tabIndex=on?0:-1;
    }
    if(ui.counts&&status.counts)ui.counts.textContent=`${fmt(status.counts.buildings)} nhà · ${fmt(status.counts.trees)} cây · ${fmt(status.counts.lamps)} đèn · ${fmt(status.counts.vehicles)} xe`;
  }
  function choose(id,from){
    if(!apply(id,from))return;
    try{storage?.setItem(STORAGE_KEY,id);}catch{}
    // URL đang mang density thì cập nhật để reload không quay về giá trị cũ (URL ưu tiên hơn localStorage).
    const query=new URLSearchParams(location.search);
    if(query.has('density')){query.set('density',id);history.replaceState(null,'',`?${query}`);}
    hideSuggestion();
  }
  for(const button of buttons)button.addEventListener('click',()=>choose(button.dataset.density,'user'));
  ui.root?.addEventListener('keydown',event=>{
    const index=buttons.findIndex(b=>b.dataset.density===current?.id);if(index<0)return;
    const next={ArrowRight:index+1,ArrowDown:index+1,ArrowLeft:index-1,ArrowUp:index-1,Home:0,End:buttons.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();
    const target=buttons[(next+buttons.length)%buttons.length];
    choose(target.dataset.density,'user');target.focus();
  });

  // --- Đề xuất hạ mức khi FPS thấp kéo dài: chỉ đề xuất, không bao giờ tự áp.
  function hideSuggestion(){suggestion=null;lowFor=0;if(ui.suggest)ui.suggest.hidden=true;status.suggestion=null;}
  function showSuggestion(target,fps){
    suggestion=target;
    if(ui.suggestText)ui.suggestText.textContent=`Khung hình thấp (~${Math.round(fps)} FPS). Hạ mật độ xuống “${target.label}”?`;
    if(ui.suggest)ui.suggest.hidden=false;
    status.suggestion={target:target.id,fps:Math.round(fps)};
  }
  ui.suggestApply?.addEventListener('click',()=>{if(suggestion)choose(suggestion.id,'suggestion');});
  ui.suggestDismiss?.addEventListener('click',()=>{snoozeUntil=clock+SUGGEST_SNOOZE_S;hideSuggestion();});

  const requested=params.get('density');
  let stored=null;try{stored=storage?.getItem(STORAGE_KEY);}catch{}
  if(levelById.has(requested))apply(requested,'url');
  else if(levelById.has(stored))apply(stored,'storage');
  else apply('full','default');

  const api={
    levels:DENSITY_LEVELS_31,
    setLevel:(id,from='api')=>{choose(id,from);return status.level===id;},
    // QA: giả lập FPS đọc được (null = dùng FPS thật của adaptive quality).
    simulateFps:value=>{simulatedFps=value===null?null:Number(value);lowFor=0;},
    audit:runAudit
  };
  Object.defineProperty(status,'api',{value:api,enumerable:false,configurable:true});
  return {
    ...api,
    get level(){return current.id;},
    update(dt){
      clock+=dt;
      // API xe của bước D có thể khởi tạo sau bộ điều phối: khi xuất hiện thì đồng bộ ngay mức hiện tại.
      if(status.vehiclesVia==='fallback mesh.count'&&hasTrafficApi())syncVehicles();
      const fps=simulatedFps??getFps();
      lowFor=fps<lowFps?lowFor+dt:0;
      if(!suggestion&&lowFor>=SUGGEST_AFTER_S&&clock>=snoozeUntil&&current.index<DENSITY_LEVELS_31.length-1)showSuggestion(levelById.get(DENSITY_LEVELS_31[current.index+1].id),fps);
    }
  };
}
