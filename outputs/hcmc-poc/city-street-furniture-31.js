import * as THREE from 'three/webgpu';
import { loadSignatureRegistry } from './signature-registry-31.js?v=31a';

/*
 * Street Furniture 31 · bước E2 kế hoạch 31A
 *
 * - Cột đèn đặt theo mép mặt đường đã hợp nhất (roadNetwork.curbLines() của bước B), lùi ra vỉa hè một
 *   khoảng cố định, nhịp đều theo chiều dài mép. Vị trí bị loại nếu chạm mặt asphalt/giao lộ, sát giao lộ hoặc
 *   vạch qua đường, trong vòng xoay, trên/dưới cầu, ở mũi dải phân cách hay đảo nhỏ. Dải phân cách ≥ 2,5 m
 *   được đặt đèn ở giữa dải.
 * - Vạch qua đường: footway=crossing (data/street-furniture-31.js) thành vạch zebra mỏng có polygonOffset trên
 *   mặt asphalt, vuông góc tim đường, dài theo bề rộng mặt đường hợp nhất; mọi góc vạch phải nằm trên asphalt.
 * - Bước E (mật độ): instances() trả danh sách đèn có cờ signature (inProtectedZone 'lamp'); setVisibleFraction
 *   thưa đều theo thứ hạng van der Corput dọc từng mép, không bao giờ giảm đèn signature.
 * Không có ngẫu nhiên ngoài băm xác định với SEED. Vị trí là suy luận trình bày, không phải khảo sát.
 */

export const STREET_FURNITURE_31_VERSION='street-furniture-31e2';
const SEED=31;
const LEGACY_LAMP_TYPES=new Set(['motorway','trunk','primary','secondary','tertiary']);  // đèn 30B
// Thêm nhánh *_link: đường gom song song đại lộ (vd Nguyễn Hữu Cảnh là secondary_link) mới là mép có vỉa hè thật.
const LAMP_TYPES=new Set([...LEGACY_LAMP_TYPES,...[...LEGACY_LAMP_TYPES].map(type=>`${type}_link`)]);
const LAMP_RADIUS_M=1800;          // như đèn 30B
const SPACING_M=26;                // nhịp đèn dọc mép (đại lộ TP.HCM ~25–35 m)
const ZONE_SPACINGS_M=[26,23,20,18,16,14];  // vùng signature: giảm nhịp tới khi không ít đèn hơn 30B
const ZONE_MIN_LINE_M=6;           // vùng signature: mép ngắn giữa hai giao lộ vẫn có đèn
const SIDEWALK_SETBACK_M=1.5;      // bó vỉa 0,9 m + 0,6 m
const MEDIAN_MIN_M=2.5;            // dải phân cách hẹp hơn: không đặt đèn
const LATERAL_PROBE_M=10;          // tìm mặt asphalt bên kia dải phân cách
const POLE_CLEAR_M=.45;            // bán kính an toàn của cột
const ALONG_CLEAR_M=6;             // hai điểm trước/sau cột dọc mép không được rơi vào asphalt (mũi dải, đảo nhỏ)
const JUNCTION_CLEAR_M=5;
const CROSSING_CLEAR_M=5;
const MIN_LAMP_GAP_M=12;
const BRIDGE_CLEARANCE_M=10;
const MIN_LINE_M=SPACING_M*.5;   // mép ngắn hơn (đoạn kẹt giữa giao lộ/vạch) không đặt đèn
const POLE_HEIGHT_M=8.2;
// Zebra
const STRIPE_HALF_WIDTH_M=.25,STRIPE_PITCH_M=1.1,STRIPE_HALF_LENGTH_M=1.6,STRIPE_SHORT_HALF_LENGTH_M=1.1;
const ZEBRA_SAMPLE_M=.5,ZEBRA_MIN_RUN_M=2,ZEBRA_EDGE_INSET_M=.35,ZEBRA_MAX_HALF_M=30,ZEBRA_DEDUPE_M=3,ZEBRA_OBLIQUE_COS=Math.cos(35*Math.PI/180);
const ZEBRA_OFFSET=-5;             // asphalt mặt đất -3, vạch tim -4 (city-road-network-31.js)
const SAME_LEVEL_M=1;

