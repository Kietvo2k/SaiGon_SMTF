import * as THREE from 'three/webgpu';
import { color, float, mix, positionWorld, sin } from 'three/tsl';

/*
 * Road Network 31 · bước B kế hoạch 31A
 *
 * Mặt đường liền mạch dựng từ đồ thị ROAD_GRAPH_31 (song song CITY_DATA.roads):
 * - mỗi road là polyline có miter (vượt giới hạn → bevel), nối liền qua nút bậc 2 kể cả giữa hai way;
 * - tại nút bậc ≥ 3 cùng nhóm (asphalt | vỉa hè), các ribbon bị cắt ở ranh giới giao lộ và được lấp bằng
 *   polygon lồi của các đầu mép; vạch kẻ dừng trước polygon;
 * - cao độ lấy theo profile của cạnh (cầu + dốc dẫn rampOf), không còn hằng số;
 * - thứ tự vẽ bằng polygonOffset trên vật liệu (đã kiểm có tác dụng ở cả WebGPU và WebGL 2);
 * - khe đường đôi (hai way một chiều cùng tên, ngược chiều) ≤ 12 m được lấp dải phân cách.
 * Hình học là suy luận từ tim đường OSM, không phải khảo sát mép đường.
 */

export const ROAD_NETWORK_31_VERSION='road-network-31';
const MITER_LIMIT=2;              // offset mép tối đa = 2 × nửa bề rộng (góc gãy ≤ 120°); vượt → bevel
const MARKING_GAP_M=3;            // vạch kẻ dừng cách mép polygon giao lộ
const MARKING_HALF_WIDTH_M=.08;
const MEDIAN_MAX_GAP_M=12;        // khe đường đôi tối đa được lấp
const MEDIAN_MIN_GAP_M=.2;
const MEDIAN_SAMPLE_M=8;
const SHORT_LINK_BODY_M=20;       // road nối hai giao lộ có thân asphalt ngắn hơn mức này không vẽ bó vỉa riêng (bước J)
const CURB_EXTRA_M=1.8;           // bó vỉa = bề rộng + 1,8 m như 30B
const ELEVATED_EPS_M=.05;
const PROFILE_TOL_M=.03;          // sai số giản lược profile khi chèn đỉnh dọc cạnh nâng (QA chặn 0,05 m)
const XZ_TOL_M=.1;                // sai số giản lược tim đường trên mặt bằng
const PEDESTRIAN_TYPES=new Set(['pedestrian','footway']);
const MARKING_TYPES=new Set(['motorway','trunk','primary','secondary']);
// polygonOffset (factor = units): âm hơn thắng khi đồng phẳng. Mặt đất: median < bó vỉa < vỉa hè < asphalt < vạch.
// Lớp trên cao (cầu, dốc dẫn) xếp trên lớp mặt đất cùng loại. Biên độ nhỏ (≤ 7 bước độ sâu) để không xuyên chân nhà.
const LAYERS=[
  {key:'median',kind:'median',elevated:false,offset:0,label:'mặt đất · median'},
  {key:'edge',kind:'edge',elevated:false,offset:-1,label:'mặt đất · bó vỉa'},
  {key:'pedestrian',kind:'pedestrian',elevated:false,offset:-2,label:'mặt đất · vỉa hè'},
  {key:'asphalt',kind:'asphalt',elevated:false,offset:-3,label:'mặt đất · asphalt'},
  {key:'marking',kind:'marking',elevated:false,offset:-4,label:'mặt đất · vạch kẻ'},
  {key:'edgeHigh',kind:'edge',elevated:true,offset:-4,label:'trên cao · bó vỉa'},
  {key:'pedestrianHigh',kind:'pedestrian',elevated:true,offset:-5,label:'trên cao · vỉa hè'},
  {key:'asphaltHigh',kind:'asphalt',elevated:true,offset:-6,label:'trên cao · asphalt'},
  {key:'markingHigh',kind:'marking',elevated:true,offset:-7,label:'trên cao · vạch kẻ'}
];
const bucketKey=(kind,elevated)=>elevated&&kind!=='median'?`${kind}High`:kind;

export function roadWidth31(road,widths){
  return road.lanes?Math.max(widths[road.type]||4,road.lanes*3.1):widths[road.type]||4;
}

function profileAt(profile,s){
  if(s<=profile[0])return profile[1];
  let lo=0,hi=profile.length/2-1;
  if(s>=profile[hi*2])return profile[hi*2+1];
  while(hi-lo>1){const mid=(lo+hi)>>1;if(profile[mid*2]<=s)lo=mid;else hi=mid;}
  const s0=profile[lo*2],s1=profile[hi*2],t=(s-s0)/Math.max(1e-9,s1-s0);
  return profile[lo*2+1]+(profile[hi*2+1]-profile[lo*2+1])*t;
}

// Douglas–Peucker trên (s, y): giữ mẫu profile cần thiết để nội suy tuyến tính sai ≤ PROFILE_TOL_M.
function keptProfileS(profile){
  const n=profile.length/2,keep=new Uint8Array(n);keep[0]=keep[n-1]=1;
  const stack=[[0,n-1]];
  while(stack.length){
    const [a,b]=stack.pop();let worst=-1,index=-1;
    for(let k=a+1;k<b;k++){
      const t=(profile[k*2]-profile[a*2])/Math.max(1e-9,profile[b*2]-profile[a*2]);
      const d=Math.abs(profile[k*2+1]-(profile[a*2+1]+(profile[b*2+1]-profile[a*2+1])*t));
      if(d>worst){worst=d;index=k;}
    }
    if(worst>PROFILE_TOL_M){keep[index]=1;stack.push([a,index],[index,b]);}
  }
  const out=[];for(let k=0;k<n;k++)if(keep[k])out.push(profile[k*2]);return out;
}

// Hình học một cạnh: đỉnh gốc + đỉnh chèn theo profile; s ở hệ profile (0 … edge.length).
function edgeGeometry(edge,groundY){
  const c=edge.c,n=c.length/2,cum=[0];
  for(let k=1;k<n;k++)cum.push(cum[k-1]+Math.hypot(c[k*2]-c[k*2-2],c[k*2+1]-c[k*2-1]));
  const total=cum[n-1],scale=total>1e-9?edge.length/total:1;
  // Bỏ đỉnh gần thẳng hàng (lệch < XZ_TOL_M) để giữ ngân sách tam giác; đỉnh đầu/cuối luôn giữ.
  const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;
  const stack=[[0,n-1]];
  while(stack.length){
    const [a,b]=stack.pop();if(b-a<2)continue;
    const ax=c[a*2],az=c[a*2+1],dx=c[b*2]-ax,dz=c[b*2+1]-az,dl=Math.hypot(dx,dz);let worst=-1,index=-1;
    for(let k=a+1;k<b;k++){
      const px=c[k*2]-ax,pz=c[k*2+1]-az,d=dl>1e-9?Math.abs(px*dz-pz*dx)/dl:Math.hypot(px,pz);
      if(d>worst){worst=d;index=k;}
    }
    if(worst>XZ_TOL_M){keep[index]=1;stack.push([a,index],[index,b]);}
  }
  let stations=cum.filter((_,k)=>keep[k]);
  if(edge.profile&&total>1e-9){
    for(const s of keptProfileS(edge.profile))stations.push(s/scale);
    stations.sort((a,b)=>a-b);
    stations=stations.filter((s,k)=>k===0||s-stations[k-1]>.05||s===total);
    if(stations.length>1&&total-stations[stations.length-2]<.05)stations.splice(stations.length-2,1);
  }
  const x=[],z=[],y=[],s=[];let seg=0;
  for(const d of stations){
    while(seg<n-2&&cum[seg+1]<d)seg++;
    const len=cum[seg+1]-cum[seg],t=len>1e-9?Math.min(1,Math.max(0,(d-cum[seg])/len)):0;
    x.push(c[seg*2]+(c[seg*2+2]-c[seg*2])*t);z.push(c[seg*2+1]+(c[seg*2+3]-c[seg*2+1])*t);
    const sp=d*scale;s.push(sp);
    if(edge.profile)y.push(profileAt(edge.profile,sp));
    else if(edge.y)y.push(edge.y[seg]+(edge.y[seg+1]-edge.y[seg])*t);
    else y.push(groundY);
  }
  const g=[0];for(let k=1;k<x.length;k++)g.push(g[k-1]+Math.hypot(x[k]-x[k-1],z[k]-z[k-1]));
  return {x,z,y,s,g,length:g[g.length-1]};
}

