/*
 * Signature Registry 31A
 *
 * Cổng duy nhất cho mọi bộ lọc "Mật độ chi tiết": công trình, way, module và
 * vùng giữ cây/đèn trong data/signature-registry-31.js luôn hiển thị ở mọi mức.
 * Tra cứu O(1) bằng Set; vùng kiểm bbox trước rồi mới point-in-polygon.
 */

const ZONE_KINDS=new Set(['tree','lamp','any']);

function contains(x,z,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

function boundsOf(ring){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const [x,z] of ring){if(x<minX)minX=x;if(z<minZ)minZ=z;if(x>maxX)maxX=x;if(z>maxZ)maxZ=z;}
  return[minX,minZ,maxX,maxZ];
}
const inBounds=(b,x,z)=>x>=b[0]&&z>=b[1]&&x<=b[2]&&z<=b[3];

export function loadSignatureRegistry(data=globalThis.SIGNATURE_REGISTRY_31){
  if(data?.version!=='31A'||!Array.isArray(data.entries))throw new Error('SIGNATURE_REGISTRY_31 không hợp lệ hoặc chưa nạp');
  const buildings=new Set(),ways=new Set(),offScene=new Set(),modules=new Set(),zones=[];
  for(const entry of data.entries){
    const target=entry.kind==='building'?buildings:entry.kind==='bridge'||entry.kind==='road'?ways:null;
    if(target)for(const id of entry.ids)target.add(Number(id));
    for(const id of entry.offScene||[])offScene.add(Number(id));
    if(entry.kind==='module')modules.add(entry.key);
    if(entry.zone)zones.push({key:entry.key,protects:new Set(entry.zone.protects),bbox:entry.zone.bbox,polygons:entry.zone.polygons.map(ring=>({ring,bbox:boundsOf(ring)}))});
  }
  const registry=Object.freeze({
    version:data.version,
    entries:data.entries,
    isSignatureBuilding:id=>buildings.has(Number(id)),
    isSignatureWay:id=>ways.has(Number(id)),
    // kind='tree'|'lamp' chỉ xét vùng giữ loại đó; 'any' xét mọi vùng.
    inProtectedZone(x,z,kind='any'){
      if(!ZONE_KINDS.has(kind))throw new Error(`Loại vùng không hợp lệ: ${kind}`);
      for(const zone of zones){
        if(kind!=='any'&&!zone.protects.has(kind))continue;
        if(!inBounds(zone.bbox,x,z))continue;
        for(const polygon of zone.polygons)if(inBounds(polygon.bbox,x,z)&&contains(x,z,polygon.ring))return true;
      }
      return false;
    },
    signatureBuildingIds:()=>[...buildings],
    signatureWayIds:()=>[...ways],
    signatureModuleKeys:()=>[...modules],
    // Bước E gọi với danh sách id đang hiển thị ở một mức mật độ; complete=false nghĩa là vi phạm.
    // Way offScene (chưa có trong CITY_DATA.roads) không tính; modules chỉ kiểm khi được truyền vào.
    auditSignatureVisibility({buildings:shownBuildings=[],ways:shownWays=[],modules:shownModules}={}){
      const seenBuildings=new Set([...shownBuildings].map(Number)),seenWays=new Set([...shownWays].map(Number));
      const audited=[...ways].filter(id=>!offScene.has(id));
      const missing={
        buildings:[...buildings].filter(id=>!seenBuildings.has(id)),
        ways:audited.filter(id=>!seenWays.has(id)),
        modules:shownModules?[...modules].filter(key=>!new Set(shownModules).has(key)):[]
      };
      const total=buildings.size+audited.length+(shownModules?modules.size:0);
      const hidden=missing.buildings.length+missing.ways.length+missing.modules.length;
      return{complete:hidden===0,total,visible:total-hidden,missing};
    }
  });
  active=registry;
  return registry;
}

// Hàm tiện dụng dùng registry nạp gần nhất (tự nạp từ window ở lần gọi đầu).
let active=null;
const current=()=>active||loadSignatureRegistry();
export const isSignatureBuilding=id=>current().isSignatureBuilding(id);
export const isSignatureWay=id=>current().isSignatureWay(id);
export const inProtectedZone=(x,z,kind='any')=>current().inProtectedZone(x,z,kind);
export const signatureBuildingIds=()=>current().signatureBuildingIds();
export const signatureWayIds=()=>current().signatureWayIds();
export const auditSignatureVisibility=visible=>current().auditSignatureVisibility(visible);
