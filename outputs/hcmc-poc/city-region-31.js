/*
 * City Region 31 · bước H kế hoạch 31A — "Khu mô phỏng": xem 1 trong 4 khu của thành phố (hoặc toàn bộ) để giảm tải GPU.
 *
 * Hệ tọa độ: cảnh (x = đông, z = nam; gốc ở tâm CITY_DATA.meta.center), cùng hệ với CITY_DATA và ROAD_GRAPH_31.
 * Bốn khu là đa giác KHÔNG chồng, KHÔNG hở: các đa giác dùng chung đỉnh, phủ toàn phạm vi cảnh nên mọi điểm trong cảnh
 * (tâm footprint công trình, cây, đèn, tàu…) thuộc đúng một khu (regionOf là hàm xác định, không ngẫu nhiên); điểm
 * ngoài vành lấy khu có cạnh gần nhất.
 * Ranh bám địa vật thật thấy trong CITY_DATA (đo từ polygon nước, không phải ranh hành chính):
 *   - rạch Nhiêu Lộc – Thị Nghè (ranh phía bắc của lõi),
 *   - trục sông Sài Gòn (ranh bờ tây | bờ đông ở phía bắc; đoạn cong Ba Son lấy dải bờ tây gồm Ba Son · Marina Central ·
 *     Grand Marina vào khu ven sông; đoạn Bạch Đằng ranh chạy theo mép bờ đông nên mặt sông thuộc lõi; đoạn nam lấy
 *     tim sông ngăn bờ đông Thủ Thiêm với Khánh Hội),
 *   - rạch Bến Nghé (ranh phía nam của lõi, cách Quận 4 – Khánh Hội).
 *
 *   trung-tam  Lõi Quận 1 · Bến Nghé        bờ tây, nam rạch Thị Nghè, bắc rạch Bến Nghé (Nguyễn Huệ, Bạch Đằng, Lam Sơn, Bitexco, Đa Kao)
 *   ven-song   Ven sông · Ba Son · Thủ Thiêm toàn bộ bờ đông (Thủ Thiêm, Thảo Điền) + dải Ba Son · Marina bờ tây
 *   bac        Phía bắc · Thị Nghè · Bình Thạnh  bờ tây, bắc rạch Thị Nghè (Landmark 81, Thanh Đa)
 *   nam        Phía nam · Quận 4 · Khánh Hội     nam rạch Bến Nghé và nam sông quanh Thủ Thiêm
 *
 * Mỗi mặt phẳng ranh chỉ ảnh hưởng đối tượng KHÔNG signature: signature registry (signature-registry-31.js) luôn hiển thị
 * 100 % ở mọi khu (bất biến F), nên công trình/cây/đèn/module signature nằm ngoài khu vẫn được vẽ.
 */

export const CITY_REGION_31_VERSION='region-31h';
export const REGION_ALL_ID='all';
export const REGION_URL_PARAM='region';
export const REGION_STORAGE_KEY='citylab.31h.region';

// Đỉnh dùng chung (m, hệ cảnh). Vượt ra ngoài bbox dữ liệu (±3007 × ±3206) để mọi điểm của cảnh nằm trong một khu.
const V={
  // rạch Nhiêu Lộc – Thị Nghè, tây → đông, rồi cửa rạch ra sông
  A:[-3600,-2060],N1:[-3050,-1960],N2:[-2450,-1900],N3:[-1900,-1760],N4:[-1250,-1560],N5:[-770,-1480],N6:[-520,-1330],N7:[-380,-1130],M0:[-230,-975],N8:[60,-960],
  // tim sông Sài Gòn phía bắc (ranh bờ tây | bờ đông)
  B1:[700,-920],B2:[1180,-1000],B3:[1445,-1200],B4:[1600,-1500],B5:[1700,-1900],B6:[1710,-2300],B7:[1450,-2700],B8:[1250,-3100],B9:[1150,-3700],
  TL:[-3600,-3700],TR:[3700,-3700],
  // dải bờ tây Ba Son · Marina tách khỏi lõi, rồi mép bờ đông sông (nước thuộc lõi: góc Ven sông/Bạch Đằng nằm trọn trong lõi) xuống cửa rạch Bến Nghé
  W2:[-430,-800],W3:[-760,-560],W4:[-780,-120],W5:[-560,60],R0:[-470,110],R1:[-170,200],R2:[-215,400],R3:[-240,800],R4:[-160,1000],S2:[-120,1200],
  // rạch Bến Nghé (ranh lõi | nam), tây nam
  S1:[-530,1170],K0:[-816,1200],K1:[-1038,1400],K2:[-1250,1600],K3:[-1505,1800],K4:[-1653,2000],K5:[-1906,2200],K6:[-2203,2400],K7:[-2434,2600],K8:[-2630,2800],K9:[-2800,3000],K10:[-3600,3600],
  BL:[-3600,3700],BR:[3700,3700],
  // tim sông quanh phía nam Thủ Thiêm (ranh bờ đông | nam), rồi ra mép đông
  T1:[-165,1400],T2:[18,1600],T3:[307,1800],T4:[750,2000],T5:[1000,2150],T6:[1750,2230],T7:[2300,2060],E1:[3700,2060]
};
const ring=(...keys)=>Object.freeze(keys.map(key=>Object.freeze([...V[key]])));