// Điểm tại khoảng cách d (mét hình học) tính từ đầu `end` của cạnh (0 = from, 1 = to), kèm hướng đi ra khỏi đầu đó.
function pointOnArm(geo,end,d){
  const L=geo.length,target=end===0?Math.min(L,Math.max(0,d)):Math.max(0,L-Math.max(0,d)),n=geo.x.length;
  let k=0;while(k<n-2&&geo.g[k+1]<target)k++;
  const len=geo.g[k+1]-geo.g[k],t=len>1e-9?Math.min(1,Math.max(0,(target-geo.g[k])/len)):0;
  let tx=geo.x[k+1]-geo.x[k],tz=geo.z[k+1]-geo.z[k];const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
  if(end===1){tx=-tx;tz=-tz;}
  return {x:geo.x[k]+(geo.x[k+1]-geo.x[k])*t,y:geo.y[k]+(geo.y[k+1]-geo.y[k])*t,z:geo.z[k]+(geo.z[k+1]-geo.z[k])*t,s:geo.s[k]+(geo.s[k+1]-geo.s[k])*t,tx,tz};
}

// Các điểm của cạnh trong khoảng hình học [a, b] (theo chiều from → to), có điểm nội suy ở hai đầu.
function sliceEdge(geo,edgeIndex,a,b,out){
  const n=geo.x.length,push=(x,y,z,s)=>{const last=out[out.length-1];if(last&&Math.hypot(last.x-x,last.z-z)<.05&&Math.abs(last.y-y)<.01)return;out.push({x,y,z,s,edge:edgeIndex});};
  const at=d=>{const p=pointOnArm(geo,0,d);push(p.x,p.y,p.z,p.s);};
  at(a);
  for(let k=0;k<n;k++)if(geo.g[k]>a+.05&&geo.g[k]<b-.05)push(geo.x[k],geo.y[k],geo.z[k],geo.s[k]);
  at(b);
}

function convexHull(points){
  const p=points.slice().sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
  if(p.length<3)return p;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[2]-o[2])-(a[2]-o[2])*(b[0]-o[0]);
  const lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=1e-9)lower.pop();lower.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=1e-9)upper.pop();upper.push(q);}
  upper.pop();lower.pop();return lower.concat(upper);
}

// Cyrus–Beck: phần tham số [t0, t1] của đoạn A→B nằm trong polygon lồi (điểm [x,y,z]); null nếu không cắt.
function clipConvex(poly,ax,az,bx,bz){
  let area=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p[0]*q[2]-q[0]*p[2];}
  const sign=area>=0?1:-1,dx=bx-ax,dz=bz-az;let t0=0,t1=1;
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],ex=q[0]-p[0],ez=q[2]-p[2];
    const num=(ex*(az-p[2])-ez*(ax-p[0]))*sign,den=(ex*dz-ez*dx)*sign;
    if(Math.abs(den)<1e-12){if(num<0)return null;continue;}
    const t=-num/den;if(den>0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
    if(t0>t1)return null;
  }
  return t1-t0>1e-6?[t0,t1]:null;
}

const unit2=(x,z)=>{const l=Math.hypot(x,z);return l>1e-9?[x/l,z/l]:null;};

/*
 * Dải có miter. points: [{x,y,z,s,edge}], dirIn/dirOut: hướng của nhánh nối tiếp ở hai đầu (nút bậc 2) hoặc null.
 * Trả về trạm (tâm, mép trái/phải) và đẩy tam giác vào bucket theo lớp mặt đất / trên cao.
 */
function buildStrip(points,halfWidth,dirIn,dirOut,emit){
  const n=points.length;if(n<2)return null;
  const stations=[];
  const add=(p,nx,nz,scale)=>stations.push({p,ox:nx*halfWidth*scale,oz:nz*halfWidth*scale});
  for(let i=0;i<n;i++){
    const p=points[i];
    const din=i>0?unit2(p.x-points[i-1].x,p.z-points[i-1].z):dirIn;
    const dout=i<n-1?unit2(points[i+1].x-p.x,points[i+1].z-p.z):dirOut;
    if(!din||!dout){const d=din||dout;if(!d)continue;add(p,-d[1],d[0],1);continue;}
    const n0x=-din[1],n0z=din[0],n1x=-dout[1],n1z=dout[0];
    const m=unit2(n0x+n1x,n0z+n1z),cos=m?m[0]*n0x+m[1]*n0z:0,scale=cos>1e-6?1/cos:Infinity;
    if(scale<=MITER_LIMIT){add(p,m[0],m[1],scale);continue;}
    const isEnd=i===0||i===n-1;
    if(isEnd){const d=i===0?dout:din;add(p,-d[1],d[0],1);continue;}  // nối đầu quá gắt: cắt vuông
    add(p,n0x,n0z,1);add(p,n1x,n1z,1);                                 // bevel: hai trạm cùng tâm
  }
  if(stations.length<2)return null;
  const m=stations.length,center=new Float32Array(m*3),left=new Float32Array(m*3),right=new Float32Array(m*3),edge=new Int32Array(m),s=new Float32Array(m);
  stations.forEach((st,k)=>{
    const p=st.p;center.set([p.x,p.y,p.z],k*3);left.set([p.x+st.ox,p.y,p.z+st.oz],k*3);right.set([p.x-st.ox,p.y,p.z-st.oz],k*3);edge[k]=p.edge;s[k]=p.s;
  });
  if(emit)for(let k=0;k<m-1;k++)emit(left,right,k,k+1);
  return {center,left,right,edge,s,halfWidth};
}

function pushTri(out,a,b,c){out.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);}