const dummy=new THREE.Object3D();
const fract=v=>v-Math.floor(v);
function hash01(a,b=0){let h=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul(b+SEED,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;return(h>>>0)/4294967296;}
function vanDerCorput(k){let v=0,f=.5;for(k=k+1;k>0;k>>=1,f*=.5)if(k&1)v+=f;return v;}
// Mã Morton 2D (lưới 4 m): duyệt theo đường cong này thì đèn kề nhau trong thứ tự cũng kề nhau trong không gian.
function morton(x,z){const q=v=>{v=Math.max(0,Math.min(65535,Math.floor(v/4+32768)));v=(v|(v<<8))&0x00ff00ff;v=(v|(v<<4))&0x0f0f0f0f;v=(v|(v<<2))&0x33333333;return(v|(v<<1))&0x55555555;};return q(x)*2+q(z);}

// Danh sách road không vẽ ribbon (footway=crossing, footway trùng lòng đường); bỏ mục lệch id với CITY_DATA.
export function hiddenFootwayRoads(roads,data){
  const out=new Set();
  for(const item of data?.hiddenFootways||[])if(roads[item.road]?.id===item.way)out.add(item.road);
  return out;
}

function inPolygonXZ(poly,x,z){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function segmentDistance(px,pz,ax,az,bx,bz){const sx=bx-ax,sz=bz-az,l=sx*sx+sz*sz,t=l?Math.min(1,Math.max(0,((px-ax)*sx+(pz-az)*sz)/l)):0;return Math.hypot(ax+sx*t-px,az+sz*t-pz);}
function polygonDistance(poly,x,z){if(inPolygonXZ(poly,x,z))return 0;let d=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];d=Math.min(d,segmentDistance(x,z,a[0],a[1],b[0],b[1]));}return d;}
function hull(points){
  const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
  lower.pop();upper.pop();return lower.concat(upper);
}

