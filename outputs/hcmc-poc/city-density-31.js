import * as THREE from 'three/webgpu';
import { loadSignatureRegistry } from './signature-registry-31.js?v=30b-31e2';
import { REGION_ALL_ID, REGION_STORAGE_KEY, REGION_URL_PARAM, REGIONS_31, normalizeRegionId, regionById, regionTrafficPayload } from './city-region-31.js?v=30b-31h';

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
 * Bước H — "Khu mô phỏng" (city-region-31.js): chọn 1 trong 4 khu (hoặc Toàn bộ). Ngoài khu chỉ còn signature: chunk công trình
 *   chia sẵn theo khu (drawRange = tiền tố signature), chunk cây/chi tiết/đèn theo (khu, ô) chỉ ẩn/hiện, bản xa và thiết bị mái dựng bản sao
 *   theo khu ở lần chọn đầu, xe qua traffic.api.setRegion, tàu/nhãn do app lọc. Kết hợp được với mọi mức mật độ.
 * Hiệu ứng hậu kỳ/bóng vẫn do hồ sơ quality (city-visual-runtime-30.js) quản lý.
 * Không có ngẫu nhiên: mọi thứ hạng là hàm xác định của dữ liệu (băm theo SEED).
 */

export const CITY_DENSITY_31_VERSION='density-31h';
const SEED=31;
const STORAGE_KEY='citylab.31e.density';
const SUGGEST_AFTER_S=8;       // FPS dưới ngưỡng liên tục bấy lâu thì đề xuất hạ mức
const SUGGEST_SNOOZE_S=120;    // bỏ qua đề xuất thì không hỏi lại trong khoảng này

// Tỉ lệ giữ lại phần KHÔNG signature của từng nhóm (signature/vùng bảo vệ luôn giữ 100 %).
export const DENSITY_LEVELS_31=Object.freeze([
  Object.freeze({id:'full',label:'Đầy đủ',buildings:1,trees:1,details:1,fixtures:1,lamps:1,vehicles:1,vessels:1,bridgeRails:true,minorShadows:true,structureShadows:true,ambientOcclusion:true,bloom:true,mergedBuildings:false,simpleVessels:false,lodScale:1,aoScale:1}),
  Object.freeze({id:'balanced',label:'Cân bằng',buildings:.55,trees:.6,details:.6,fixtures:.5,lamps:.65,vehicles:.6,vessels:.7,bridgeRails:true,minorShadows:false,structureShadows:true,ambientOcclusion:true,bloom:true,mergedBuildings:false,simpleVessels:false,lodScale:.8,aoScale:.6}),
  Object.freeze({id:'light',label:'Nhẹ',buildings:.32,trees:.38,details:.3,fixtures:.25,lamps:.4,vehicles:.35,vessels:.45,bridgeRails:false,minorShadows:false,structureShadows:true,ambientOcclusion:true,bloom:true,mergedBuildings:false,simpleVessels:false,lodScale:.6,aoScale:.5}),
  Object.freeze({id:'minimal',label:'Tối thiểu',buildings:.16,trees:.2,details:0,fixtures:0,lamps:.15,vehicles:.15,vessels:.25,bridgeRails:false,minorShadows:false,structureShadows:false,ambientOcclusion:false,bloom:false,mergedBuildings:true,simpleVessels:true,lodScale:0,aoScale:.2})
]);
// Bước G: minorShadows = nhóm phụ (cây, chi tiết 28, thiết bị mái, đèn, xe, tàu) có đổ bóng; ambientOcclusion = GTAO
// (pass pháp tuyến + quad AO); bloom = bloom emissive; mergedBuildings = công trình vẽ bằng một mesh gộp thay các chunk
// (cùng cờ này bật các bản gộp tĩnh của kết cấu hero/signature và cây xa gộp); simpleVessels = tàu chỉ vẽ thân + một vệt nước;
// lodScale = hệ số nhân bán kính LOD cây/chi tiết (0 = chỉ bản xa + mục bảo vệ); aoScale = hệ số nhân độ phân giải GTAO.
// structureShadows = cầu (Ba Son, Bạch Đằng, cầu thủ tục) và Marina đổ bóng; chỉ mức Tối thiểu tắt (hình học vẫn vẽ đủ 100 %).
// Bước G3: Cân bằng và Nhẹ cũng tắt bóng nhóm phụ (cây, chi tiết 28, đèn, xe, tàu) — pass bóng ×3 tầng CSM là phần
// draw call lớn nhất của Đầy đủ; bóng công trình, cầu, hero và địa hình giữ nguyên.
// Tất cả chỉ đổi cờ/camera/visible/updateBefore nên không biên dịch lại pipeline; công trình signature vẫn giữ đủ.
const MERGED_BUILDING_FRACTION=DENSITY_LEVELS_31.find(level=>level.mergedBuildings)?.buildings??null;
const levelById=new Map(DENSITY_LEVELS_31.map((level,index)=>[level.id,{...level,index}]));

// Mức tắt GTAO vẫn chạy quad (giữ pass pháp tuyến kích hoạt bóng CSM) nhưng ở độ phân giải thấp nhất.
const AO_OFF_SCALE=.1;
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