// hiddenRoads (bước E2): chỉ số road không vẽ ribbon, ví dụ footway=crossing (thay bằng zebra) và footway trùng lòng đường.
export async function buildRoadNetwork31({roads,graph,widths,hiddenRoads=null,buildings=null,yieldMain=async()=>{},onProgress=()=>{}}){
  const started=performance.now();
  const groundY=graph.frame.groundY,nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const buckets=Object.fromEntries(LAYERS.map(layer=>[layer.key,[]]));
  const drawn=index=>!roads[index].tunnel&&graph.roads[index].skipRender!=='hide'&&!hiddenRoads?.has(index);
  const groupOf=index=>PEDESTRIAN_TYPES.has(roads[index].type)?'pedestrian':'asphalt';
  const halfOf=index=>roadWidth31(roads[index],widths)/2;
  const geoCache=new Map();
  const geometryOf=edgeIndex=>{let geo=geoCache.get(edgeIndex);if(!geo){geo=edgeGeometry(graph.edges[edgeIndex],groundY);geoCache.set(edgeIndex,geo);}return geo;};
  const isElevated=y=>y>groundY+ELEVATED_EPS_M;
  const armsOf=(node,filter)=>(node?.adj||[]).filter(([edgeIndex])=>{const road=graph.edges[edgeIndex].road;return drawn(road)&&filter(road);});
  const groupArms=(node,group)=>armsOf(node,road=>groupOf(road)===group);

  // Vertex y cho bước D: y theo đỉnh D.roads[i].c (cạnh nâng dùng y[], còn lại groundY).
  const vertexY=graph.roads.map((road,index)=>{
    const out=new Float32Array(roads[index].c.length).fill(groundY);
    for(const edgeIndex of road.edges){const edge=graph.edges[edgeIndex];if(edge.y)for(let k=edge.v0;k<=edge.v1;k++)out[k]=edge.y[k-edge.v0];}
    return out;
  });

  // y trên tim road tại đoạn đỉnh i→i+1, tỉ lệ u (theo profile của cạnh chứa đoạn) — cho xe bước D.
  const vertexS=new Map();
  const roadY=(index,i,u)=>{
    let info=vertexS.get(index);
    if(!info){
      // s0[k], s1[k]: s profile của đỉnh k và k+1 trong cạnh chứa đoạn k.
      const c=roads[index].c,s0=new Float32Array(c.length),s1=new Float32Array(c.length),edgeOf=new Int32Array(c.length).fill(-1);
      for(const edgeIndex of graph.roads[index].edges){
        const edge=graph.edges[edgeIndex],seg=[];for(let k=edge.v0;k<edge.v1;k++)seg.push(Math.hypot(c[k+1][0]-c[k][0],c[k+1][1]-c[k][1]));
        const total=seg.reduce((a,b)=>a+b,0),scale=total>1e-9?edge.length/total:1;let acc=0;
        for(let k=edge.v0;k<edge.v1;k++){edgeOf[k]=edgeIndex;s0[k]=acc*scale;acc+=seg[k-edge.v0];s1[k]=acc*scale;}
      }
      vertexS.set(index,info={s0,s1,edgeOf});
    }
    const edgeIndex=info.edgeOf[i];if(edgeIndex===undefined||edgeIndex<0)return vertexY[index]?.[i]??groundY;
    const edge=graph.edges[edgeIndex];
    if(edge.profile)return profileAt(edge.profile,info.s0[i]+(info.s1[i]-info.s0[i])*u);
    return vertexY[index][i]+(vertexY[index][i+1]-vertexY[index][i])*u;
  };

  // 1) Giao lộ: cắt ngắn từng nhánh tới giao điểm mép với nhánh kề, rồi lấy bao lồi các đầu mép.
  const junctions=[],armTrim=new Map();
  let junctionCandidates=0;
  for(const node of graph.nodes){
    for(const group of ['asphalt','pedestrian']){
      const adj=groupArms(node,group);if(adj.length<3)continue;
      junctionCandidates++;
      const arms=adj.map(([edgeIndex,end])=>{
        const edge=graph.edges[edgeIndex],geo=geometryOf(edgeIndex),hw=halfOf(edge.road);
        const ahead=pointOnArm(geo,end,Math.min(geo.length,Math.max(hw,5)));
        const dir=unit2(ahead.x-node.x,ahead.z-node.z)||[ahead.tx,ahead.tz];
        const other=end===0?edge.to:edge.from,otherJunction=other===node.id||groupArms(nodeById.get(other),group).length>=3;
        return {edge:edgeIndex,end,geo,hw,dir,angle:Math.atan2(dir[1],dir[0]),t:0,cap:geo.length*(otherJunction?.45:.9)};
      }).sort((a,b)=>a.angle-b.angle);
      const maxHw=Math.max(...arms.map(arm=>arm.hw));
      for(let i=0;i<arms.length;i++){
        const a=arms[i],b=arms[(i+1)%arms.length];
        let theta=b.angle-a.angle;if(theta<=0)theta+=Math.PI*2;
        if(theta<.02||theta>Math.PI-.02)continue;
        const sin=Math.sin(theta),cos=Math.cos(theta);
        a.t=Math.max(a.t,(b.hw+a.hw*cos)/sin);b.t=Math.max(b.t,(a.hw+b.hw*cos)/sin);
      }
      const corners=[[node.x,node.y,node.z]];
      for(const arm of arms){
        arm.t=Math.min(Math.max(0,arm.t),3*maxHw+2,arm.cap);
        const p=pointOnArm(arm.geo,arm.end,arm.t),nx=-p.tz*arm.hw,nz=p.tx*arm.hw;
        corners.push([p.x+nx,p.y,p.z+nz],[p.x-nx,p.y,p.z-nz]);
      }
      const polygon=convexHull(corners);
      if(polygon.length<3)continue;
      const floorY=Math.min(...polygon.map(q=>q[1]));
      for(const arm of arms){
        let ext=0;for(const q of polygon)ext=Math.max(ext,(q[0]-node.x)*arm.dir[0]+(q[2]-node.z)*arm.dir[1]);
        armTrim.set(`${arm.edge}:${arm.end}`,{t:arm.t,markingTrim:Math.max(arm.t,ext)+MARKING_GAP_M,node:node.id,floorY});
      }
      const elevated=polygon.some(q=>isElevated(q[1]));
      const target=buckets[bucketKey(group,elevated)];
      for(let k=1;k<polygon.length-1;k++)pushTri(target,polygon[0],polygon[k+1],polygon[k]);
      junctions.push({node:node.id,group,x:node.x,y:node.y,z:node.z,elevated,polygon,arms:arms.map(arm=>({edge:arm.edge,end:arm.end,t:arm.t}))});
    }
  }
  const junctionGrid=new Map(),JCELL=60;
  for(const j of junctions){
    if(j.group!=='asphalt')continue;
    const xs=j.polygon.map(p=>p[0]),zs=j.polygon.map(p=>p[2]);
    for(let gx=Math.floor(Math.min(...xs)/JCELL);gx<=Math.floor(Math.max(...xs)/JCELL);gx++)for(let gz=Math.floor(Math.min(...zs)/JCELL);gz<=Math.floor(Math.max(...zs)/JCELL);gz++){
      const k=`${gx},${gz}`;if(!junctionGrid.has(k))junctionGrid.set(k,[]);junctionGrid.get(k).push(j);
    }
  }
  const junctionsInBox=(x0,z0,x1,z1)=>{
    const out=new Set();
    for(let gx=Math.floor(x0/JCELL);gx<=Math.floor(x1/JCELL);gx++)for(let gz=Math.floor(z0/JCELL);gz<=Math.floor(z1/JCELL);gz++)for(const j of junctionGrid.get(`${gx},${gz}`)||[])out.add(j);
    return out;
  };
  onProgress(.15);await yieldMain();

  // Hướng đi ra của nhánh duy nhất còn lại tại nút bậc 2 (để miter nối liền giữa hai way).
  const neighbourDir=(nodeId,edgeIndex,end,filter)=>{
    const node=nodeById.get(nodeId),others=armsOf(node,filter).filter(([e,k])=>!(e===edgeIndex&&k===end));
    if(others.length!==1||armsOf(node,filter).length!==2)return null;
    const [e,k]=others[0],geo=geometryOf(e),p=pointOnArm(geo,k,Math.min(geo.length,1));
    return unit2(p.x-node.x,p.z-node.z)||[p.tx,p.tz];
  };
  const emitTo=(kind)=>(left,right,a,b)=>{
    const elevated=isElevated(left[a*3+1])||isElevated(left[b*3+1]);
    const out=buckets[bucketKey(kind,elevated)];
    const L0=left.subarray(a*3,a*3+3),R0=right.subarray(a*3,a*3+3),L1=left.subarray(b*3,b*3+3),R1=right.subarray(b*3,b*3+3);
    pushTri(out,L0,R0,L1);pushTri(out,L1,R0,R1);
  };

  // 2) Từng road: bó vỉa liền suốt (nằm dưới asphalt), mặt đường cắt tại giao lộ, vạch kẻ cắt thêm trước polygon.
  const piecesByRoad=graph.roads.map(()=>[]),markingPieces=[];
  let pieceCount=0,curbChains=0;
  for(let index=0;index<graph.roads.length;index++){
    if(index%1500===0){onProgress(.15+.7*index/graph.roads.length);await yieldMain();}
    if(!drawn(index))continue;
    const groad=graph.roads[index],group=groupOf(index),hw=halfOf(index),edgeList=groad.edges;
    if(!edgeList.length)continue;
    const firstEdge=graph.edges[edgeList[0]],lastEdge=graph.edges[edgeList[edgeList.length-1]];
    // Bó vỉa: một chuỗi cho cả road, miter qua nút bậc 2 (mọi nhóm).
    const curbPoints=[];
    // Trong đoạn đã nhường cho polygon giao lộ, bó vỉa không được cao hơn điểm thấp nhất của polygon: dốc dẫn
    // (profile cao dần) nếu không sẽ nhô bó vỉa lên trên mặt giao lộ thành mảng xám.
    for(const edgeIndex of edgeList){
      const edge=graph.edges[edgeIndex],geo=geometryOf(edgeIndex),L=geo.length;
      const trimA=armTrim.get(`${edgeIndex}:0`),trimB=armTrim.get(`${edgeIndex}:1`),first=curbPoints.length;
      // Chỉ xử lý đầu có profile cao hơn đáy giao lộ; cạnh phẳng (đa số) giữ nguyên đỉnh để giữ ngân sách tam giác.
      const spanMaxY=(end,t)=>{let m=pointOnArm(geo,end,t).y;for(let k=0;k<geo.y.length;k++)if((end===0?geo.g[k]:L-geo.g[k])<t)m=Math.max(m,geo.y[k]);return m;};
      const a=trimA&&spanMaxY(0,trimA.t)>trimA.floorY+.004?trimA:null,b=trimB&&spanMaxY(1,trimB.t)>trimB.floorY+.004?trimB:null;
      if(!a&&!b){sliceEdge(geo,edgeIndex,0,L,curbPoints);continue;}
      // Cắt thêm điểm tại biên trim để y bó vỉa không bị nội suy qua biên (cạnh đã giản lược có thể rất thưa đỉnh).
      const ta=a?Math.min(a.t,L):0,tb=b?Math.max(ta,L-b.t):L;
      if(ta>0)sliceEdge(geo,edgeIndex,0,ta,curbPoints);
      sliceEdge(geo,edgeIndex,ta,tb,curbPoints);
      if(tb<L)sliceEdge(geo,edgeIndex,tb,L,curbPoints);
      // Điểm đầu cạnh có thể bị gộp với điểm cuối cạnh trước nên đo từ toạ độ nút `from`.
      const from=nodeById.get(edge.from);
      let d=first<curbPoints.length?Math.hypot(curbPoints[first].x-from.x,curbPoints[first].z-from.z):0;
      for(let k=first;k<curbPoints.length;k++){
        if(k>first)d+=Math.hypot(curbPoints[k].x-curbPoints[k-1].x,curbPoints[k].z-curbPoints[k-1].z);
        if(a&&d<ta+.01)curbPoints[k].y=Math.min(curbPoints[k].y,a.floorY);
        if(b&&d>tb-.01)curbPoints[k].y=Math.min(curbPoints[k].y,b.floorY);
      }
    }
    const anyDrawn=()=>true;
    // Bước J: road ngắn nối hai giao lộ (thân asphalt còn lại ngắn) chỉ để lại viền bó vỉa bị polygon hai đầu che dở, thành các
    // mảnh răng cưa quanh đảo giao thông nhỏ; thân asphalt vẫn vẽ nên bỏ bó vỉa của nó (không xét road trên cao).
    const bodyM=edgeList.reduce((sum,edgeIndex)=>sum+Math.max(0,graph.edges[edgeIndex].length-(armTrim.get(`${edgeIndex}:0`)?.t||0)-(armTrim.get(`${edgeIndex}:1`)?.t||0)),0);
    const bothJunction=armTrim.has(`${edgeList[0]}:0`)&&armTrim.has(`${edgeList[edgeList.length-1]}:1`);
    const skipCurb=bothJunction&&bodyM<SHORT_LINK_BODY_M&&!vertexY[index].some(isElevated);
    if(!skipCurb&&buildStrip(curbPoints,hw+CURB_EXTRA_M/2,neighbourDir(firstEdge.from,edgeList[0],0,anyDrawn),neighbourDir(lastEdge.to,edgeList[edgeList.length-1],1,anyDrawn),emitTo('edge')))curbChains++;
    // Mặt đường: tách mảnh tại giao lộ cùng nhóm.
    const sameGroup=road=>groupOf(road)===group;
    let points=[],start=null;
    const flush=end=>{
      if(points.length>=2){
        const dirIn=start.junction===null?neighbourDir(start.node,start.edge,0,sameGroup):null;
        const dirOut=end.junction===null?neighbourDir(end.node,end.edge,1,sameGroup):null;
        const piece=buildStrip(points,hw,dirIn,dirOut,emitTo(group));
        if(piece){
          Object.assign(piece,{road:index,group,elevated:points.some(p=>isElevated(p.y)),startJunction:start.junction,endJunction:end.junction,startMarkingTrim:start.markingTrim,endMarkingTrim:end.markingTrim,startTrim:start.t,endTrim:end.t});
          piecesByRoad[index].push(piece);pieceCount++;
        }
      }
      points=[];start=null;
    };
    for(const edgeIndex of edgeList){
      const edge=graph.edges[edgeIndex],geo=geometryOf(edgeIndex);
      const a=armTrim.get(`${edgeIndex}:0`),b=armTrim.get(`${edgeIndex}:1`);
      if(a&&points.length)flush({node:edge.from,edge:edgeIndex,junction:a.node,markingTrim:a.markingTrim,t:a.t});
      const from=a?a.t:0,to=geo.length-(b?b.t:0);
      if(to-from>.05){
        if(!start)start={node:edge.from,edge:edgeIndex,junction:a?a.node:null,markingTrim:a?a.markingTrim:0,t:a?a.t:0};
        sliceEdge(geo,edgeIndex,from,to,points);
      }
      if(b)flush({node:edge.to,edge:edgeIndex,junction:b.node,markingTrim:b.markingTrim,t:b.t});
    }
    if(points.length)flush({node:lastEdge.to,edge:edgeList[edgeList.length-1],junction:null,markingTrim:0,t:0});
    // Vạch tim đường trên trục chính.
    if(group==='asphalt'&&MARKING_TYPES.has(roads[index].type)){
      for(const piece of piecesByRoad[index]){
        const c=piece.center,n=c.length/3,cum=[0];
        for(let k=1;k<n;k++)cum.push(cum[k-1]+Math.hypot(c[k*3]-c[k*3-3],c[k*3+2]-c[k*3-1]));
        const total=cum[n-1],a=piece.startJunction!==null?piece.startMarkingTrim-piece.startTrim:0,b=total-(piece.endJunction!==null?piece.endMarkingTrim-piece.endTrim:0);
        if(b-a<2)continue;
        // Bỏ thêm đoạn vạch đi qua polygon giao lộ cùng cao độ của road khác (đường chồng nhau, giao cắt không chung nút).
        const removed=[];
        for(let k=0;k<n-1;k++){
          const ax=c[k*3],az=c[k*3+2],bx=c[k*3+3],bz=c[k*3+5],len=cum[k+1]-cum[k];if(len<1e-6)continue;
          for(const j of junctionsInBox(Math.min(ax,bx),Math.min(az,bz),Math.max(ax,bx),Math.max(az,bz))){
            const hit=clipConvex(j.polygon,ax,az,bx,bz),tm=hit?(hit[0]+hit[1])/2:0;
            if(hit&&Math.abs(j.y-(c[k*3+1]+(c[k*3+4]-c[k*3+1])*tm))<=1.5)removed.push([cum[k]+hit[0]*len-MARKING_GAP_M/2,cum[k]+hit[1]*len+MARKING_GAP_M/2]);
          }
        }
        removed.sort((p,q)=>p[0]-q[0]);
        const keep=[];let cursor=a;
        for(const [r0,r1] of removed){if(r0>cursor)keep.push([cursor,Math.min(r0,b)]);cursor=Math.max(cursor,r1);if(cursor>=b)break;}
        if(cursor<b)keep.push([cursor,b]);
        for(const [k0,k1] of keep){
          if(k1-k0<2)continue;
          const pts=[],at=d=>{let k=0;while(k<n-2&&cum[k+1]<d)k++;const len=cum[k+1]-cum[k],t=len>1e-9?Math.min(1,Math.max(0,(d-cum[k])/len)):0;pts.push({x:c[k*3]+(c[k*3+3]-c[k*3])*t,y:c[k*3+1]+(c[k*3+4]-c[k*3+1])*t,z:c[k*3+2]+(c[k*3+5]-c[k*3+2])*t,s:0,edge:piece.edge[k]});};
          at(k0);for(let k=0;k<n;k++)if(cum[k]>k0+.05&&cum[k]<k1-.05){const last=pts[pts.length-1];if(Math.hypot(last.x-c[k*3],last.z-c[k*3+2])>.05)pts.push({x:c[k*3],y:c[k*3+1],z:c[k*3+2],s:0,edge:piece.edge[k]});}at(k1);
          const marking=buildStrip(pts,MARKING_HALF_WIDTH_M,null,null,emitTo('marking'));
          if(marking)markingPieces.push({road:index,center:marking.center});
        }
      }
    }
  }
  onProgress(.85);await yieldMain();

  // 3) Dải phân cách đường đôi: mẫu dọc tim way một chiều, chiếu sang way cùng tên ngược chiều gần nhất.
  const byName=new Map();
  roads.forEach((road,index)=>{
    const g=graph.roads[index];
    if(!drawn(index)||groupOf(index)!=='asphalt'||!road.name||(g.oneway!=='yes'&&g.oneway!=='-1'))return;
    if(!byName.has(road.name))byName.set(road.name,[]);byName.get(road.name).push(index);
  });
  let medianQuads=0,medianPairs=new Set();
  for(const members of byName.values()){
    if(members.length<2)continue;
    const segments=[];
    for(const index of members){
      const c=roads[index].c,sign=graph.roads[index].oneway==='-1'?-1:1,ys=vertexY[index];
      for(let k=0;k<c.length-1;k++)if(!isElevated(ys[k])&&!isElevated(ys[k+1]))segments.push({index,ax:c[k][0],az:c[k][1],bx:c[k+1][0],bz:c[k+1][1],sign});
    }
    for(const index of members){
      const c=roads[index].c,sign=graph.roads[index].oneway==='-1'?-1:1,ys=vertexY[index],hwA=halfOf(index);
      let previous=null;
      for(let k=0;k<c.length-1;k++){
        if(isElevated(ys[k])||isElevated(ys[k+1])){previous=null;continue;}
        const ax=c[k][0],az=c[k][1],dx=c[k+1][0]-ax,dz=c[k+1][1]-az,len=Math.hypot(dx,dz);if(len<.1)continue;
        const ux=dx/len*sign,uz=dz/len*sign,steps=Math.max(1,Math.ceil(len/MEDIAN_SAMPLE_M));
        for(let j=k===0?0:1;j<=steps;j++){
          const px=ax+dx*j/steps,pz=az+dz*j/steps;let best=null;
          for(const seg of segments){
            if(seg.index===index)continue;
            const sx=seg.bx-seg.ax,sz=seg.bz-seg.az,sl=sx*sx+sz*sz;if(sl<.01)continue;
            const t=Math.min(1,Math.max(0,((px-seg.ax)*sx+(pz-seg.az)*sz)/sl)),qx=seg.ax+sx*t,qz=seg.az+sz*t,d=Math.hypot(qx-px,qz-pz);
            if(best&&d>=best.d)continue;
            const sll=Math.sqrt(sl);if((ux*sx+uz*sz)/sll*seg.sign>-.85)continue;
            best={d,qx,qz,index:seg.index};
          }
          let sample=null;
          if(best&&best.index>index){
            const hwB=halfOf(best.index),gap=best.d-hwA-hwB,vx=(best.qx-px)/best.d,vz=(best.qz-pz)/best.d;
            if(gap>MEDIAN_MIN_GAP_M&&gap<=MEDIAN_MAX_GAP_M&&Math.abs(vx*ux+vz*uz)<.35)sample={other:best.index,a:[px+vx*hwA,groundY,pz+vz*hwA],b:[best.qx-vx*hwB,groundY,best.qz-vz*hwB]};
          }
          if(sample&&previous&&previous.other===sample.other){
            pushTri(buckets.median,previous.a,previous.b,sample.a);pushTri(buckets.median,sample.a,previous.b,sample.b);
            medianQuads++;medianPairs.add(`${index}:${sample.other}`);
          }
          previous=sample;
        }
      }
    }
  }
  const holesStarted=performance.now(),holes=await fillEnclosedHoles({roads,graph,drawn,groupOf,vertexY,isElevated,buckets,groundY,buildings,yieldMain}),holesMs=Math.round(performance.now()-holesStarted);
  onProgress(1);
  const triangles=Object.fromEntries(LAYERS.map(layer=>[layer.key,buckets[layer.key].length/9]));
  const elevatedRoads=graph.roads.filter((road,index)=>piecesByRoad[index].some(piece=>piece.elevated)).length;
  return {
    groundY,buckets,junctions,piecesByRoad,markingPieces,vertexY,roadY,
    stats:{
      roadsDrawn:piecesByRoad.filter(list=>list.length).length,pieces:pieceCount,curbChains,junctionCandidates,junctionPolygons:junctions.length,
      medianQuads,medianPairs:medianPairs.size,medianHoles:holes.filled,medianHoleCells:holes.cells,medianHoleTailCells:holes.tailCells,medianHoleRejected:holes.rejected,medianHoleMs:holesMs,elevatedRoads,markingPieces:markingPieces.length,
      triangles,totalTriangles:Object.values(triangles).reduce((sum,value)=>sum+value,0),buildMs:Math.round(performance.now()-started)
    }
  };
}

