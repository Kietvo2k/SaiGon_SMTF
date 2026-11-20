import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicNetwork,product,dataset,readJson,north,clusters,near,profileAt,lengthOf,clipPolyline,normalizePolyline,distance } from './oracle.mjs';

test('SIM-01 consumer thật dùng filter width public sinh lanes states spawn và đúng chiều',async()=>{
  const {net,signalPoints}=await publicNetwork();assert.equal(signalPoints.length,12,'Filter nhận đủ 12 signalPoints');
  for(const k of ['drivableEdges','states','lanes','spawnLanes'])assert.ok(net.stats[k]>0,`Traffic consumer ${k} phải >0`);
  assert.equal(net.stats.onewayLaneViolations,0);assert.equal(net.signalPlan.clusters.length,10);
  for(let l=0;l<net.NL;l++){const e=net.E[net.lanes.edge[l]],dir=net.lanes.dir[l];assert.ok(e.oneway==='yes'?dir===1:e.oneway==='-1'?dir===-1:true,'Lane đúng chiều nguồn');}
});
test('CAM-01 public rows dùng được trên nguồn đầy đủ và clip, mỗi cụm có approach thật',async()=>{
  const {source,sourceScene}=dataset();const full=await publicNetwork({graph:source,roads:sourceScene.roads});assert.deepEqual(full.signalPlan.clusters.map(c=>c.cluster_id).sort(),clusters.slice().sort(),'Config tách khỏi lỗi clip');
  const {net,nodeMap}=await publicNetwork(),{createTrafficGeometry31}=await product('city-traffic-sim-31.js'),{buildJunctionLayout32}=await product('junction-layout-32.js'),{signalApproachesOf32,stopLinesOf32}=await product('traffic-signals-32.js');
  const geo=createTrafficGeometry31(net,{}),layout=buildJunctionLayout32({net,nodeMap,geo}),approaches=signalApproachesOf32(net,geo,nodeMap),lines=stopLinesOf32(net,geo,nodeMap);
  assert.equal(layout.length,10,'Layout đủ 10 cụm');
  for(const id of clusters){const c=net.signalPlan.clusters.find(c=>c.cluster_id===id),members=new Set(c.nodeIds);assert.ok(Array.from(net.lanes.to).some(n=>members.has(n)),`Incoming lanes ${id}`);assert.ok(Array.from(net.lanes.from).some(n=>members.has(n)),`Outgoing lanes ${id}`);assert.ok(approaches.some(a=>a.cluster===id),`Approach thật ${id}`);assert.ok(layout.find(j=>j.id===id)?.arms.some(a=>a.incoming),'Layout incoming');}
  for(const line of lines){assert.ok(!net.signalPlan.internalSt.has(net.lanes.st[line.lane]),'Không vạch bên trong cùng cụm');const s=Math.max(0,net.lanes.length[line.lane]-net.Rz[net.lanes.to[line.lane]]);near(line.y,geo.laneY(line.lane,s)+.15,'Stop line y theo lane profile',1e-5);}
  const bac=net.signalPlan.clusters.find(c=>c.cluster_id==='Bac-01');assert.equal(bac.nodeIds.length,2,'Bac-01 hai topology nodes');
});
test('PUB-01 Three vendor createRoadNetwork31 dựng mesh thật và roadY/laneY giữ profile nguồn',async()=>{
  const {graph,scene,source}=dataset(),THREE=await import('three/webgpu'),{createRoadNetwork31}=await product('city-road-network-31.js'),{widths}=await import('./oracle.mjs');
  const status={},roadNet=await createRoadNetwork31({scene:new THREE.Scene(),roads:scene.roads,graph,widths,hiddenRoads:new Set(),status,colors:{edge:'#8c9188',asphalt:'#293534',pedestrian:'#c8ad84',marking:'#f4db80'},yieldMain:async()=>{}});
  assert.equal(status.state,'ready');assert.ok(roadNet.meshes.some(m=>m.geometry.attributes.position.count>0),'Road meshes phải có đỉnh');
  const {net}=await publicNetwork(),{createTrafficGeometry31}=await product('city-traffic-sim-31.js'),geo=createTrafficGeometry31(net,{});let checked=0;
  for(const e of graph.edges.filter(e=>source.edges[e.source_edge_id].profile)){
    const o=source.edges[e.source_edge_id],f=clipPolyline(o.c)[e.fragment],scale=o.length/lengthOf(o.c),ps=normalizePolyline(e.c);let acc=0;
    for(let i=0;i<ps.length-1;i++){const segment=distance(ps[i],ps[i+1]);for(const t of [0,.5,1])near(roadNet.roadY(e.road,i,t),profileAt(o.profile,(f.start_m+acc+t*segment)*scale),`roadY source ${o.id}`);acc+=segment;}
    for(let l=0;l<net.NL;l++)if(net.lanes.edge[l]===e.id){checked++;for(const q of [0,.25,.5,.75,1]){const s=e.length*q,station=f.start_m+(f.end_m-f.start_m)*(net.lanes.dir[l]>0?q:1-q);near(geo.laneY(l,s),profileAt(o.profile,station*scale),`laneY source ${o.id}`);}}
  }
  assert.ok(graph.edges.some(e=>e.source_edge_id===83&&e.profile),'Edge83 profile giữ');assert.ok(checked>0,'Kiểm lane profile thật');
  for(const m of roadNet.meshes){m.geometry.dispose();m.material.dispose();}
});
test('SIM-01 corridor độc lập một chiều giữ nextSt object và tầng khác ID',async()=>{
  const {buildTrafficNetwork31,createTrafficGeometry31}=await product('city-traffic-sim-31.js');
  const roads=[0,1,2].map(i=>({index:i,id:100+i,type:'tertiary',name:'Test',nodes:i<2?[i,i+1]:[3,4],edges:[i]}));
  const edges=[{id:0,from:0,to:1,road:0,c:[0,0,50,0],length:50,oneway:'yes',lanes:1,profile:[0,2,50,7]},{id:1,from:1,to:2,road:1,c:[50,0,100,0],length:50,oneway:'yes',lanes:1},{id:2,from:3,to:4,road:2,c:[50,0,50,100],length:100,oneway:'yes',lanes:1,profile:[0,12,100,12]}];
  const nodes=[{id:0,x:0,z:0,kind:'boundary',adj:[[0,0,90]]},{id:1,x:50,z:0,kind:'connector',adj:[[0,1,-90],[1,0,90]]},{id:2,x:100,z:0,kind:'boundary',adj:[[1,1,-90]]},{id:3,x:50,z:0,kind:'boundary',adj:[[2,0,180]]},{id:4,x:50,z:100,kind:'boundary',adj:[[2,1,0]]}];
  const net=buildTrafficNetwork31({graph:{nodes,roads,edges,frame:{groundY:1}},roads,widthOf:()=>8,drawn:()=>true});assert.equal(net.stats.onewayLaneViolations,0);assert.equal(net.NL,3);assert.ok(net.nextSt[0].some(row=>row.st===2),'nextSt object tới edge1');assert.ok(!net.nextSt[0].some(row=>row.st===4),'Không nối qua giao hình học khác tầng');const geo=createTrafficGeometry31(net,{});near(geo.laneY(0,25),4.5,'Synthetic laneY',1e-6);
});