const DEFINITIONS=[
  {id:'trung-tam',label:'Lõi Quận 1 · Bến Nghé',short:'Lõi Quận 1',
   about:'Bờ tây, nam rạch Thị Nghè, bắc rạch Bến Nghé: Nguyễn Huệ, Bạch Đằng, Lam Sơn, Bitexco, Đa Kao.',
   polygon:ring('A','N1','N2','N3','N4','N5','N6','N7','M0','W2','W3','W4','W5','R0','R1','R2','R3','R4','S2','S1','K0','K1','K2','K3','K4','K5','K6','K7','K8','K9','K10'),
   view:{target:[-1650,0,420],distance:5300,az:.45,polar:.63}},
  {id:'ven-song',label:'Ven sông · Ba Son · Thủ Thiêm',short:'Ven sông · Thủ Thiêm',
   about:'Toàn bộ bờ đông (Thủ Thiêm, Thảo Điền) cùng dải bờ tây Ba Son · Marina Central · Grand Marina.',
   polygon:ring('M0','N8','B1','B2','B3','B4','B5','B6','B7','B8','B9','TR','E1','T7','T6','T5','T4','T3','T2','T1','S2','R4','R3','R2','R1','R0','W5','W4','W3','W2'),
   view:{target:[1000,0,-550],distance:7200,az:.45,polar:.63}},
  {id:'bac',label:'Phía bắc · Thị Nghè · Bình Thạnh',short:'Phía bắc',
   about:'Bờ tây, bắc rạch Thị Nghè: Thị Nghè, Bình Thạnh, Thanh Đa, Landmark 81.',
   polygon:ring('TL','B9','B8','B7','B6','B5','B4','B3','B2','B1','N8','M0','N7','N6','N5','N4','N3','N2','N1','A'),
   view:{target:[-800,0,-1950],distance:5000,az:.45,polar:.63}},
  {id:'nam',label:'Phía nam · Quận 4 · Khánh Hội',short:'Phía nam',
   about:'Nam rạch Bến Nghé và nam sông quanh Thủ Thiêm: Quận 4, Khánh Hội, bờ bắc Quận 7.',
   polygon:ring('S1','S2','T1','T2','T3','T4','T5','T6','T7','E1','BR','BL','K10','K9','K8','K7','K6','K5','K4','K3','K2','K1','K0'),
   view:{target:[-250,0,2150],distance:5400,az:.45,polar:.63}}
];

function bboxOf(polygon){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const [x,z] of polygon){if(x<minX)minX=x;if(z<minZ)minZ=z;if(x>maxX)maxX=x;if(z>maxZ)maxZ=z;}
  return Object.freeze([minX,minZ,maxX,maxZ]);
}
// Ray casting chẵn/lẻ: điểm nằm đúng trên cạnh dùng chung được tính cho đúng một trong hai đa giác (quy tắc nửa mở).
function inPolygon(x,z,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function edgeDistance(x,z,polygon){
  let best=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],sx=b[0]-a[0],sz=b[1]-a[1],l=sx*sx+sz*sz;
    const t=l?Math.max(0,Math.min(1,((x-a[0])*sx+(z-a[1])*sz)/l)):0;
    best=Math.min(best,Math.hypot(a[0]+sx*t-x,a[1]+sz*t-z));
  }
  return best;
}

export const REGIONS_31=Object.freeze(DEFINITIONS.map((def,index)=>Object.freeze({...def,index,bbox:bboxOf(def.polygon),view:Object.freeze({...def.view,target:Object.freeze([...def.view.target])})})));
const byId=new Map(REGIONS_31.map(region=>[region.id,region]));