// Chỉ mục mặt asphalt đã vẽ: tứ giác mép trái/phải của từng mảnh + polygon giao lộ asphalt (y theo từng đỉnh).
function createAsphaltIndex(api,roadCount){
  const cell=25,grid=new Map(),key=(gx,gz)=>gx*1048576+gz;
  const insert=(item,x0,z0,x1,z1)=>{for(let gx=Math.floor(x0/cell);gx<=Math.floor(x1/cell);gx++)for(let gz=Math.floor(z0/cell);gz<=Math.floor(z1/cell);gz++){const k=key(gx,gz);let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(item);}};
  const junctions=[];
  for(let r=0;r<roadCount;r++)for(const piece of api.pieces(r)){
    if(piece.group!=='asphalt')continue;
    const L=piece.left,R=piece.right,C=piece.center,n=L.length/3;
    for(let k=0;k<n-1;k++){
      const q=[[L[k*3],L[k*3+2],L[k*3+1]],[R[k*3],R[k*3+2],R[k*3+1]],[R[k*3+3],R[k*3+5],R[k*3+4]],[L[k*3+3],L[k*3+5],L[k*3+4]]];
      let tx=C[k*3+3]-C[k*3],tz=C[k*3+5]-C[k*3+2];const tl=Math.hypot(tx,tz);if(tl<1e-6)continue;tx/=tl;tz/=tl;
      const xs=q.map(p=>p[0]),zs=q.map(p=>p[1]);
      insert({q,tx,tz,road:r},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
    }
  }
  for(const j of api.junctions()){
    if(j.group!=='asphalt')continue;
    const poly=j.polygon.map(p=>[p[0],p[2],p[1]]),xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
    const item={poly,y:j.y,elevated:j.elevated,node:j.node};insert(item,Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
    if(!j.elevated)junctions.push(item);
  }
  const triY=(p,q,r,x,z)=>{const det=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);if(Math.abs(det)<1e-12)return null;const w0=((q[1]-r[1])*(x-r[0])+(r[0]-q[0])*(z-r[1]))/det,w1=((r[1]-p[1])*(x-r[0])+(p[0]-r[0])*(z-r[1]))/det,w2=1-w0-w1;return w0>=-1e-6&&w1>=-1e-6&&w2>=-1e-6?w0*p[2]+w1*q[2]+w2*r[2]:null;};
  const fanY=(poly,x,z)=>{for(let k=1;k<poly.length-1;k++){const y=triY(poly[0],poly[k],poly[k+1],x,z);if(y!==null)return y;}return null;};
  // [{y, item}] mọi mặt asphalt chứa (x, z)
  const hits=(x,z)=>{
    const out=[];
    for(const item of grid.get(key(Math.floor(x/cell),Math.floor(z/cell)))||[]){
      if(item.poly){if(inPolygonXZ(item.poly,x,z))out.push({y:fanY(item.poly,x,z)??item.y,item});continue;}
      const [a,b,c,d]=item.q,y=triY(a,b,d,x,z)??triY(d,b,c,x,z);
      if(y!==null)out.push({y,item});
    }
    return out;
  };
  const near=(x,z,y,tol=SAME_LEVEL_M)=>{let best=null;for(const h of hits(x,z))if(Math.abs(h.y-y)<tol&&(!best||Math.abs(h.y-y)<Math.abs(best.y-y)))best=h;return best;};
  const jGrid=new Map(),JC=40;
  for(const j of junctions){const xs=j.poly.map(p=>p[0]),zs=j.poly.map(p=>p[1]);for(let gx=Math.floor((Math.min(...xs)-JUNCTION_CLEAR_M)/JC);gx<=Math.floor((Math.max(...xs)+JUNCTION_CLEAR_M)/JC);gx++)for(let gz=Math.floor((Math.min(...zs)-JUNCTION_CLEAR_M)/JC);gz<=Math.floor((Math.max(...zs)+JUNCTION_CLEAR_M)/JC);gz++){const k=gx+','+gz;if(!jGrid.has(k))jGrid.set(k,[]);jGrid.get(k).push(j);}}
  const junctionDistance=(x,z)=>{let d=Infinity;for(const j of jGrid.get(Math.floor(x/JC)+','+Math.floor(z/JC))||[])d=Math.min(d,polygonDistance(j.poly,x,z));return d;};
  return {hits,near,junctionDistance};
}

// Cụm vòng xoay (road junction=roundabout nối qua node chung) → bao lồi tim đường.
function roundaboutHulls(roads,graph){
  const parent=new Map(),find=a=>{while(parent.get(a)!==a){parent.set(a,parent.get(parent.get(a)));a=parent.get(a);}return a;};
  const ring=graph.roads.filter(r=>r.junction==='roundabout');
  for(const r of ring)for(const n of r.nodes)if(!parent.has(n))parent.set(n,n);
  for(const r of ring)for(let k=1;k<r.nodes.length;k++){const a=find(r.nodes[0]),b=find(r.nodes[k]);if(a!==b)parent.set(a,b);}
  const clusters=new Map();
  for(const r of ring){const c=find(r.nodes[0]);if(!clusters.has(c))clusters.set(c,[]);for(const p of roads[r.index].c)clusters.get(c).push(p);}
  return {roads:new Set(ring.map(r=>r.index)),hulls:[...clusters.values()].map(hull).filter(h=>h.length>=3)};
}

// Đèn 30B (city-detail-runtime-28 trước E2) — chỉ để đếm đối chứng tổng số và số đèn signature.
function legacyLampCounts(roads,widths,inZone){
  let total=0,signature=0;
  for(const road of roads){
    if(road.bridge||road.tunnel||!LEGACY_LAMP_TYPES.has(road.type))continue;
    const width=road.lanes?Math.max(widths[road.type]||8,road.lanes*3.1):widths[road.type]||8;
    for(let i=0;i<road.c.length-1;i++){
      const a=road.c[i],b=road.c[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<10)continue;
      const steps=Math.floor(length/62),nx=-dz/length,nz=dx/length;
      for(let step=0;step<=steps;step++){
        const t=(step+.5)/(steps+1),x=a[0]+dx*t,z=a[1]+dz*t;if(Math.hypot(x,z)>LAMP_RADIUS_M)continue;
        for(const side of [-1,1]){total++;if(inZone(x+nx*(width*.5+1.8)*side,z+nz*(width*.5+1.8)*side))signature++;}
      }
    }
  }
  return {total,signature};
}

function buildZebras({roads,data,index,groundY}){
  const bands=[],positions=[],skipped={idMismatch:0,unmarked:0,noAsphalt:0,duplicate:0,noStripe:0};
  const on=(x,z,y)=>index.near(x,z,y,.3);
  for(const crossing of data?.crossings||[]){
    const road=roads[crossing.road];
    if(!road||road.id!==crossing.way){skipped.idMismatch++;continue;}
    if(!crossing.zebra){skipped.unmarked++;continue;}
    // 1) Các đoạn liên tục của tim crossing nằm trên asphalt mặt đất.
    const samples=[];
    for(let i=0;i<road.c.length-1;i++){
      const a=road.c[i],b=road.c[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(len/ZEBRA_SAMPLE_M));
      for(let s=i===0?0:1;s<=steps;s++){const x=a[0]+(b[0]-a[0])*s/steps,z=a[1]+(b[1]-a[1])*s/steps;samples.push({x,z,hit:index.near(x,z,groundY,2)});}
    }
    const runs=[];let run=null;
    for(const s of samples){if(s.hit){if(!run)runs.push(run=[]);run.push(s);}else run=null;}
    let made=0;
    for(const list of runs){
      const first=list[0],last=list[list.length-1],runLength=Math.hypot(last.x-first.x,last.z-first.z);
      if(runLength<ZEBRA_MIN_RUN_M)continue;
      const mid=list[list.length>>1],y=mid.hit.y;
      let cx=(last.x-first.x)/runLength,cz=(last.z-first.z)/runLength;
      // 2) Trục dải = vuông góc tim đường (hướng mảnh asphalt tại điểm giữa), trừ khi crossing quá xiên.
      let nx=cx,nz=cz;
      const piece=index.hits(mid.x,mid.z).find(h=>!h.item.poly&&Math.abs(h.y-y)<.3)?.item;
      if(piece){let px=-piece.tz,pz=piece.tx;if(px*cx+pz*cz<0){px=-px;pz=-pz;}if(px*cx+pz*cz>=ZEBRA_OBLIQUE_COS){nx=px;nz=pz;}}
      const ux=-nz,uz=nx;
      // 3) Bề rộng theo mặt đường hợp nhất: đi dọc trục từ điểm giữa tới khi rời asphalt.
      const reach=sign=>{let s=0;const cap=Math.min(ZEBRA_MAX_HALF_M,runLength*.75+4);while(s<cap&&on(mid.x+nx*sign*(s+.2),mid.z+nz*sign*(s+.2),y))s+=.2;return s;};
      const s0=-reach(-1)+ZEBRA_EDGE_INSET_M,s1=reach(1)-ZEBRA_EDGE_INSET_M;
      if(s1-s0<ZEBRA_MIN_RUN_M)continue;
      const ax=mid.x+nx*s0,az=mid.z+nz*s0,bx=mid.x+nx*s1,bz=mid.z+nz*s1;
      if(bands.some(b=>segmentDistance((ax+bx)/2,(az+bz)/2,b.a[0],b.a[1],b.b[0],b.b[1])<ZEBRA_DEDUPE_M&&Math.abs(b.axis[0]*nx+b.axis[1]*nz)>.9)){skipped.duplicate++;continue;}
      // 4) Vạch: hình chữ nhật dọc tim đường; bỏ vạch nào có góc rơi ra ngoài asphalt (không răng cưa).
      const count=Math.max(1,Math.floor((s1-s0+STRIPE_PITCH_M-2*STRIPE_HALF_WIDTH_M)/STRIPE_PITCH_M)),start=(s0+s1)/2-(count-1)*STRIPE_PITCH_M/2;
      let stripes=0,halfLength=STRIPE_HALF_LENGTH_M;
      for(let k=0;k<count;k++){
        const s=start+k*STRIPE_PITCH_M,qx=mid.x+nx*s,qz=mid.z+nz*s;
        let corners=null;
        for(const hl of [STRIPE_HALF_LENGTH_M,STRIPE_SHORT_HALF_LENGTH_M]){
          const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[qx+ux*hl*a+nx*STRIPE_HALF_WIDTH_M*b,qz+uz*hl*a+nz*STRIPE_HALF_WIDTH_M*b]);
          const ys=pts.map(([x,z])=>on(x,z,y)?.y);
          if(ys.every(v=>v!==undefined)&&on(qx,qz,y)){corners=pts.map(([x,z],i)=>[x,ys[i],z]);halfLength=Math.min(halfLength,hl);break;}
        }
        if(!corners)continue;
        const [p0,p1,p2,p3]=corners;
        positions.push(...p0,...p1,...p2,...p0,...p2,...p3);stripes++;
      }
      if(!stripes){skipped.noStripe++;continue;}
      bands.push({road:crossing.road,way:crossing.way,a:[ax,az],b:[bx,bz],axis:[nx,nz],halfWidth:halfLength,y,stripes});made++;
    }
    if(!made&&!runs.length)skipped.noAsphalt++;
  }
  return {bands,positions,skipped};
}