// Chia công trình thành chunk; arrays là mảng đỉnh theo thứ tự công trình, faceEnds[i] = tam giác cuối (lũy kế).
// - không có regionOf: chunk lưới cellSize (như 31E).
// - có regionOf (bước H, "Khu mô phỏng"): mỗi khu chia k-d thành tối đa 2^kdLevels chunk cân số công trình (tổng số chunk gần bằng
//   lưới cũ ⇒ không thêm draw call), mỗi chunk thuộc đúng một khu ⇒ ẩn/hiện cả khu chỉ là visible/drawRange.
//   setRegion(id): chunk ngoài khu chỉ giữ tiền tố signature (hạng -1) — bất biến F; chunk trong khu theo mức mật độ.
export function createBuildingChunks31({arrays,itemSizes,faceEnds,buildings,material,roads,gate,cellSize=2500,name='Công trình 31E',mergeFraction=MERGED_BUILDING_FRACTION,regionOf=null,kdLevels=2}){
  const started=performance.now(),n=buildings.length,faceStart=i=>i?faceEnds[i-1]:0;
  const scores=scoreBuildings31({buildings,roads,isSignature:id=>gate.isSignatureBuilding(id)});
  const drawable=[];for(let i=0;i<n;i++)if(faceEnds[i]>faceStart(i))drawable.push(i);
  // Hạng toàn cục ∈ [0,1): 0 = giữ lâu nhất; signature = -1 (luôn trong drawRange).
  const rank=new Float32Array(n).fill(2);
  const ordinary=drawable.filter(i=>!gate.isSignatureBuilding(buildings[i].id)).sort((a,b)=>scores[b]-scores[a]||a-b);
  ordinary.forEach((i,k)=>{rank[i]=k/ordinary.length;});
  for(const i of drawable)if(gate.isSignatureBuilding(buildings[i].id))rank[i]=-1;
  const cells=new Map(),cellRegion=new Map();
  if(regionOf){
    const byRegion=new Map();
    for(const i of drawable){const r=regionOf(buildings[i].center[0],buildings[i].center[1]);if(!byRegion.has(r))byRegion.set(r,[]);byRegion.get(r).push(i);}
    // k-d: cắt đôi theo trục dài hơn tại trung vị (hòa → chỉ số công trình) ⇒ xác định, chunk cân số công trình.
    const kd=(list,level,path)=>{
      if(level===0||list.length<2)return [[path,list]];
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const i of list){const [x,z]=buildings[i].center;if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
      const axis=(maxX-minX)>=(maxZ-minZ)?0:1,sorted=list.slice().sort((a,b)=>buildings[a].center[axis]-buildings[b].center[axis]||a-b),mid=sorted.length>>1;
      return [...kd(sorted.slice(0,mid),level-1,path+'a'),...kd(sorted.slice(mid),level-1,path+'b')];
    };
    for(const [r,list] of byRegion)for(const [path,part] of kd(list,kdLevels,'')){const key=`${r}:${path}`;cells.set(key,part);cellRegion.set(key,r);}
  }else{
    for(const i of drawable){const key=cellKey(buildings[i].center[0],buildings[i].center[1],cellSize);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
  }
  const group=new THREE.Group();group.name=regionOf?`${name} · chunk khu (k-d ${kdLevels} mức)`:`${name} · chunk lưới ${cellSize} m`;
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
    mesh.userData.densityChunk={cell:key,region:cellRegion.get(key)??null,buildings:Int32Array.from(list),vertexEnds,ranks,signatureCount:signatureCount<0?list.length:signatureCount};
    group.add(mesh);meshes.push(mesh);
  }
  const prefixOf=(chunk,f)=>f>=1?chunk.buildings.length:chunk.signatureCount+countBelow(chunk.ranks,f,chunk.signatureCount);
  // Mesh gộp (bước G): đúng tập công trình của từng chunk ở tỉ lệ mergeFraction, nối thành một mesh cùng vật liệu →
  // cùng pipeline, đổi qua lại chỉ là visible. Chỉ dùng khi tỉ lệ yêu cầu đúng bằng mergeFraction (mức Tối thiểu).
  // Bước H: bản gộp toàn thành phố dựng sẵn như trước; bản gộp riêng từng khu (gồm cả signature ngoài khu, vẫn 1 mesh) dựng lười ở lần
  // chọn khu đầu tiên ở mức Tối thiểu.
  const mergeParts=(filter,kOf)=>meshes.filter(mesh=>filter(mesh.userData.densityChunk)).map(mesh=>{const chunk=mesh.userData.densityChunk,k=kOf(chunk);return {mesh,chunk,k,count:k?chunk.vertexEnds[k-1]:0};});
  const buildMerged=(filter,label,kOf=chunk=>prefixOf(chunk,mergeFraction),cell=`merged ${label}`)=>{
    const parts=mergeParts(filter,kOf),vertices=parts.reduce((sum,part)=>sum+part.count,0),geometry=new THREE.BufferGeometry();
    if(!vertices)return null;
    for(const [attribute,source] of Object.entries(meshes[0].geometry.attributes)){
      const size=source.itemSize,target=new Float32Array(vertices*size);let offset=0;
      for(const part of parts){if(!part.count)continue;target.set(part.mesh.geometry.attributes[attribute].array.subarray(0,part.count*size),offset);offset+=part.count*size;}
      geometry.setAttribute(attribute,new THREE.Float32BufferAttribute(target,size));
    }
    geometry.computeBoundingSphere();geometry.computeBoundingBox();
    const ids=[],ends=[];let base=0;
    for(const part of parts){for(let k=0;k<part.k;k++){ids.push(part.chunk.buildings[k]);ends.push(base+part.chunk.vertexEnds[k]);}base+=part.count;}
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`${name} · gộp ${label}`;mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;mesh.visible=false;
    mesh.userData.densityChunk={cell,region:null,buildings:Int32Array.from(ids),vertexEnds:Int32Array.from(ends),ranks:new Float32Array(ids.length),signatureCount:ids.length};
    group.add(mesh);return mesh;
  };
  // Bước H · T3: bản gộp theo khu (mergedByRegion) và bản gộp signature ngoài khu (sigOutside) là geometry riêng
  // (~12 float/đỉnh, mỗi khu một bản) — giữ tối đa 2 bản (khu hiện tại + khu trước, LRU) để đi qua cả 4 khu ở mức Tối
  // thiểu không tăng bộ nhớ theo số khu. Bản bị loại thì gỡ khỏi group + geometry.dispose(); quay lại khu thì dựng lại
  // (cùng vật liệu/tố chất thuộc tính nên pipeline đã có sẵn, không biên dịch lại — QA region đo maxFrameMs ≤ 300 ms).
  const REGION_MERGE_CACHE=2;
  const regionCachePut=(map,key,build)=>{
    if(map.has(key)){const mesh=map.get(key);map.delete(key);map.set(key,mesh);return mesh;}
    const mesh=build();
    map.set(key,mesh);
    while(map.size>REGION_MERGE_CACHE){
      const oldest=map.keys().next().value,old=map.get(oldest);
      map.delete(oldest);
      if(old){old.removeFromParent();old.geometry.dispose();}
    }
    return mesh;
  };
  let merged=null;const mergedByRegion=new Map(),sigOutside=new Map();
  if(mergeFraction!==null&&mergeFraction<1&&meshes.length>1)merged=buildMerged(()=>true,`mức ${mergeFraction}`,undefined,'merged');
  let shown=drawable.length,fraction=1,regionId=null,merging=false;
  const refresh=()=>{
    shown=0;let triangles=0;const byRegion={};
    merging=!!merged&&Math.abs(fraction-mergeFraction)<1e-9;
    if(merging&&regionId)regionCachePut(mergedByRegion,regionId,()=>buildMerged(()=>true,`mức ${mergeFraction} · ${regionId}`,chunk=>chunk.region===regionId?prefixOf(chunk,mergeFraction):chunk.signatureCount));
    // Signature ngoài khu (luôn hiện, bất biến F): một mesh gộp duy nhất cho mọi chunk ngoài khu thay vì mỗi chunk một draw call.
    if(regionId)regionCachePut(sigOutside,regionId,()=>buildMerged(chunk=>chunk.region!==regionId,`signature ngoài khu ${regionId}`,chunk=>chunk.signatureCount));
    for(const mesh of meshes){
      const chunk=mesh.userData.densityChunk,inRegion=!regionId||chunk.region===regionId;
      // Ngoài khu chỉ giữ tiền tố signature (f = -1 < mọi hạng thường); trong khu theo mức mật độ (hoặc bản gộp khi Tối thiểu).
      const k=prefixOf(chunk,inRegion?fraction:-1),count=k?chunk.vertexEnds[k-1]:0,covered=merging&&inRegion;
      // Chunk ngoài khu không tự vẽ: phần signature của chúng nằm trong mesh gộp sigOutside (vẽ 1 draw call).
      mesh.geometry.setDrawRange(0,inRegion?count:0);mesh.visible=inRegion&&count>0&&!covered;shown+=k;triangles+=count/3;
      if(chunk.region)byRegion[chunk.region]=(byRegion[chunk.region]||0)+k;
    }
    if(merged)merged.visible=merging&&!regionId;
    for(const [id,mesh] of mergedByRegion)if(mesh)mesh.visible=merging&&id===regionId;
    for(const [id,mesh] of sigOutside)if(mesh)mesh.visible=id===regionId&&!merging;   // khi gộp, bản gộp của khu đã gồm signature ngoài khu
    return {buildings:shown,triangles,merged:merging,byRegion};
  };
  const setFraction=f=>{fraction=f;return refresh();};
  const setRegion=id=>{regionId=id||null;return refresh();};
  const pickable=()=>{
    const list=[];
    if(merging){if(merged?.visible)list.push(merged);for(const mesh of mergedByRegion.values())if(mesh?.visible)list.push(mesh);}
    for(const mesh of sigOutside.values())if(mesh?.visible)list.push(mesh);
    for(const mesh of meshes)if(mesh.visible)list.push(mesh);
    return list;
  };
  // Chọn công trình: raycast tôn trọng drawRange; tam giác → công trình bằng tìm nhị phân trên vertexEnds.
  const pick=raycaster=>{
    const hit=raycaster.intersectObjects(pickable(),false)[0];if(!hit)return null;
    const chunk=hit.object.userData.densityChunk,vertex=hit.faceIndex*3;let lo=0,hi=chunk.vertexEnds.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(chunk.vertexEnds[mid]>vertex)hi=mid;else lo=mid+1;}
    return chunk.buildings[lo];
  };
  const shownIds=()=>{const ids=[];for(const mesh of pickable()){const chunk=mesh.userData.densityChunk,count=mesh.visible?mesh.geometry.drawRange.count:0;for(let k=0;k<chunk.buildings.length&&chunk.vertexEnds[k]<=count;k++)ids.push(Number(buildings[chunk.buildings[k]].id));}return ids;};
  // Số công trình của từng khu (theo tâm footprint): QA đối chiếu "bốn khu phủ đúng một lần".
  const regionTotals=()=>{const totals={};for(const mesh of meshes){const chunk=mesh.userData.densityChunk;if(chunk.region)totals[chunk.region]=(totals[chunk.region]||0)+chunk.buildings.length;}return totals;};
  const stats={chunks:meshes.length,cellSizeM:regionOf?null:cellSize,regionChunks:!!regionOf,drawable:drawable.length,signature:drawable.length-ordinary.length,triangles:faceEnds[n-1]||0,
    merged:merged?{fraction:mergeFraction,buildings:merged.userData.densityChunk.buildings.length,triangles:merged.geometry.attributes.position.count/3}:null,buildMs:Math.round(performance.now()-started)};
  return {group,meshes,get merged(){return merged;},mergedByRegion,setFraction,setRegion,pick,shownIds,regionTotals,stats,total:drawable.length,shown:()=>shown};
}