// 3b) Bước G: khe đất KÍN giữa hai chiều đường đôi mà bước 3 bỏ sót (khác tên, khe > 12 m, mũi nhọn sát giao lộ/cửa
// hầm). Raster 1 m quanh các cặp way một chiều ngược chiều (≤ HOLE_PAIR_M): ô không có mặt đường/bó vỉa/vỉa hè/median
// nào phủ, gom 8-liên thông; chỉ lấp thành median khi thành phần (a) kín — không chạm biên cửa sổ, (b) không chứa ô của
// footprint công trình, (c) nửa bề rộng ≤ HOLE_MAX_HALF_M, (d) không nằm trong vòng xoay (đảo tròn giữ nguyên).
// Xác định: thứ tự duyệt cố định theo ô, không ngẫu nhiên. Ô lấp nở HOLE_DILATE_M để mép khớp kín dưới asphalt.
const HOLE_CELL_M=1,HOLE_TILE_M=32,HOLE_MAX_HALF_M=8,HOLE_PAIR_M=30,HOLE_DILATE_M=.6,HOLE_TAIL_CELLS=2,HOLE_SLICE_MS=24;
async function fillEnclosedHoles({roads,graph,drawn,groupOf,vertexY,isElevated,buckets,groundY,buildings,yieldMain=async()=>{}}){
  const T=HOLE_TILE_M,tileKey=(tx,tz)=>`${tx},${tz}`;
  // Nhường luồng chính khi một lát chạy quá HOLE_SLICE_MS (không đổi kết quả, chỉ tránh khung dài).
  let slice=performance.now();const pace=async()=>{if(performance.now()-slice>HOLE_SLICE_MS){await yieldMain();slice=performance.now();}};
  // a) Đoạn tim một chiều ở mặt đất, lưới theo ô T.
  const segs=[],segGrid=new Map();
  roads.forEach((road,index)=>{
    const g=graph.roads[index];
    if(!drawn(index)||groupOf(index)!=='asphalt'||(g.oneway!=='yes'&&g.oneway!=='-1'))return;
    const c=road.c,ys=vertexY[index],sign=g.oneway==='-1'?-1:1;
    for(let k=0;k+1<c.length;k++){
      if(isElevated(ys[k])||isElevated(ys[k+1]))continue;
      const ax=c[k][0],az=c[k][1],bx=c[k+1][0],bz=c[k+1][1],len=Math.hypot(bx-ax,bz-az);if(len<.1)continue;
      const seg={index,ax,az,bx,bz,len,ux:(bx-ax)/len*sign,uz:(bz-az)/len*sign};segs.push(seg);
      for(let tx=Math.floor(Math.min(ax,bx)/T);tx<=Math.floor(Math.max(ax,bx)/T);tx++)for(let tz=Math.floor(Math.min(az,bz)/T);tz<=Math.floor(Math.max(az,bz)/T);tz++){const key=tileKey(tx,tz);if(!segGrid.has(key))segGrid.set(key,[]);segGrid.get(key).push(seg);}
    }
  });
  // b) Ô có cặp ngược chiều: mẫu mỗi 8 m, tìm đoạn ngược chiều (cos < −0,85) trong HOLE_PAIR_M; đánh dấu ô của trung điểm.
  const tiles=new Set();
  for(const s of segs){
    const steps=Math.max(1,Math.ceil(s.len/8));
    for(let j=0;j<=steps;j++){
      const px=s.ax+(s.bx-s.ax)*j/steps,pz=s.az+(s.bz-s.az)*j/steps,tx=Math.floor(px/T),tz=Math.floor(pz/T);
      let hit=null;
      for(let dx=-1;dx<=1&&!hit;dx++)for(let dz=-1;dz<=1&&!hit;dz++)for(const o of segGrid.get(tileKey(tx+dx,tz+dz))||[]){
        if(o.index===s.index||s.ux*o.ux+s.uz*o.uz>-.85)continue;
        const sx=o.bx-o.ax,sz=o.bz-o.az,t=Math.min(1,Math.max(0,((px-o.ax)*sx+(pz-o.az)*sz)/(sx*sx+sz*sz))),qx=o.ax+sx*t,qz=o.az+sz*t;
        if(Math.hypot(qx-px,qz-pz)<=HOLE_PAIR_M){hit=[(px+qx)/2,(pz+qz)/2];break;}
      }
      if(hit)tiles.add(tileKey(Math.floor(hit[0]/T),Math.floor(hit[1]/T)));
    }
  }
  const out={filled:0,cells:0,tailCells:0,rejected:{open:0,building:0,wide:0,roundabout:0},tiles:tiles.size};
  if(!tiles.size)return out;
  // c) Tam giác mặt đất đã vẽ (median, bó vỉa, vỉa hè, asphalt) và footprint công trình, lưới theo ô cho các cửa sổ cần.
  const need=new Set();
  for(const key of tiles){const [tx,tz]=key.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)need.add(tileKey(tx+dx,tz+dz));}
  // Raster một lần theo ô T (L×L ô 1 m), cửa sổ 3×3 ô ghép lại từ đó: 0 trống, 1 có mặt, 2 công trình, 3 median (bit 1 = có mặt).
  const C=HOLE_CELL_M,L=Math.round(T/C),raster=new Map();
  for(const key of need)raster.set(key,new Uint8Array(L*L));
  // Tô các ô 1 m trong bbox [gx0..gx1]×[gz0..gz1] thỏa test; tra tile theo cột ô T để khỏi tạo khóa chuỗi mỗi ô.
  const paint=(gx0,gz0,gx1,gz1,value,test)=>{
    for(let tz=Math.floor(gz0/L);tz<=Math.floor(gz1/L);tz++)for(let tx=Math.floor(gx0/L);tx<=Math.floor(gx1/L);tx++){
      const tile=raster.get(tileKey(tx,tz));if(!tile)continue;
      const r0=Math.max(gz0,tz*L),r1=Math.min(gz1,tz*L+L-1),c0=Math.max(gx0,tx*L),c1=Math.min(gx1,tx*L+L-1);
      for(let gz=r0;gz<=r1;gz++){const row=(gz-tz*L)*L-tx*L,z=(gz+.5)*C;for(let gx=c0;gx<=c1;gx++){const id=row+gx;if((tile[id]&1)||tile[id]===value)continue;if(test((gx+.5)*C,z))tile[id]=value;}}
    }
  };
  const near=(x0,z0,x1,z1)=>{for(let tx=Math.floor(x0/T);tx<=Math.floor(x1/T);tx++)for(let tz=Math.floor(z0/T);tz<=Math.floor(z1/T);tz++)if(need.has(tileKey(tx,tz)))return true;return false;};
  for(const layer of ['median','edge','pedestrian','asphalt']){
    const a=buckets[layer];
    for(let i=0;i<a.length;i+=9){
      if(i%4608===0)await pace();
      const x0=a[i],z0=a[i+2],x1=a[i+3],z1=a[i+5],x2=a[i+6],z2=a[i+8],d=(z1-z2)*(x0-x2)+(x2-x1)*(z0-z2);if(Math.abs(d)<1e-9)continue;
      const bx0=Math.min(x0,x1,x2),bz0=Math.min(z0,z1,z2),bx1=Math.max(x0,x1,x2),bz1=Math.max(z0,z1,z2);if(!near(bx0,bz0,bx1,bz1))continue;
      const inTri=(x,z)=>{const w0=((z1-z2)*(x-x2)+(x2-x1)*(z-z2))/d,w1=((z2-z0)*(x-x2)+(x0-x2)*(z-z2))/d;return w0>=-1e-6&&w1>=-1e-6&&w0+w1<=1+1e-6;};
      paint(Math.floor(bx0/C),Math.floor(bz0/C),Math.floor(bx1/C),Math.floor(bz1/C),layer==='median'?3:1,inTri);
    }
  }
  const inRing=(ring,x,z)=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
  let built=0;
  for(const b of buildings||[]){
    if(++built%512===0)await pace();
    const ring=b.r?.[0];if(!ring||ring.length<3)continue;
    let bx0=Infinity,bz0=Infinity,bx1=-Infinity,bz1=-Infinity;for(const p of ring){bx0=Math.min(bx0,p[0]);bx1=Math.max(bx1,p[0]);bz0=Math.min(bz0,p[1]);bz1=Math.max(bz1,p[1]);}
    if(!near(bx0,bz0,bx1,bz1))continue;
    paint(Math.floor(bx0/C),Math.floor(bz0/C),Math.floor(bx1/C),Math.floor(bz1/C),2,(x,z)=>inRing(ring,x,z));
  }
  // Vòng xoay: bao lồi tim các road junction=roundabout|circular nối nhau qua nút chung.
  const parent=new Map(),find=a=>{while(parent.get(a)!==a){parent.set(a,parent.get(parent.get(a)));a=parent.get(a);}return a;};
  const rb=graph.roads.filter(r=>r.junction==='roundabout'||r.junction==='circular');
  for(const r of rb)for(const n of r.nodes||[])if(!parent.has(n))parent.set(n,n);
  for(const r of rb)for(let k=1;k<(r.nodes||[]).length;k++){const a=find(r.nodes[0]),b=find(r.nodes[k]);if(a!==b)parent.set(a,b);}
  const rbPts=new Map();for(const r of rb){if(!r.nodes?.length)continue;const key=find(r.nodes[0]);if(!rbPts.has(key))rbPts.set(key,[]);rbPts.get(key).push(...roads[r.index].c);}
  const rbHulls=[...rbPts.values()].map(hull2d).filter(h=>h.length>=3);
  const N=3*L,lo=L,hi=2*L,fill=[],tail=[];
  for(const key of [...tiles].sort()){
    await pace();
    const [tx,tz]=key.split(',').map(Number),wx=(tx-1)*T,wz=(tz-1)*T,grid=new Uint8Array(N*N);
    for(let dx=0;dx<3;dx++)for(let dz=0;dz<3;dz++){const tile=raster.get(tileKey(tx+dx-1,tz+dz-1));for(let r=0;r<L;r++)grid.set(tile.subarray(r*L,(r+1)*L),(dz*L+r)*N+dx*L);}
    const seen=new Uint8Array(N*N);
    // Chỉ khởi loang từ ô giữa; thành phần thuộc cửa sổ có ô nhỏ nhất (theo hàng) nằm trong ô giữa → không lấp hai lần.
    for(let sr=lo;sr<hi;sr++)for(let sc=lo;sc<hi;sc++){
      const start=sr*N+sc;
      if((grid[start]&1)||seen[start])continue;
      const comp=[start];seen[start]=1;let open=false,building=false,minId=start;
      for(let q=0;q<comp.length;q++){
        const id=comp[q],r=Math.floor(id/N),cc=id-r*N;
        if(id<minId)minId=id;
        if(grid[id]===2)building=true;
        if(r===0||cc===0||r===N-1||cc===N-1)open=true;
        for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=r+dr,c2=cc+dc;if(rr<0||c2<0||rr>=N||c2>=N)continue;const n=rr*N+c2;if(!(grid[n]&1)&&!seen[n]){seen[n]=1;comp.push(n);}}
      }
      {const mr=Math.floor(minId/N),mc=minId-mr*N;if(mr<lo||mr>=hi||mc<lo||mc>=hi)continue;}
      if(open){out.rejected.open++;continue;}
      if(building){out.rejected.building++;continue;}
      // Nửa bề rộng: BFS (chessboard) từ các ô kề mặt đường vào trong thành phần.
      // level: 255 thuộc thành phần chưa đo, k = khoảng cách (ô) tới mặt đường.
      const level=new Uint8Array(N*N);for(const id of comp)level[id]=255;
      let frontier=[],depth=1;
      for(const id of comp){const r=Math.floor(id/N),cc=id-r*N;let edge=false;for(let dr=-1;dr<=1&&!edge;dr++)for(let dc=-1;dc<=1;dc++)if(grid[(r+dr)*N+cc+dc]&1){edge=true;break;}if(edge){level[id]=1;frontier.push(id);}}
      while(frontier.length){const next=[];for(const id of frontier){const r=Math.floor(id/N),cc=id-r*N;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const n=(r+dr)*N+cc+dc;if(level[n]===255){level[n]=Math.min(254,depth+1);next.push(n);}}}if(next.length)depth++;frontier=next;}
      if(depth*C>HOLE_MAX_HALF_M){out.rejected.wide++;continue;}
      let sx=0,sz=0;for(const id of comp){sx+=wx+((id%N)+.5)*C;sz+=wz+(Math.floor(id/N)+.5)*C;}
      if(rbHulls.some(h=>inRing(h,sx/comp.length,sz/comp.length))){out.rejected.roundabout++;continue;}
      // Ô mảnh (level 1, không có ô level ≥ 2 trong bán kính HOLE_TAIL_CELLS) là đuôi nhọn/khe vụn giữa hai ribbon
      // → lấp asphalt để không thành vệt nhọn; phần lõi và ô kề median sẵn có lấp median (asphalt vẽ đè median, không được lấn).
      const thin=id=>{if(level[id]!==1)return false;const r=Math.floor(id/N),cc=id-r*N;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(grid[(r+dr)*N+cc+dc]===3)return false;for(let dr=-HOLE_TAIL_CELLS;dr<=HOLE_TAIL_CELLS;dr++)for(let dc=-HOLE_TAIL_CELLS;dc<=HOLE_TAIL_CELLS;dc++){const rr=r+dr,c2=cc+dc;if(rr>=0&&c2>=0&&rr<N&&c2<N&&level[rr*N+c2]>=2&&level[rr*N+c2]!==255)return false;}return true;};
      // Lấp: gộp ô liền kề cùng loại theo hàng thành đoạn; chữ nhật median của hàng trước kéo dài xuống khi mọi ô dưới nó
      // là ô lõi của thành phần hoặc ô đã có mặt (nằm dưới asphalt/bó vỉa, không lộ); chữ nhật đuôi chỉ kéo qua ô đuôi.
      // Bớt tam giác. Nở HOLE_DILATE_M.
      const kind=new Map();for(const id of comp)kind.set(id,thin(id)?2:1);   // 1 lõi (median), 2 đuôi mảnh (asphalt)
      const rows=new Map();for(const id of comp){const r=Math.floor(id/N);if(!rows.has(r))rows.set(r,[]);rows.get(r).push(id-r*N);}
      let active=[];const rects=[];
      // Thành phần không có đuôi mảnh mà hộp bao kín toàn ô lõi hoặc ô đã có mặt (nằm dưới asphalt/bó vỉa/vỉa hè, không lộ) → một chữ nhật.
      let bc0=N,bc1=-1,br0=N,br1=-1,hasTail=false;
      for(const id of comp){const r=Math.floor(id/N),cc=id-r*N;if(kind.get(id)===2)hasTail=true;if(cc<bc0)bc0=cc;if(cc>bc1)bc1=cc;if(r<br0)br0=r;if(r>br1)br1=r;}
      let single=!hasTail;
      for(let r=br0;r<=br1&&single;r++)for(let c=bc0;c<=bc1;c++){const id=r*N+c;if(kind.get(id)!==1&&!(grid[id]&1)){single=false;break;}}
      if(single){rects.push({c0:bc0,c1:bc1,r0:br0,r1:br1,thin:false});rows.clear();}
      for(const [r,cols] of [...rows].sort((a,b)=>a[0]-b[0])){
        const used=new Set(),carried=[];
        for(const rect of active){
          if(rect.r1!==r-1)continue;
          let ok=true;for(let c=rect.c0;c<=rect.c1&&ok;c++){const id=r*N+c,k=kind.get(id);ok=rect.thin?k===2:k===1||(k===undefined&&(grid[id]&1));}
          if(!ok)continue;
          rect.r1=r;carried.push(rect);for(let c=rect.c0;c<=rect.c1;c++)if(kind.get(r*N+c)===(rect.thin?2:1))used.add(c);if(rect.thin)out.tailCells+=rect.c1-rect.c0+1;
        }
        const free=cols.filter(c=>!used.has(c)).sort((a,b)=>a-b),next=[...carried];
        for(let i=0;i<free.length;){
          const t=kind.get(r*N+free[i]);let j=i;while(j+1<free.length&&free[j+1]===free[j]+1&&kind.get(r*N+free[j+1])===t)j++;
          const rect={c0:free[i],c1:free[j],r0:r,r1:r,thin:t===2};rects.push(rect);next.push(rect);if(rect.thin)out.tailCells+=j-i+1;
          i=j+1;
        }
        active=next;
      }
      for(const {c0,c1,r0,r1,thin:t} of rects){
        const x0=wx+c0*C-HOLE_DILATE_M,x1=wx+(c1+1)*C+HOLE_DILATE_M,z0=wz+r0*C-HOLE_DILATE_M,z1=wz+(r1+1)*C+HOLE_DILATE_M;
        (t?tail:fill).push(x0,groundY,z0,x0,groundY,z1,x1,groundY,z1,x0,groundY,z0,x1,groundY,z1,x1,groundY,z0);
      }
      out.filled++;out.cells+=comp.length;
    }
  }
  for(const v of fill)buckets.median.push(v);
  for(const v of tail)buckets.asphalt.push(v);
  return out;
}