export const regionIds=()=>REGIONS_31.map(region=>region.id);
export const isRegionId=id=>byId.has(id);
// Giá trị URL/localStorage → id hợp lệ ('all' hoặc id khu); giá trị lạ trả về null.
export const normalizeRegionId=value=>value===REGION_ALL_ID||byId.has(value)?value:null;
export const regionById=id=>byId.get(id)||null;
export const regionLabel=id=>id===REGION_ALL_ID||!id?'Toàn bộ':byId.get(id)?.label||'Toàn bộ';
// Đa giác [[x,z],…] theo hợp đồng traffic.api.setRegion({id, polygon, margin?}).
export const regionPolygon=id=>byId.get(id)?.polygon.map(point=>[...point])||null;
// Biên nới cho giao thông (bước H · T1): cạnh/nút giao thông chỉ thuộc khu khi MỌI điểm của nó nằm trong đa giác khu
// NỚI thêm biên này (đa giác ⊕ đĩa REGION_TRAFFIC_MARGIN_M). Đo thực các cầu vắt ranh của sự cố (reach = quãng xa nhất
// của điểm cạnh tới đa giác khu kề): cầu Thị Nghè 160 m, cầu Thủ Thiêm 156 m, cầu Khánh Hội 225 m ⇒ 250 m là giá trị
// tròn nhỏ nhất để các cầu đó thuộc khu ở hai bờ; cầu Sài Gòn (~1 km, reach 500–600 m) vẫn chỉ thuộc trọn một bên.
export const REGION_TRAFFIC_MARGIN_M=250;
// Điểm thuộc khu theo phép thử giao thông: trong đa giác hoặc cách đa giác ≤ REGION_TRAFFIC_MARGIN_M (cùng phép thử
// mà city-traffic-sim-31.js dùng khi setRegion ⇒ QA "xe ngoài khu = 0" và sim nhất quán). slackM: dung sai hình học cho
// tâm xe (lệch ngang làn ±1,5 m + jitter) so với tim làn mà sim dùng khi chọn cạnh — không nới biên chọn cạnh.
export const regionTrafficContains=(id,x,z,slackM=0)=>{
  const region=byId.get(id);
  if(!region)return false;
  return inPolygon(x,z,region.polygon)||edgeDistance(x,z,region.polygon)<=REGION_TRAFFIC_MARGIN_M+slackM;
};
export const regionTrafficPayload=id=>byId.has(id)?{id,polygon:regionPolygon(id),margin:REGION_TRAFFIC_MARGIN_M}:null;

// Tra khu chính xác (không dùng lưới): thứ tự khai báo quyết định khi hai đa giác cùng nhận một điểm (chỉ do sai số số học);
// điểm không đa giác nào nhận (ngoài vành phủ của bốn khu) lấy khu có cạnh gần nhất ⇒ luôn trả về đúng một id.
function exactRegionOf(x,z){
  for(const region of REGIONS_31){
    const box=region.bbox;
    if(x>=box[0]&&x<=box[2]&&z>=box[1]&&z<=box[3]&&inPolygon(x,z,region.polygon))return region.id;
  }
  let best=null,bestDistance=Infinity;
  for(const region of REGIONS_31){const d=edgeDistance(x,z,region.polygon);if(d<bestDistance){bestDistance=d;best=region.id;}}
  return best;
}

// Lưới tra nhanh 64 m: ô không có cạnh ranh đi qua thì cả ô thuộc một khu (tính một lần từ tâm ô); ô có cạnh dùng phép thử chính xác.
const GRID_M=64,GRID_X0=-3800,GRID_Z0=-3800,GRID_N=Math.ceil(7600/GRID_M);
let gridCache=null;
function buildGrid(){
  const edge=new Uint8Array(GRID_N*GRID_N),cell=new Array(GRID_N*GRID_N).fill(null);
  const mark=(x,z)=>{
    const i=Math.floor((x-GRID_X0)/GRID_M),j=Math.floor((z-GRID_Z0)/GRID_M);
    for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++){const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<GRID_N&&b<GRID_N)edge[b*GRID_N+a]=1;}
  };
  for(const region of REGIONS_31){
    const p=region.polygon;
    for(let k=0;k<p.length;k++){
      const a=p[k],b=p[(k+1)%p.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(GRID_M/2)));
      for(let s=0;s<=steps;s++)mark(a[0]+(b[0]-a[0])*s/steps,a[1]+(b[1]-a[1])*s/steps);
    }
  }
  return {edge,cell};
}
export function regionOf(x,z){
  const i=Math.floor((x-GRID_X0)/GRID_M),j=Math.floor((z-GRID_Z0)/GRID_M);
  if(i<0||j<0||i>=GRID_N||j>=GRID_N)return exactRegionOf(x,z);
  gridCache||=buildGrid();
  const index=j*GRID_N+i;
  if(gridCache.edge[index])return exactRegionOf(x,z);
  return gridCache.cell[index]??=exactRegionOf(GRID_X0+(i+.5)*GRID_M,GRID_Z0+(j+.5)*GRID_M);
}
export const regionContains=(id,x,z)=>id===REGION_ALL_ID||regionOf(x,z)===id;
// Số khu chứa điểm theo phép thử đa giác thuần túy (QA: phải đúng 1 với mọi điểm).
export const regionHits=(x,z)=>REGIONS_31.filter(region=>inPolygon(x,z,region.polygon)).map(region=>region.id);