/// Thưa đều instance (cây, chi tiết runtime 28, thiết bị mái). Hạng phân tầng theo ô 300 m: trong ô có m mục (thứ tự
// Morton), hạng = (π + φ)/m với π là thứ bậc van der Corput của vị trí Morton và φ là pha băm của ô ⇒ ở tỉ lệ f mỗi ô
// giữ đúng ⌈f·m − φ⌉ mục, trải đều trong ô. Mục được bảo vệ (registry) luôn đứng đầu. Mỗi mức chỉ đổi .count.
// - nguồn inPlace (hoặc cellSize null): sắp lại ngay trong mesh nguồn theo thứ tự toàn cục (không thêm draw call) —
//   cho nhóm nhẹ (thiết bị mái). Tiền tố toàn cục độ dài `shown` trùng đúng tập các tiền tố theo ô.
// - còn lại: chia InstancedMesh con theo lưới cellSize (frustum/bóng cull theo ô) — cho nhóm nặng ở tầm gần (cây, chi
//   tiết 28). Mesh nguồn giữ nguyên trong scene (runtime cũ vẫn bật/tắt .visible) nhưng tắt layer để không vẽ.
// Bước G3 — LOD theo khoảng cách tới camera, tính theo ô (không đổi số mục hiển thị, chỉ đổi cách vẽ):
// - lod.nearM + nguồn `far:true` (tán cây xa): ô gần hơn nearM vẽ bản đầy đủ (thân + 3 tán), ô xa vẽ bản xa (1 khối).
//   Bản xa là MỘT InstancedMesh toàn thành phố (1 draw call, như 30B); mục thuộc ô gần được thu về một điểm (ma trận suy
//   biến, không tạo tam giác) nên không vẽ trùng. Mục bảo vệ (hero corridor, Nguyễn Huệ) giữ bản đầy đủ tới protectM;
//   xa hơn dùng bản xa như 30B (cameraDistance > 2500).
// - lod.nearM không có nguồn `far`: phần không bảo vệ của ô xa hơn nearM không được vẽ (chi tiết nhỏ hơn ~1 px); mục
//   bảo vệ luôn vẽ.
// - setNearScale(s): nhân bán kính nearM (mức Tối thiểu dùng 0 ⇒ chỉ còn bản xa + mục bảo vệ).
export function createInstanceDensity31({sources,items,isProtected=()=>false,stratumM=300,cellSize=null,label='Instance 31E',lod=null,regionOf=null,enabled=true}){
  const n=items.length,prot=new Uint8Array(n),rank=new Float64Array(n),strata=new Map(),reg=new Array(n).fill('');
  for(let k=0;k<n;k++){
    prot[k]=isProtected(items[k].x,items[k].z,k)?1:0;
    if(regionOf)reg[k]=regionOf(items[k].x,items[k].z);
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
  // Mục bảo vệ gom vào MỘT nhóm cố định riêng (luôn đủ 100 %, không theo ô ⇒ mức Tối thiểu chỉ tốn 1 draw call/nhóm thay
  // vì mỗi ô có mục bảo vệ một draw call); phần còn lại chia ô theo lưới.
  const groups=new Map();
  // Bước H: có regionOf thì nhóm (ô) không bao giờ vắt ngang hai khu; mục bảo vệ vẫn một nhóm cố định chung mọi khu.
  const groupKey=k=>prot[k]?'@protected':(regionOf?`${reg[k]}|`:'')+(cellSize?cellKey(items[k].x,items[k].z,cellSize):'all');
  for(const k of order){const key=groupKey(k);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(k);}
  const cells=[...groups].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([key,list])=>{
    const fixed=key==='@protected',protectedCount=fixed?list.length:0;
    return {key,list,fixed,protectedCount,region:fixed||!regionOf?null:reg[list[0]],off:false,ranks:fixed?new Float64Array(0):Float64Array.from(list,k=>rank[k]),meshes:[],farSlots:null,farHidden:null,gFar:null,gFarHidden:undefined,k:list.length,near:undefined,box:null};
  });
  const padM=lod?.padM??40,protectM=lod?.protectM??2500,nearM=lod?.nearM??Infinity;
  // Hộp bao 3D của ô (từ ma trận instance của nguồn đầu tiên) để đo khoảng cách camera → ô.
  if(lod&&cellSize){
    const first=sources.find(source=>!source.far&&source.mesh.isInstancedMesh)||sources[0],stride0=first.stride||1,matrix=first.mesh.instanceMatrix.array;
    for(const cell of cells){
      const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
      for(const k of cell.list){const o=k*stride0*16;box[0]=Math.min(box[0],matrix[o+12]);box[1]=Math.min(box[1],matrix[o+13]);box[2]=Math.min(box[2],matrix[o+14]);box[3]=Math.max(box[3],matrix[o+12]);box[4]=Math.max(box[4],matrix[o+13]);box[5]=Math.max(box[5],matrix[o+14]);}
      cell.box=[box[0]-padM,box[1]-padM,box[2]-padM,box[3]+padM,box[4]+padM,box[5]+padM];
    }
  }
  const inPlace=[],inPlaceInfo=[],chunkSources=[],slotOf=new Int32Array(n);
  order.forEach((k,slot)=>{slotOf[k]=slot;});
  let farSource=null;
  for(const {mesh,stride=1,key:sourceKey,inPlace:own=!cellSize,far=false,chunkName=null} of sources){
    const source=sourceKey||mesh.name;
    const copy=(attribute,size,target,list)=>{const from=attribute.array;list.forEach((k,slot)=>target.set(from.subarray(k*stride*size,(k+1)*stride*size),slot*stride*size));};
    if(own||far){
      for(const [attribute,size] of [[mesh.instanceMatrix,16],[mesh.instanceColor,3]]){if(!attribute)continue;const target=attribute.array.slice();copy(attribute,size,target,order);attribute.array.set(target);attribute.needsUpdate=true;}
      mesh.userData.densityInstances={source,stride,protected:order.filter(k=>prot[k]).length,far};
      inPlace.push({mesh,stride});inPlaceInfo.push({mesh,stride,far,source});
      if(far){farSource={mesh,original:mesh.instanceMatrix.array.slice()};for(const cell of cells){cell.farSlots=Int32Array.from(cell.list,k=>slotOf[k]);cell.farHidden=false;}}
      continue;
    }
    const build=(list,name)=>{
      const count=list.length*stride,chunk=new THREE.InstancedMesh(mesh.geometry,mesh.material,count);
      copy(mesh.instanceMatrix,16,chunk.instanceMatrix.array,list);
      if(mesh.instanceColor){chunk.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3);copy(mesh.instanceColor,3,chunk.instanceColor.array,list);}
      chunk.instanceMatrix.setUsage(THREE.StaticDrawUsage);chunk.instanceMatrix.needsUpdate=true;
      chunk.castShadow=mesh.castShadow;chunk.receiveShadow=mesh.receiveShadow;chunk.renderOrder=mesh.renderOrder;
      chunk.name=name;chunk.computeBoundingSphere();chunk.visible=enabled;
      return chunk;
    };
    for(const cell of cells){
      const chunk=build(cell.list,`${chunkName||mesh.name||label} · ô ${cell.key}`);chunk.userData.densityInstances={source,stride,protected:cell.protectedCount};
      mesh.add(chunk);cell.meshes.push({chunk,stride});
    }
    mesh.userData.densityLayerMask=mesh.layers.mask;chunkSources.push(mesh);
    if(enabled)mesh.layers.disableAll();
  }
  const protectedTotal=cells.reduce((s,c)=>s+c.protectedCount,0);
  let nearScale=1,farDirty=false;
  const hasFar=!!farSource;
  // Ma trận suy biến của mục bản xa: giữ vị trí (hệ số tịnh tiến) nhưng thu phần xoay/tỉ lệ về 0.
  function setFarHidden(cell,slotFrom,slotTo,hidden){
    const array=farSource.mesh.instanceMatrix.array,original=farSource.original;
    for(let i=slotFrom;i<slotTo;i++){
      const o=cell.farSlots[i]*16;
      if(hidden){for(let j=0;j<16;j++)array[o+j]=(j>=12)?original[o+j]:0;}
      else for(let j=0;j<16;j++)array[o+j]=original[o+j];
    }
    farDirty=true;
  }
  // Đặt count của ô theo (k = số mục mức mật độ cho phép) và trạng thái LOD hiện tại.
  function applyCell(cell){
    const off=regionId!==null&&!cell.fixed&&cell.region!==regionId;cell.off=off;
    const k=cell.k,near=!lod||cell.near!==false;
    // Nhóm bảo vệ của nguồn không có bản xa luôn vẽ đủ; ô thường xa thì không vẽ bản đầy đủ.
    const drawNear=cell.fixed&&!hasFar?true:near;
    // Bản xa: mục của ô gần (hoặc nhóm bảo vệ còn gần) ẩn vì đã vẽ bằng bản đầy đủ. Ô ngoài khu không đụng tới (mesh bản xa của khu ẩn cả khối).
    if(hasFar&&!off){
      const hidden=!lod||near;
      if(splitActive()){if(cell.gFarHidden!==hidden){cell.gFarHidden=hidden;setGroupFarHidden(cell,hidden);}}
      else if(cell.farHidden!==hidden){cell.farHidden=hidden;setFarHidden(cell,0,cell.list.length,hidden);}
    }
    const nearK=drawNear&&!off?k:0;
    // count 0 ⇒ three r186 bỏ qua draw (không tính draw call) nhưng vẫn duyệt render object của chunk mỗi pass (cập nhật
    // uniform/binding, writeBuffer): 300+ chunk count 0 ở góc overview tốn ~9 ms CPU mỗi khung (đo bằng ablation). Vì vậy
    // chunk không có gì để vẽ thì ẩn hẳn (visible = false). Hiện lại không biên dịch gì: render object và pipeline của
    // chunk cùng vật liệu/hình đã có sẵn, và đã được dựng trong lần vẽ đầu tiên.
    // Chunk trong bán kính Đầy đủ của camera giữ visible dù count 0 (đã có render object/pipeline/bóng sẵn, về Đầy đủ không
    // biên dịch lúc đó); chỉ chunk ngoài bán kính ấy mới ẩn hẳn — chúng chỉ hiện dần khi camera đi tới.
    // Bước H: chunk ngoài khu ẩn hẳn (trừ nhóm bảo vệ); chunk không thuộc nguồn đang bật (enabled=false) cũng ẩn.
    const keep=!off&&(cell.fixed||cell.inFull!==false);
    for(const {chunk,stride} of cell.meshes){const count=nearK*stride;chunk.count=count;chunk.visible=enabled&&!off&&(count>0||keep);chunk.userData.densityCount=(off?0:k)*stride;}
  }
  // Tổng mục cho phép: theo khu đang chọn (mục bảo vệ luôn tính) và tổng toàn bộ (nguồn in-place chỉ dùng khi không chọn khu).
  const recount=()=>{shown=0;plainShown=0;for(const cell of cells){plainShown+=cell.k;if(!cell.off)shown+=cell.k;}};
  const setFraction=f=>{
    for(const cell of cells){
      cell.k=cell.fixed||f>=1?cell.list.length:countBelow(cell.ranks,f);
      applyCell(cell);
    }
    recount();
    for(const {mesh,stride} of inPlace){mesh.count=plainShown*stride;mesh.userData.densityCount=plainShown*stride;}
    applySplit();flushFar();
    return shown;
  };
  function flushFar(){
    if(farDirty){farSource.mesh.instanceMatrix.needsUpdate=true;farDirty=false;}
    for(const group of dirtyGroups)group.mesh.instanceMatrix.needsUpdate=true;
    dirtyGroups.clear();
  }
  const boxDistance=(box,x,y,z)=>Math.hypot(Math.max(box[0]-x,0,x-box[3]),Math.max(box[1]-y,0,y-box[4]),Math.max(box[2]-z,0,z-box[5]));
  // Cập nhật LOD theo vị trí camera (mỗi khung; chỉ đụng ô đổi trạng thái). Trễ ±6 % tránh nhấp nháy ở biên.
  let lodChanges=0;
  const setLodCamera=position=>{
    if(!lod||!cells[0]?.box)return 0;
    let changed=0;
    for(const cell of cells){
      if(cell.fixed&&!hasFar)continue;
      if(cell.off)continue;   // ô ngoài khu không vẽ gì: bỏ qua, tính lại khi khu được chọn
      const d=boxDistance(cell.box,position.x,position.y,position.z);
      const radius=cell.fixed?protectM:nearM*nearScale,near=cell.near===undefined?d<radius:cell.near?d<radius*1.06:d<radius*.94;
      const full=cell.inFull===undefined?d<nearM:cell.inFull?d<nearM*1.06:d<nearM*.94;
      if(near!==cell.near||full!==cell.inFull){cell.near=near;cell.inFull=full;applyCell(cell);changed++;}
    }
    flushFar();lodChanges+=changed;return changed;
  };
  const setNearScale=scale=>{
    nearScale=scale;
    for(const cell of cells)cell.near=undefined;   // đánh giá lại từ đầu ở lần setLodCamera kế tiếp (không trễ)
  };

  // --- Bước H: khu mô phỏng. Nguồn in-place (bản xa, thiết bị mái) chỉ sắp theo hạng toàn cục nên không thể tách theo khu bằng
  // một tiền tố; ở lần chọn khu đầu tiên dựng bản sao theo khu (một InstancedMesh mỗi khu + một nhóm bảo vệ), chỉ dùng khi
  // đang chọn khu — khi "Toàn bộ" vẫn vẽ mesh nguồn như cũ (không thêm draw call). Nguồn chia ô đã tách khu sẵn từ lúc dựng.
  let regionId=null,split=null,plainShown=n,shown=n;
  const dirtyGroups=new Set(),extraMeshes=[];
  const splitActive=()=>regionId!==null&&!!split;
  function ensureSplit(){
    if(split||!regionOf||!inPlaceInfo.length)return;
    split={groups:new Map()};
    const lists=new Map();
    for(const k of order){const key=prot[k]?'@protected':reg[k];if(!lists.has(key))lists.set(key,[]);lists.get(key).push(k);}
    const posOf=new Int32Array(n);
    for(const [key,list] of lists){list.forEach((k,i)=>{posOf[k]=i;});split.groups.set(key,{key,list,entries:[]});}
    for(const {mesh,stride,far,source} of inPlaceInfo){
      const fromMatrix=far?farSource.original:mesh.instanceMatrix.array,fromColor=mesh.instanceColor?.array;
      for(const group of split.groups.values()){
        const gm=new THREE.InstancedMesh(mesh.geometry,mesh.material,Math.max(1,group.list.length*stride));
        group.list.forEach((k,i)=>{
          gm.instanceMatrix.array.set(fromMatrix.subarray(slotOf[k]*stride*16,(slotOf[k]+1)*stride*16),i*stride*16);
          if(fromColor){if(!gm.instanceColor)gm.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(gm.count*3),3);gm.instanceColor.array.set(fromColor.subarray(slotOf[k]*stride*3,(slotOf[k]+1)*stride*3),i*stride*3);}
        });
        gm.instanceMatrix.needsUpdate=true;if(gm.instanceColor)gm.instanceColor.needsUpdate=true;
        gm.castShadow=mesh.castShadow;gm.receiveShadow=mesh.receiveShadow;gm.renderOrder=mesh.renderOrder;gm.frustumCulled=mesh.frustumCulled;
        gm.name=`${mesh.name||label} · khu ${group.key}`;gm.computeBoundingSphere();gm.visible=false;
        gm.userData.densityInstances={source,stride,protected:group.key==='@protected'?group.list.length:0,far,region:group.key,split:true};
        mesh.add(gm);extraMeshes.push(gm);
        group.entries.push({mesh:gm,stride,far,original:far?gm.instanceMatrix.array.slice():null});
      }
    }
    for(const cell of cells){const group=split.groups.get(cell.fixed?'@protected':cell.region);if(group&&hasFar)cell.gFar={group,slots:Int32Array.from(cell.list,k=>posOf[k])};}
  }
  function setGroupFarHidden(cell,hidden){
    if(!cell.gFar)return;
    for(const entry of cell.gFar.group.entries){
      if(!entry.far)continue;
      const array=entry.mesh.instanceMatrix.array,original=entry.original;
      for(const slot of cell.gFar.slots){const o=slot*16;if(hidden){for(let j=0;j<16;j++)array[o+j]=(j>=12)?original[o+j]:0;}else for(let j=0;j<16;j++)array[o+j]=original[o+j];}
      dirtyGroups.add(entry);
    }
  }
  // Đặt count/visible mesh theo khu cho các bản sao (nguồn in-place); khi không chọn khu thì ẩn bản sao, mesh nguồn hiện lại.
  function applySplit(){
    for(const {mesh} of inPlace){if(mesh.userData.densityLayerMask===undefined)mesh.userData.densityLayerMask=mesh.layers.mask;mesh.layers.mask=enabled&&regionId!==null&&split?0:mesh.userData.densityLayerMask;}
    if(!split)return;
    for(const group of split.groups.values()){
      let count=group.list.length;
      if(group.key!=='@protected'){count=0;for(const cell of cells)if(!cell.fixed&&cell.region===group.key)count+=cell.k;}
      const on=enabled&&regionId!==null&&(group.key==='@protected'||group.key===regionId);
      for(const entry of group.entries){entry.mesh.count=count*entry.stride;entry.mesh.visible=on&&count>0;entry.mesh.userData.densityCount=count*entry.stride;}
    }
  }
  const setRegion=id=>{
    regionId=regionOf&&id?id:null;
    if(regionId!==null)ensureSplit();
    for(const cell of cells){cell.farHidden=undefined;cell.gFarHidden=undefined;applyCell(cell);}
    recount();
    for(const {mesh,stride} of inPlace){mesh.count=plainShown*stride;mesh.userData.densityCount=plainShown*stride;}
    applySplit();flushFar();
    return shown;
  };
  // Nguồn tạo lười (đèn đường): chỉ bật khi đang chọn khu; tắt thì trả layer cho mesh nguồn.
  const setEnabled=on=>{
    enabled=!!on;
    for(const mesh of chunkSources)mesh.layers.mask=enabled?0:mesh.userData.densityLayerMask;
    for(const cell of cells)applyCell(cell);
    applySplit();
  };
  const regionCounts=()=>{
    const out={};
    for(const cell of cells){const key=cell.fixed?'@protected':cell.region??'all';const e=out[key]||(out[key]={total:0,shown:0});e.total+=cell.list.length;e.shown+=cell.k;}
    return out;
  };
  const lodState=()=>({nearCells:cells.filter(cell=>cell.near!==false&&cell.meshes.length&&!cell.off).length,farCells:cells.filter(cell=>cell.near===false&&!cell.off).length,cells:cells.length,changes:lodChanges});
  const liveMeshes=[];
  const refreshMeshes=()=>{liveMeshes.length=0;liveMeshes.push(...cells.flatMap(cell=>cell.meshes.map(entry=>entry.chunk)),...inPlace.map(entry=>entry.mesh),...extraMeshes);return liveMeshes;};
  refreshMeshes();
  return {setFraction,setLodCamera,setNearScale,setRegion,setEnabled,prepareRegions:ensureSplit,lodState,regionCounts,get meshes(){return refreshMeshes();},total:n,protected:protectedTotal,chunks:cells.reduce((s,c)=>s+c.meshes.length,0),shown:()=>shown,isEnabled:()=>enabled};
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