function hull2d(points){
  const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}

// Lưới tra cứu mặt đường (mảnh + polygon giao lộ) cho sampleY và lọc mép hợp nhất; dựng lười khi gọi lần đầu.
function createSurfaceIndex(data){
  const cell=50,grid=new Map(),key=(gx,gz)=>gx*1048576+gz;
  const insert=(item,x0,z0,x1,z1)=>{for(let gx=Math.floor(x0/cell);gx<=Math.floor(x1/cell);gx++)for(let gz=Math.floor(z0/cell);gz<=Math.floor(z1/cell);gz++){const k=key(gx,gz);let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(item);}};
  for(const list of data.piecesByRoad)for(const piece of list){
    const c=piece.center,hw=piece.halfWidth;
    for(let k=0;k<c.length/3-1;k++){
      const ax=c[k*3],ay=c[k*3+1],az=c[k*3+2],bx=c[k*3+3],by=c[k*3+4],bz=c[k*3+5];
      if(Math.hypot(bx-ax,bz-az)<1e-4)continue;
      insert({type:0,ax,ay,az,bx,by,bz,hw,road:piece.road,group:piece.group},Math.min(ax,bx)-hw,Math.min(az,bz)-hw,Math.max(ax,bx)+hw,Math.max(az,bz)+hw);
    }
  }
  for(const j of data.junctions){
    const xs=j.polygon.map(p=>p[0]),zs=j.polygon.map(p=>p[2]);
    insert({type:1,polygon:j.polygon,y:j.y,node:j.node,group:j.group},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
  }
  const inPolygon=(poly,x,z)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])c=!c;}return c;};
  // y nội suy barycentric trên tam giác quạt của polygon giao lộ (góc polygon mang y profile của từng nhánh).
  const fanY=(poly,x,z)=>{
    const p0=poly[0];
    for(let k=1;k<poly.length-1;k++){
      const p1=poly[k],p2=poly[k+1],det=(p1[2]-p2[2])*(p0[0]-p2[0])+(p2[0]-p1[0])*(p0[2]-p2[2]);if(Math.abs(det)<1e-12)continue;
      const w0=((p1[2]-p2[2])*(x-p2[0])+(p2[0]-p1[0])*(z-p2[2]))/det,w1=((p2[2]-p0[2])*(x-p2[0])+(p0[0]-p2[0])*(z-p2[2]))/det,w2=1-w0-w1;
      if(w0>=-1e-6&&w1>=-1e-6&&w2>=-1e-6)return w0*p0[1]+w1*p1[1]+w2*p2[1];
    }
    return null;
  };
  // Mọi mặt đường chứa (x, z): trả về danh sách y; group ('asphalt' | 'pedestrian') lọc theo nhóm mặt.
  return (x,z,group)=>{
    const out=[];
    for(const item of grid.get(key(Math.floor(x/cell),Math.floor(z/cell)))||[]){
      if(group&&item.group!==group)continue;
      if(item.type===1){if(inPolygon(item.polygon,x,z))out.push(fanY(item.polygon,x,z)??item.y);continue;}
      const sx=item.bx-item.ax,sz=item.bz-item.az,t=Math.min(1,Math.max(0,((x-item.ax)*sx+(z-item.az)*sz)/(sx*sx+sz*sz)));
      if(Math.hypot(item.ax+sx*t-x,item.az+sz*t-z)<=item.hw)out.push(item.ay+(item.by-item.ay)*t);
    }
    return out;
  };
}