export function createStreetFurniture31({scene,roads,graph,roadNetwork,data,widths,nightLevel,status={}}){
  const started=performance.now();
  status.version=STREET_FURNITURE_31_VERSION;status.state='building';
  const api=roadNetwork,groundY=api.groundY,index=createAsphaltIndex(api,roads.length);
  let registry=null;
  try{registry=loadSignatureRegistry(globalThis.SIGNATURE_REGISTRY_31);}catch(error){status.registryError=String(error?.message||error);}
  const inZone=(x,z)=>!!registry?.inProtectedZone(x,z,'lamp');
  const root=new THREE.Group();root.name='Street Furniture 31 · đèn theo mép hợp nhất + vạch zebra';scene.add(root);

  // --- Zebra trước: đèn cần biết vị trí dải để giữ khoảng cách.
  const zebra=buildZebras({roads,data,index,groundY});
  const zebraGeometry=new THREE.BufferGeometry();
  zebraGeometry.setAttribute('position',new THREE.Float32BufferAttribute(zebra.positions,3));zebraGeometry.computeVertexNormals();
  const zebraMaterial=new THREE.MeshStandardNodeMaterial({color:'#e6e4da',roughness:.72,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:ZEBRA_OFFSET,polygonOffsetUnits:ZEBRA_OFFSET});
  const zebraMesh=new THREE.Mesh(zebraGeometry,zebraMaterial);
  zebraMesh.name='Zebra crossings 31 · vạch qua đường trên asphalt';zebraMesh.receiveShadow=true;zebraMesh.renderOrder=5;
  root.add(zebraMesh);
  const zebraGrid=new Map(),ZC=40;
  for(const band of zebra.bands){const x0=Math.min(band.a[0],band.b[0])-CROSSING_CLEAR_M-2,x1=Math.max(band.a[0],band.b[0])+CROSSING_CLEAR_M+2,z0=Math.min(band.a[1],band.b[1])-CROSSING_CLEAR_M-2,z1=Math.max(band.a[1],band.b[1])+CROSSING_CLEAR_M+2;for(let gx=Math.floor(x0/ZC);gx<=Math.floor(x1/ZC);gx++)for(let gz=Math.floor(z0/ZC);gz<=Math.floor(z1/ZC);gz++){const k=gx+','+gz;if(!zebraGrid.has(k))zebraGrid.set(k,[]);zebraGrid.get(k).push(band);}}
  const crossingDistance=(x,z)=>{let d=Infinity;for(const b of zebraGrid.get(Math.floor(x/ZC)+','+Math.floor(z/ZC))||[])d=Math.min(d,segmentDistance(x,z,b.a[0],b.a[1],b.b[0],b.b[1])-b.halfWidth);return d;};

  // --- Đèn theo mép hợp nhất.
  const roundabout=roundaboutHulls(roads,graph);
  const lines=api.curbLines().filter(line=>{
    if(line.kind!=='side'||line.group!=='asphalt'||!LAMP_TYPES.has(roads[line.road]?.type)||roundabout.roads.has(line.road))return false;
    for(let k=1;k<line.points.length;k+=3)if(line.points[k]>groundY+.05)return false;  // mép mảnh trên cầu/dốc dẫn
    return true;
  });
  const onAsphalt=(x,z)=>!!index.near(x,z,groundY);
  const POLE_RING=[[0,0],[POLE_CLEAR_M,0],[-POLE_CLEAR_M,0],[0,POLE_CLEAR_M],[0,-POLE_CLEAR_M]];
  const underBridge=(x,z)=>POLE_RING.some(([a,b])=>index.hits(x+a,z+b).some(h=>h.y>groundY+.05&&h.y-groundY<BRIDGE_CLEARANCE_M));
  const place=(zoneSpacing)=>{
    const lamps=[],rejected={},rejectedSignature={},reject=(reason,x,z)=>{rejected[reason]=(rejected[reason]||0)+1;if(inZone(x,z))rejectedSignature[reason]=(rejectedSignature[reason]||0)+1;};
    const gap=new Map(),GC=MIN_LAMP_GAP_M,tooClose=(x,z)=>{const gx=Math.floor(x/GC),gz=Math.floor(z/GC);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const l of gap.get((gx+i)+','+(gz+j))||[])if(Math.hypot(l.x-x,l.z-z)<MIN_LAMP_GAP_M)return true;return false;};
    lines.forEach((line,lineIndex)=>{
      const p=line.points,n=p.length/3,cum=[0];
      for(let k=1;k<n;k++)cum.push(cum[k-1]+Math.hypot(p[k*3]-p[k*3-3],p[k*3+2]-p[k*3-1]));
      // Mép có đỉnh trong vùng signature dùng nhịp vùng (cả mép, để nhịp đều).
      let zone=false;for(let k=0;k<n&&!zone;k++)zone=inZone(p[k*3],p[k*3+2]);
      const length=cum[n-1];if(length<(zone?ZONE_MIN_LINE_M:MIN_LINE_M))return;
      const spacing=zone?zoneSpacing:SPACING_M;
      const count=Math.max(1,Math.round(length/spacing));
      for(let k=0;k<count;k++){
        const s=(k+.5)*length/count;let seg=0;while(seg<n-2&&cum[seg+1]<s)seg++;
        const segLen=cum[seg+1]-cum[seg];if(segLen<1e-6)continue;
        const t=(s-cum[seg])/segLen,dx=(p[seg*3+3]-p[seg*3])/segLen,dz=(p[seg*3+5]-p[seg*3+2])/segLen;
        const ex=p[seg*3]+(p[seg*3+3]-p[seg*3])*t,ez=p[seg*3+2]+(p[seg*3+5]-p[seg*3+2])*t;
        if(Math.hypot(ex,ez)>LAMP_RADIUS_M)continue;
        const ox=-dz*line.sign,oz=dx*line.sign;
        // Dải phân cách: mặt asphalt khác trong LATERAL_PROBE_M phía ngoài mép.
        let width=null;for(let d=.25;d<=LATERAL_PROBE_M;d+=.25)if(onAsphalt(ex+ox*d,ez+oz*d)){width=d;break;}
        if(width!==null&&width<MEDIAN_MIN_M){reject('dải phân cách hẹp < 2,5 m',ex,ez);continue;}
        const median=width!==null,setback=median?width/2:SIDEWALK_SETBACK_M,x=ex+ox*setback,z=ez+oz*setback;
        if(POLE_RING.some(([a,b])=>onAsphalt(x+a,z+b))){reject('chạm mặt đường/giao lộ',x,z);continue;}
        if(underBridge(x,z)){reject('dưới mặt cầu thấp',x,z);continue;}
        if(roundabout.hulls.some(h=>inPolygonXZ(h,x,z))){reject('trong vòng xoay',x,z);continue;}
        if(index.junctionDistance(x,z)<JUNCTION_CLEAR_M){reject('sát giao lộ',x,z);continue;}
        if(crossingDistance(x,z)<CROSSING_CLEAR_M){reject('sát vạch qua đường',x,z);continue;}
        if(onAsphalt(x+dx*ALONG_CLEAR_M,z+dz*ALONG_CLEAR_M)||onAsphalt(x-dx*ALONG_CLEAR_M,z-dz*ALONG_CLEAR_M)){reject(median?'mũi dải phân cách/đảo nhỏ':'mặt đường khác ngay trước/sau',x,z);continue;}
        if(tooClose(x,z)){reject('trùng vị trí đèn khác',x,z);continue;}
        const lamp={kind:'lamp',x,y:groundY,z,armX:-ox,armZ:-oz,median,road:line.road,way:roads[line.road].id,side:line.side,signature:inZone(x,z),rank:0};
        lamps.push(lamp);const gk=Math.floor(x/GC)+','+Math.floor(z/GC);if(!gap.has(gk))gap.set(gk,[]);gap.get(gk).push(lamp);
      }
    });
    return {lamps,rejected,rejectedSignature};
  };
  const legacy=legacyLampCounts(roads,widths,inZone);
  let placed=null,zoneSpacing=SPACING_M;
  for(const spacing of ZONE_SPACINGS_M){
    zoneSpacing=spacing;placed=place(spacing);
    if(!registry||placed.lamps.filter(l=>l.signature).length>=legacy.signature)break;
  }
  // Thứ hạng thưa đều: duyệt đèn thường theo đường cong Morton, rank = van der Corput của thứ tự (lệch pha theo SEED)
  // → mọi lân cận giữ xấp xỉ tỉ lệ f, không bỏ trọn một khu. Signature xếp trước, rồi rank tăng: chỉ cần đổi mesh.count.
  const phase=hash01(SEED);
  placed.lamps.filter(l=>!l.signature).map(l=>[morton(l.x,l.z),l]).sort((a,b)=>a[0]-b[0]).forEach(([,l],i)=>{l.rank=fract(vanDerCorput(i)+phase);});
  const lamps=placed.lamps.sort((a,b)=>(b.signature-a.signature)||(a.rank-b.rank));
  lamps.forEach((lamp,i)=>{lamp.id=i;});
  const signatureCount=lamps.filter(l=>l.signature).length,ranks=lamps.slice(signatureCount).map(l=>l.rank);

  const poleMaterial=new THREE.MeshStandardNodeMaterial({color:'#313b3d',roughness:.46,metalness:.62});
  const lampMaterial=new THREE.MeshStandardNodeMaterial({color:'#d8e0d8',emissive:'#ffd397',emissiveIntensity:.08,roughness:.3,metalness:.28});
  const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.14,1,7),poleMaterial,Math.max(1,lamps.length));
  poles.name='Street lamp poles · 31 theo mép hợp nhất';poles.castShadow=true;poles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const heads=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),lampMaterial,Math.max(1,lamps.length));
  heads.name='Street lamp heads · 31 cần đèn quay về lòng đường';heads.castShadow=true;heads.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  lamps.forEach((lamp,i)=>{
    dummy.rotation.set(0,0,0);dummy.position.set(lamp.x,lamp.y-.05+POLE_HEIGHT_M/2,lamp.z);dummy.scale.set(1,POLE_HEIGHT_M,1);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
    // Đầu đèn: trục dài theo hướng cần (về lòng đường); ở dải phân cách là cần đôi cân hai phía.
    const reach=lamp.median?0:.55,length=lamp.median?2.3:1.25;
    dummy.position.set(lamp.x+lamp.armX*reach,lamp.y+POLE_HEIGHT_M-.15,lamp.z+lamp.armZ*reach);dummy.rotation.set(0,-Math.atan2(lamp.armZ,lamp.armX),0);dummy.scale.set(length,.18,.34);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
  });
  poles.count=heads.count=lamps.length;
  const lampGroup=new THREE.Group();lampGroup.name='LOD0 đèn đường 31';lampGroup.add(poles,heads);root.add(lampGroup);

  let fraction=1;
  const setVisibleFraction=f=>{
    fraction=Math.max(0,Math.min(1,Number(f)||0));
    let lo=0,hi=ranks.length;while(lo<hi){const mid=(lo+hi)>>1;if(ranks[mid]<fraction)lo=mid+1;else hi=mid;}
    poles.count=heads.count=signatureCount+(fraction>=1?ranks.length:lo);
    status.visibleLamps=poles.count;status.visibleFraction=fraction;
    return poles.count;
  };
  const DENSITY={low:.35,medium:.65,high:1};
  const setDensity=level=>setVisibleFraction(typeof level==='number'?level:DENSITY[level]??1);

  const rejected=placed.rejected;
  const counts={lamps:lamps.length,signatureLamps:signatureCount,medianLamps:lamps.filter(l=>l.median).length,legacyLamps:legacy.total,legacySignatureLamps:legacy.signature,
    zebraBands:zebra.bands.length,zebraStripes:zebra.positions.length/18,crossings:data?.crossings?.length||0,hiddenFootways:data?.hiddenFootways?.length||0,curbLines:lines.length};
  Object.assign(status,{
    state:'ready',counts,rejected,rejectedSignature:placed.rejectedSignature,zebraSkipped:zebra.skipped,visibleLamps:lamps.length,visibleFraction:1,zoneSpacingM:zoneSpacing,
    params:{spacingM:SPACING_M,sidewalkSetbackM:SIDEWALK_SETBACK_M,medianMinM:MEDIAN_MIN_M,junctionClearM:JUNCTION_CLEAR_M,crossingClearM:CROSSING_CLEAR_M,minLampGapM:MIN_LAMP_GAP_M,lampRadiusM:LAMP_RADIUS_M,zebraPolygonOffset:ZEBRA_OFFSET,seed:SEED},
    source:'roadNetwork31.curbLines() + data/street-furniture-31.js (OSM footway=crossing)',classification:'vị trí đèn và vạch suy luận trình bày, không khảo sát',
    buildMs:Math.round(performance.now()-started)
  });
  const publicApi={
    version:STREET_FURNITURE_31_VERSION,root,lampMesh:poles,headMesh:heads,zebraMesh,
    instances:()=>lamps,           // [{id,kind:'lamp',x,y,z,armX,armZ,median,road,way,side,signature,rank}]
    zebras:()=>zebra.bands,        // [{road,way,a:[x,z],b:[x,z],axis,halfWidth,y,stripes}]
    setVisibleFraction,setDensity,visibleFraction:()=>fraction
  };
  Object.defineProperty(status,'api',{value:publicApi,enumerable:false});

  let mode='';
  return Object.assign(publicApi,{
    update(cameraDistance,night){
      const next=cameraDistance<1350?'hero':cameraDistance<2800?'district':'city';
      if(next!==mode){mode=next;lampGroup.visible=next==='hero';zebraMesh.visible=next!=='city';status.lod=mode;}
      lampMaterial.emissiveIntensity=.04+Math.max(0,Math.min(1,night||0))*3.1;
    },
    dispose(){root.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});root.removeFromParent();}
  });
}