// Bản gộp tĩnh bật/tắt cho mức Tối thiểu (bước G3): mọi Mesh/InstancedMesh con của `root` được nướng ma trận (cả từng
// instance) vào geometry gộp theo (vật liệu, bóng, renderOrder). Mesh gốc giữ nguyên trong scene (tên, userData, QA cũ
// vẫn tìm thấy) và chỉ bị ẩn khi bản gộp bật — hình, vật liệu và bóng giống hệt, chỉ bớt draw call. Không ẩn gì của
// signature: toàn bộ hình học vẫn được vẽ. Bản gộp là con của `root` nên thừa hưởng .visible của module (ví dụ hero
// corridor chỉ hiện ở góc corridor). Dựng lười ở lần bật đầu tiên.
// Khóa vật liệu để gộp: hai vật liệu NodeMaterial cùng loại, cùng tham số số học/màu/texture và không có node tùy biến
// (colorNode, roughnessNode…) cho ra điểm ảnh y hệt nhau ⇒ gộp được dù là hai đối tượng. Có node tùy biến thì khóa theo uuid.
const CUSTOM_NODES=['colorNode','roughnessNode','metalnessNode','emissiveNode','normalNode','opacityNode','positionNode','alphaTestNode','aoNode','envNode','lightsNode','fragmentNode','vertexNode','maskNode','castShadowNode','receivedShadowNode','outputNode','backdropNode','backdropAlphaNode','transmissionNode','thicknessNode','clearcoatNode','clearcoatRoughnessNode','sheenNode'];
function materialMergeKey(material){
  if(CUSTOM_NODES.some(key=>material[key]))return material.uuid;
  const textures=['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','envMap','lightMap','bumpMap','displacementMap'].map(key=>material[key]?.uuid||'').join(',');
  const number=value=>typeof value==='number'?+value.toFixed(5):value;
  return [material.type,material.color?.getHex(),number(material.roughness),number(material.metalness),material.emissive?.getHex(),number(material.emissiveIntensity),number(material.opacity),material.transparent,material.side,material.depthWrite,material.depthTest,material.blending,material.polygonOffset,material.polygonOffsetFactor,material.polygonOffsetUnits,material.alphaTest,material.flatShading,material.vertexColors,material.fog,number(material.envMapIntensity),number(material.clearcoat),number(material.transmission),textures].join('|');
}
export function createMinimalMerge31(rootsInput,{name='Gộp Tối thiểu',frame=null}={}){
  const roots=[].concat(rootsInput).filter(Boolean),root=frame||roots[0];
  let group=null,sources=[],active=false;
  function build(){
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),local=new THREE.Matrix4(),full=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),v=new THREE.Vector3();
    for(const base of roots)base.traverse(object=>{
      if(!object.isMesh||!object.visible||object.userData.minimalMerged||object.userData.noMinimalMerge||Array.isArray(object.material)||object.isSkinnedMesh||object.isInstancedMesh&&object.instanceColor)return;
      if(object.isInstancedMesh&&!object.count)return;
      // InstancedMesh bị tắt bóng bằng onBeforeShadow (count = 0) vẫn có castShadow=true ⇒ tính theo bóng thực sự đang vẽ.
      const suppressed=object.isInstancedMesh&&object.userData.densityCastShadow!==undefined&&object.onBeforeShadow!==object.userData.densityOnBeforeShadow,cast=object.castShadow&&!suppressed;
      const key=`${materialMergeKey(object.material)}|${cast}|${object.receiveShadow}|${object.renderOrder}`;
      if(!buckets.has(key))buckets.set(key,{material:object.material,cast,receive:object.receiveShadow,renderOrder:object.renderOrder,parts:[]});
      buckets.get(key).parts.push(object);
    });
    group=new THREE.Group();group.name=`${root.name||'nhóm'} · ${name}`;group.userData.minimalMerged=true;group.visible=false;
    for(const bucket of buckets.values()){
      const arrays={position:[],normal:[],uv:[],uv1:[]};let hasUv=false,hasUv1=false,vertices=0;
      for(const object of bucket.parts){
        const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry,attributes=geometry.attributes,count=attributes.position.count;
        let normals=attributes.normal;if(!normals){const clone=geometry.clone();clone.computeVertexNormals();normals=clone.attributes.normal;}
        const instances=object.isInstancedMesh?object.count:1;
        for(let i=0;i<instances;i++){
          if(object.isInstancedMesh)object.getMatrixAt(i,local);else local.identity();
          full.multiplyMatrices(inverse,object.matrixWorld).multiply(local);normalMatrix.getNormalMatrix(full);
          for(let j=0;j<count;j++){
            v.fromBufferAttribute(attributes.position,j).applyMatrix4(full);arrays.position.push(v.x,v.y,v.z);
            v.fromBufferAttribute(normals,j).applyMatrix3(normalMatrix).normalize();arrays.normal.push(v.x,v.y,v.z);
            if(attributes.uv){arrays.uv.push(attributes.uv.getX(j),attributes.uv.getY(j));hasUv=true;}else arrays.uv.push(0,0);
            if(attributes.uv1){arrays.uv1.push(attributes.uv1.getX(j),attributes.uv1.getY(j));hasUv1=true;}else if(attributes.uv)arrays.uv1.push(attributes.uv.getX(j),attributes.uv.getY(j));else arrays.uv1.push(0,0);
          }
          vertices+=count;
        }
        if(geometry!==object.geometry)geometry.dispose();
      }
      if(!vertices)continue;
      const merged=new THREE.BufferGeometry();
      merged.setAttribute('position',new THREE.Float32BufferAttribute(arrays.position,3));
      merged.setAttribute('normal',new THREE.Float32BufferAttribute(arrays.normal,3));
      if(hasUv)merged.setAttribute('uv',new THREE.Float32BufferAttribute(arrays.uv,2));
      if(hasUv1)merged.setAttribute('uv1',new THREE.Float32BufferAttribute(arrays.uv1,2));
      merged.computeBoundingSphere();merged.computeBoundingBox();
      const mesh=new THREE.Mesh(merged,bucket.material);
      mesh.name=`${group.name} · ${bucket.material.name||bucket.material.color?.getHexString?.()||group.children.length}`;
      mesh.castShadow=bucket.cast;mesh.receiveShadow=bucket.receive;mesh.renderOrder=bucket.renderOrder;mesh.userData.minimalMerged=true;
      group.add(mesh);sources.push(...bucket.parts);
    }
    root.add(group);
  }
  return {
    setActive(on){
      on=!!on;
      if(on&&!group)build();
      if(!group)return {active:false,meshes:0,sources:0};
      if(on!==active){
        active=on;group.visible=on;
        for(const object of sources){
          if(on){object.userData.minimalHidden=object.visible?1:0;object.visible=false;}
          else if(object.userData.minimalHidden!==undefined){object.visible=!!object.userData.minimalHidden;delete object.userData.minimalHidden;}
        }
      }
      return {active,meshes:group.children.length,sources:sources.length};
    },
    stats:()=>({built:!!group,active,meshes:group?.children.length||0,sources:sources.length})
  };
}