export async function createRoadNetwork31({scene,roads,graph,widths,colors,hiddenRoads,buildings=null,yieldMain,onProgress,status={}}){
  if(!graph?.roads||graph.roads.length!==roads.length)throw new Error('ROAD_GRAPH_31 không khả dụng hoặc lệch CITY_DATA.roads');
  status.version=ROAD_NETWORK_31_VERSION;status.state='building';
  const data=await buildRoadNetwork31({roads,graph,widths,hiddenRoads,buildings,yieldMain,onProgress});
  const root=new THREE.Group();root.name='Road network 31 · mặt đường liền mạch';scene.add(root);
  const palette={median:'#55654a',...colors};
  const meshes=[];
  LAYERS.forEach((layer,order)=>{
    const values=data.buckets[layer.key];
    if(!values.length&&layer.elevated)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeVertexNormals();
    const asphalt=layer.kind==='asphalt';
    const material=new THREE.MeshStandardNodeMaterial({color:palette[layer.kind],roughness:asphalt?.76:layer.kind==='median'?.97:.9,metalness:asphalt?.05:0,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:layer.offset,polygonOffsetUnits:layer.offset});
    if(asphalt){
      const aggregate=sin(positionWorld.x.mul(.21).add(sin(positionWorld.z.mul(.17)).mul(2.3))).mul(.5).add(.5);
      const wear=sin(positionWorld.x.add(positionWorld.z).mul(.006)).mul(.5).add(.5);
      material.colorNode=mix(color('#202c2d'),color('#354140'),aggregate.mul(.2).add(wear.mul(.13)));
      material.roughnessNode=mix(float(.68),float(.88),aggregate);
    }
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`Road network 31 · ${layer.label}`;mesh.receiveShadow=true;mesh.renderOrder=order;mesh.userData={layer:layer.key,elevated:layer.elevated};
    root.add(mesh);meshes.push(mesh);
  });
  data.buckets=null;  // giải phóng mảng tạm, hình học đã nằm trong BufferGeometry
  let surfaces=null;
  const surfacesAt=(x,z,group)=>(surfaces||(surfaces=createSurfaceIndex(data)))(x,z,group);
  // y mặt đường tại (x, z); nearY chọn mặt gần nhất khi có nhiều tầng (cầu trên đường). null = không có mặt đường.
  const sampleY=(x,z,nearY)=>{
    const ys=surfacesAt(x,z);if(!ys.length)return null;
    if(nearY===undefined)return Math.max(...ys);
    return ys.reduce((best,y)=>Math.abs(y-nearY)<Math.abs(best-nearY)?y:best,ys[0]);
  };
  // Mép mặt đường đã hợp nhất (cho bước E2): mép trái/phải các mảnh + cạnh góc polygon giao lộ, bỏ đoạn nằm trong mặt
  // đường khác CÙNG NHÓM (vỉa hè footway chạy dọc không xóa mép asphalt: đó chính là chỗ đặt đèn).
  let curbCache=null;
  const curbLines=()=>{
    if(curbCache)return curbCache;
    const lines=[],probe=.3;
    const emitLine=(pts,meta)=>{
      let run=[];
      const close=()=>{if(run.length>=2)lines.push({...meta,points:Float32Array.from(run.flat())});run=[];};
      for(const p of pts){if(p.covered)close();else run.push([p.x,p.y,p.z]);}
      close();
    };
    for(const list of data.piecesByRoad)for(const piece of list){
      for(const [side,sign] of [['left',1],['right',-1]]){
        const v=piece[side],c=piece.center,pts=[];
        for(let k=0;k<v.length/3;k++){
          const ox=v[k*3]-c[k*3],oz=v[k*3+2]-c[k*3+2],ol=Math.hypot(ox,oz)||1,x=v[k*3]+ox/ol*probe,z=v[k*3+2]+oz/ol*probe;
          pts.push({x:v[k*3],y:v[k*3+1],z:v[k*3+2],covered:surfacesAt(x,z,piece.group).some(y=>Math.abs(y-v[k*3+1])<1)});
        }
        emitLine(pts,{kind:'side',road:piece.road,group:piece.group,side,sign});
      }
    }
    for(const j of data.junctions){
      const poly=j.polygon;
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],mx=(a[0]+b[0])/2,mz=(a[2]+b[2])/2,ox=mx-j.x,oz=mz-j.z,ol=Math.hypot(ox,oz)||1;
        const covered=surfacesAt(mx+ox/ol*probe,mz+oz/ol*probe,j.group).some(y=>Math.abs(y-j.y)<1);
        if(!covered)lines.push({kind:'junction-corner',node:j.node,group:j.group,points:Float32Array.of(a[0],a[1],a[2],b[0],b[1],b[2])});
      }
    }
    return curbCache=lines;
  };
  const api={
    version:ROAD_NETWORK_31_VERSION,root,meshes,groundY:data.groundY,
    pieces:roadIndex=>data.piecesByRoad[roadIndex]||[],
    junctions:()=>data.junctions,
    markingPieces:()=>data.markingPieces,
    vertexY:(roadIndex,vertexIndex)=>data.vertexY[roadIndex]?.[vertexIndex]??data.groundY,
    roadY:data.roadY,
    elevatedPieces:()=>data.piecesByRoad.flat().filter(piece=>piece.elevated),
    surfaceYs:(x,z)=>surfacesAt(x,z),  // mọi y mặt đường chồng tại (x, z)
    sampleY,curbLines
  };
  Object.assign(status,{
    state:'ready',miterLimit:MITER_LIMIT,markingGapM:MARKING_GAP_M,medianMaxGapM:MEDIAN_MAX_GAP_M,stats:data.stats,
    layers:meshes.map(mesh=>({name:mesh.name,polygonOffsetFactor:mesh.material.polygonOffsetFactor,polygonOffsetUnits:mesh.material.polygonOffsetUnits,renderOrder:mesh.renderOrder,triangles:mesh.geometry.attributes.position.count/3})),
    drawCalls:meshes.length,source:'ROAD_GRAPH_31 + CITY_DATA.roads (tim đường OSM)',classification:'mép đường suy luận từ bề rộng theo loại/làn, không khảo sát'
  });
  Object.defineProperty(status,'api',{value:api,enumerable:false});
  return api;
}