const attachedToScene=object=>{for(let o=object;o;o=o.parent)if(o.isScene)return true;return false;};

// Bộ điều phối mật độ + UI. Mọi nhóm là tùy chọn; thiếu nhóm nào thì nhóm đó không giảm (ghi trong status).
export function createDensityController31({
  gate,buildingChunks,treeDensity,detailDensity=[],fixtureDensity=null,streetFurniture=null,traffic=null,vesselGroup=null,bridgeRails=[],
  minimalMerges=[],vesselDetail=[],structureRoots=[],regionOf=null,regionStatus={},onRegionChange=null,defaultLevel='full',
  audit:auditInputs,ui={},params=new URLSearchParams(location.search),status={},getFps=()=>60,lowFps=31,storage=globalThis.localStorage
}){
  const registry=gate.registry;
  const disabled=new Set();
  const vesselMeshes=[];vesselGroup?.traverse(o=>{if(o.isInstancedMesh){o.userData.densityCapacity=o.count;vesselMeshes.push(o);}});
  const trafficFallback=[];traffic?.group?.traverse(o=>{if(o.isInstancedMesh){o.userData.densityCapacity=o.count;trafficFallback.push(o);}});
  const vehicleTotal=()=>traffic?.api?.()?.total??trafficFallback[0]?.userData.densityCapacity??0;
  const fmt=v=>Number(v||0).toLocaleString('vi-VN');

  // API xe đang dùng: luôn gọi qua api.setVisibleFraction (không giữ tham chiếu hàm); update() so sánh đối tượng API
  // mỗi khung — API xuất hiện sau, được thay hay bị gỡ thì đồng bộ lại mức hiện tại.
  let vehicleApi=null,regionId=null;   // regionId: null = Toàn bộ
  // Khu cho xe (hợp đồng city-traffic-31: api.setRegion(null | {id, polygon:[[x,z],…]})). Gọi lại khi khu hoặc đối tượng API đổi;
  // API chưa có setRegion thì xe không bị lọc theo khu (ghi trong regionStatus.vehiclesVia).
  const trafficRegion={api:null,id:undefined,via:'chưa có API xe'};
  function syncTrafficRegion(api){
    if(typeof api?.setRegion!=='function'){Object.assign(trafficRegion,{api:api??null,id:undefined,via:api?'API xe chưa có setRegion (xe không lọc theo khu)':'chưa có API xe'});return false;}
    if(trafficRegion.api===api&&trafficRegion.id===regionId)return true;
    try{api.setRegion(regionId?regionTrafficPayload(regionId):null);Object.assign(trafficRegion,{api,id:regionId,via:'traffic.api.setRegion'});return true;}
    catch(error){console.warn('Khu mô phỏng: traffic.api.setRegion lỗi',error);Object.assign(trafficRegion,{api,id:undefined,via:'lỗi setRegion'});return false;}
  }
  function setVehicles(f){
    const api=traffic?.api?.();vehicleApi=api??null;
    syncTrafficRegion(api);
    if(typeof api?.setVisibleFraction==='function'){const shown=api.setVisibleFraction(f);return {shown:typeof shown==='number'?shown:Math.round(vehicleTotal()*f),via:'traffic.api.setVisibleFraction'};}
    if(typeof api?.setDensity==='function'){const shown=api.setDensity(f);return {shown:typeof shown==='number'?shown:Math.round(vehicleTotal()*f),via:'traffic.api.setDensity'};}
    // Dự phòng (chưa có API bước D): xe đã xếp theo điểm đoạn đường giảm dần → cắt đuôi giữ trục chính/trung tâm.
    let shown=0;for(const mesh of trafficFallback){mesh.count=Math.ceil(mesh.userData.densityCapacity*f);shown=mesh.count;}
    return {shown,via:'fallback mesh.count'};
  }
  const trafficApiChanged=()=>(traffic?.api?.()??null)!==vehicleApi;
  function syncVehicles(){
    if(status.vehiclesVia==='fallback mesh.count')for(const mesh of trafficFallback)mesh.count=mesh.userData.densityCapacity;   // trả mesh cũ về nguyên trạng
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

  // Bóng nhóm phụ: gom mesh mỗi lần áp (xe/tàu có thể dựng sau); chỉ đụng mesh vốn đổ bóng.
  // InstancedMesh KHÔNG tắt castShadow (bật lại sẽ dựng render object/pipeline bóng cho mọi mesh mới vào khung → khung
  // đứng hình > 1 s khi về Đầy đủ sau khi đổi góc nhìn): trong pass bóng đặt count = 0 rồi trả lại ngay sau đó ⇒ three
  // r186 vẫn dựng pipeline nhưng bỏ qua draw (getDrawParameters → null). Mesh thường thì tắt castShadow.
  const hideInShadow=function(){this.userData.densityShadowCount=this.count;this.count=0;};
  const restoreAfterShadow=function(){if(this.userData.densityShadowCount!==undefined){this.count=this.userData.densityShadowCount;this.userData.densityShadowCount=undefined;}};
  function minorShadowList(){
    const list=[...(treeDensity?.meshes||[]),...detailDensity.flatMap(set=>set.meshes||[]),...(fixtureDensity?.meshes||[]),...(lampSet?.meshes||[]),streetFurniture?.lampMesh,streetFurniture?.headMesh];
    for(const root of [traffic?.group,vesselGroup])root?.traverse(o=>{if(o.isMesh)list.push(o);});
    return list;
  }
  function structureShadowList(){const list=[];for(const root of structureRoots)root?.traverse(o=>{if(o.isMesh)list.push(o);});return list;}
  function setCastShadows(list,on){
    let toggled=0;
    for(const mesh of new Set(list.filter(Boolean))){
      const data=mesh.userData;
      if(data.densityCastShadow===undefined){
        data.densityCastShadow=mesh.castShadow;
        if(mesh.isInstancedMesh){data.densityOnBeforeShadow=mesh.onBeforeShadow;data.densityOnAfterShadow=mesh.onAfterShadow;}
      }
      if(!data.densityCastShadow)continue;
      if(mesh.isInstancedMesh){
        mesh.onBeforeShadow=on?data.densityOnBeforeShadow:hideInShadow;
        mesh.onAfterShadow=on?data.densityOnAfterShadow:restoreAfterShadow;
      }else mesh.castShadow=on;
      toggled++;
    }
    return toggled;
  }
  let pipeline=null;
  const applyPostEffects=()=>{
    const ambientOcclusion=current&&typeof pipeline?.setAmbientOcclusion==='function'?pipeline.setAmbientOcclusion(current.ambientOcclusion):false;
    const bloom=current&&typeof pipeline?.setBloom==='function'?pipeline.setBloom(current.bloom):false;
    if(current&&typeof pipeline?.setAmbientOcclusionScale==='function')pipeline.setAmbientOcclusionScale(current.ambientOcclusion?current.aoScale:AO_OFF_SCALE);
    if(status.render)Object.assign(status.render,{ambientOcclusionActive:ambientOcclusion,bloomActive:bloom});
    return {ambientOcclusion,bloom};
  };

  const lodSets=[treeDensity,...detailDensity,fixtureDensity].filter(Boolean);
  let lampSet=null,regionSource='default';
  let current=null,source='default',suggestion=null,lowFor=0,snoozeUntil=0,simulatedFps=null,clock=0;
  function apply(id,from){
    const level=levelById.get(id);if(!level)return false;
    const started=performance.now();
    const built=buildingChunks.setFraction(level.buildings);
    for(const set of lodSets)set.setNearScale?.(level.lodScale);
    const trees=treeDensity?treeDensity.setFraction(level.trees):0;
    const details=detailDensity.reduce((s,set)=>s+set.setFraction(level.details),0);
    const fixtures=fixtureDensity?fixtureDensity.setFraction(level.fixtures):0;
    const lampsAll=streetFurniture?streetFurniture.setVisibleFraction(level.lamps):0;
    const lamps=lampSet?.isEnabled()?lampSet.setFraction(level.lamps):lampsAll;
    const vehicles=setVehicles(level.vehicles);
    let vessels=0;for(const mesh of vesselMeshes){mesh.count=Math.max(1,Math.ceil(mesh.userData.densityCapacity*level.vessels));vessels=Math.max(vessels,mesh.count);}
    for(const rail of bridgeRails){rail.visible=level.bridgeRails;level.bridgeRails?disabled.delete(rail):disabled.add(rail);}
    for(const mesh of vesselDetail)mesh.visible=!level.simpleVessels;
    const minorShadowMeshes=setCastShadows(minorShadowList(),level.minorShadows)+setCastShadows(structureShadowList(),level.structureShadows);
    // Bản gộp tĩnh dựng sau khi cờ bóng đã đặt (khóa gộp có castShadow) và sau khi các mesh phụ (lan can) đã ẩn.
    const staticMerges=minimalMerges.map(merge=>merge.setActive(level.mergedBuildings));
    current=level;source=from;
    const audit=runAudit();
    const applyMs=+(performance.now()-started).toFixed(2);
    Object.assign(status,{
      version:CITY_DENSITY_31_VERSION,level:level.id,label:level.label,source,applyMs,
      fractions:{buildings:level.buildings,trees:level.trees,details:level.details,fixtures:level.fixtures,lamps:level.lamps,vehicles:level.vehicles,vessels:level.vessels,bridgeRails:level.bridgeRails},
      counts:{buildings:built.buildings,buildingTriangles:built.triangles,trees,details,fixtures,lamps,vehicles:vehicles.shown,vessels,buildingsByRegion:built.byRegion},
      totals:{buildings:buildingChunks.total,trees:treeDensity?.total||0,lamps:streetFurniture?.instances?.().length||0,vehicles:vehicleTotal(),vessels:vesselMeshes[0]?.userData.densityCapacity||0},
      vehiclesVia:vehicles.via,
      render:{minorShadows:level.minorShadows,structureShadows:level.structureShadows,minorShadowMeshes,staticMerges:staticMerges.map(stat=>stat.active?stat.meshes:0),ambientOcclusion:level.ambientOcclusion,ambientOcclusionActive:false,bloom:level.bloom,bloomActive:false,mergedBuildings:!!built.merged},
      audit:{complete:audit.complete,total:audit.total,visible:audit.visible,missing:audit.missing}
    });
    applyPostEffects();
    const body=document.body.dataset;
    body.densityLevel=level.id;body.densityAudit=audit.complete?'complete':'incomplete';
    body.densityBuildings=String(built.buildings);body.densityTrees=String(trees);body.densityLamps=String(lamps);body.densityVehicles=String(vehicles.shown);
    if(!audit.complete)console.warn('Mật độ 31E: registry signature chưa hiển thị đủ',audit.missing);
    renderUi();updateRegionStatus();
    return true;
  }

  // --- Bước H: "Khu mô phỏng". Mỗi tập tự lọc theo khu (chunk/drawRange/visible); đây chỉ điều phối + trạng thái + UI.
  // Đèn đường: mesh của city-street-furniture-31 là một cặp InstancedMesh toàn thành phố nên tạo lười ở lần chọn khu đầu tiên một
  // tập chunk (khu, ô 500 m) từ chính ma trận của nó; khi Toàn bộ thì dùng lại mesh gốc + setVisibleFraction như 31E.
  function ensureLampSet(){
    if(lampSet||!regionOf||!streetFurniture?.instances||!streetFurniture.lampMesh||!streetFurniture.headMesh)return lampSet;
    const lamps=streetFurniture.instances();
    lampSet=createInstanceDensity31({sources:[{mesh:streetFurniture.lampMesh,key:'lampPoles',chunkName:'Đèn khu 31H · cột'},{mesh:streetFurniture.headMesh,key:'lampHeads',chunkName:'Đèn khu 31H · đầu đèn'}],items:lamps,isProtected:(x,z,k)=>!!lamps[k].signature,cellSize:500,regionOf,enabled:false,label:'Đèn 31H'});
    return lampSet;
  }
  function setRegionMasks(rid){
    buildingChunks.setRegion?.(rid);
    if(rid){const set=ensureLampSet();if(set){set.setRegion(rid);set.setEnabled(true);}}
    else if(lampSet){lampSet.setRegion(null);lampSet.setEnabled(false);}
    for(const set of lodSets)set.setRegion?.(rid);
  }
  const regionButtons=ui.regionRoot?[...ui.regionRoot.querySelectorAll('[data-region]')]:[];
  function renderRegionUi(){
    const id=regionId??REGION_ALL_ID;
    for(const button of regionButtons){
      const on=button.dataset.region===id;
      button.classList.toggle('active',on);button.setAttribute('aria-checked',String(on));button.tabIndex=on?0:-1;
    }
    if(ui.regionCounts&&regionStatus.label){
      ui.regionCounts.textContent=regionId
        ?`${regionStatus.label} · ${fmt(regionStatus.buildingsInRegion)} nhà trong khu · ${fmt(regionStatus.trees)} cây · ${fmt(regionStatus.vehicles)} xe · signature ngoài khu vẫn hiện`
        :`Toàn bộ thành phố · ${fmt(regionStatus.buildings)} nhà · ${fmt(regionStatus.trees)} cây · ${fmt(regionStatus.vehicles)} xe`;
    }
  }
  function updateRegionStatus(){
    const def=regionId?regionById(regionId):null,counts=status.counts||{},byRegion=counts.buildingsByRegion||{},totals=buildingChunks.regionTotals?.()||{};
    Object.assign(regionStatus,{
      version:CITY_DENSITY_31_VERSION,id:regionId??REGION_ALL_ID,label:def?.label??'Toàn bộ',short:def?.short??'Toàn bộ',source:regionSource,
      buildings:counts.buildings??0,buildingsInRegion:regionId?(byRegion[regionId]??0):(counts.buildings??0),
      buildingsRegionTotal:regionId?(totals[regionId]??0):buildingChunks.total,buildingsByRegionTotal:totals,
      trees:counts.trees??0,details:counts.details??0,lamps:counts.lamps??0,vehicles:counts.vehicles??0,
      vehiclesVia:status.vehiclesVia,vehiclesRegionVia:trafficRegion.via,signatureAudit:status.audit?{complete:status.audit.complete,total:status.audit.total,visible:status.audit.visible}:null
    });
    document.body.dataset.region=regionStatus.id;
    renderRegionUi();
  }
  // Áp khu: đặt mặt nạ cho mọi tập rồi áp lại mức mật độ hiện tại (đếm lại, bóng nhóm phụ, xe qua api.setRegion, kiểm registry).
  function applyRegion(id,from){
    const next=id===REGION_ALL_ID||id===null?null:(regionById(id)?id:undefined);
    if(next===undefined)return false;
    const started=performance.now();
    regionId=next;regionSource=from;
    setRegionMasks(regionId);
    if(current)apply(current.id,source);
    regionStatus.applyMs=+(performance.now()-started).toFixed(2);
    return true;
  }
  function chooseRegion(id,from){
    if(!applyRegion(id,from))return false;
    try{storage?.setItem(REGION_STORAGE_KEY,regionId??REGION_ALL_ID);}catch{}
    // URL đang mang region thì cập nhật để reload không quay về giá trị cũ (URL ưu tiên hơn localStorage).
    const query=new URLSearchParams(location.search);
    if(query.has(REGION_URL_PARAM)){query.set(REGION_URL_PARAM,regionId??REGION_ALL_ID);history.replaceState(null,'',`?${query}`);}
    onRegionChange?.({id:regionId??REGION_ALL_ID,region:regionId?regionById(regionId):null,from});
    return true;
  }
  for(const button of regionButtons)button.addEventListener('click',()=>chooseRegion(button.dataset.region,'user'));
  ui.regionRoot?.addEventListener('keydown',event=>{
    const index=regionButtons.findIndex(b=>b.dataset.region===(regionId??REGION_ALL_ID));if(index<0)return;
    const next={ArrowRight:index+1,ArrowDown:index+1,ArrowLeft:index-1,ArrowUp:index-1,Home:0,End:regionButtons.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();
    const target=regionButtons[(next+regionButtons.length)%regionButtons.length];
    chooseRegion(target.dataset.region,'user');target.focus();
  });

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

  // Khu ban đầu: URL (&region=) > localStorage > Toàn bộ. Không gọi onRegionChange (app tự đặt camera sau khi dựng xong).
  {
    const fromUrl=normalizeRegionId(params.get(REGION_URL_PARAM));
    let fromStorage=null;try{fromStorage=normalizeRegionId(storage?.getItem(REGION_STORAGE_KEY));}catch{}
    const initial=fromUrl??fromStorage??REGION_ALL_ID;
    regionId=initial===REGION_ALL_ID?null:initial;regionSource=fromUrl?'url':fromStorage?'storage':'default';
    if(regionId)setRegionMasks(regionId);
  }
  const requested=params.get('density');
  let stored=null;try{stored=storage?.getItem(STORAGE_KEY);}catch{}
  if(levelById.has(requested))apply(requested,'url');
  else if(levelById.has(stored))apply(stored,'storage');
  else apply(levelById.has(defaultLevel)?defaultLevel:'full','default');

  const api={
    levels:DENSITY_LEVELS_31,
    setLevel:(id,from='api')=>{choose(id,from);return status.level===id;},
    // QA: giả lập FPS đọc được (null = dùng FPS thật của adaptive quality).
    simulateFps:value=>{simulatedFps=value===null?null:Number(value);lowFor=0;},
    audit:runAudit,
    // GTAO đã chạy thật (QA đo draw call/tam giác chỉ sau khi sẵn sàng; mức không dùng AO luôn trả true).
    aoReady:()=>!current?.ambientOcclusion||!pipeline||pipeline.ambientOcclusion!==true||pipeline.ambientOcclusionReady!==false,
    lod:()=>({trees:treeDensity?.lodState?.(),details:detailDensity.map(set=>set.lodState?.())}),
    // Pipeline hậu kỳ dựng sau bộ điều phối: gắn vào thì áp ngay cờ GTAO/bloom của mức hiện tại.
    attachPipeline:value=>{pipeline=value||null;return applyPostEffects();},
    // Bước H: khu mô phỏng ('all' hoặc id trong REGIONS_31). Trả true khi khu hiện tại đúng bằng giá trị yêu cầu.
    regions:REGIONS_31,
    setRegion:(id,from='api')=>{chooseRegion(id,from);return (regionId??REGION_ALL_ID)===id;},
    // Dựng sẵn (không bật) bản sao theo khu và tập đèn: lần chọn khu đầu tiên khỏi tốn thời gian dựng.
    prewarmRegions:()=>{if(!regionOf)return false;ensureLampSet();for(const set of lodSets)set.prepareRegions?.();return true;},
    // Đặt khu tạm (không lưu storage/URL, không đổi camera): dùng để biên dịch sẵn pipeline của từng khu lúc nạp trang.
    previewRegion:(id,from='warm')=>applyRegion(id,from),
    regionState:()=>({...regionStatus}),
    trafficRegion:()=>({...trafficRegion})
  };
  Object.defineProperty(status,'api',{value:api,enumerable:false,configurable:true});
  return {
    ...api,
    get level(){return current.id;},
    get region(){return regionId??REGION_ALL_ID;},
    update(dt,cameraPosition=null){
      clock+=dt;
      // LOD theo khoảng cách (cây gần/xa, chi tiết 28 ngoài tầm nhìn): chỉ đụng ô đổi trạng thái.
      if(cameraPosition){for(const set of lodSets)set.setLodCamera?.(cameraPosition);}
      // API xe của bước D có thể khởi tạo sau bộ điều phối hoặc được thay: đối tượng API đổi thì đồng bộ ngay mức hiện tại.
      if(trafficApiChanged())syncVehicles();
      const fps=simulatedFps??getFps();
      lowFor=fps<lowFps?lowFor+dt:0;
      if(!suggestion&&lowFor>=SUGGEST_AFTER_S&&clock>=snoozeUntil&&current.index<DENSITY_LEVELS_31.length-1)showSuggestion(levelById.get(DENSITY_LEVELS_31[current.index+1].id),fps);
    }
  };
}
