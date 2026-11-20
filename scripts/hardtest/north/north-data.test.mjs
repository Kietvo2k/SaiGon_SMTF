import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root,poc,north,seeds,readJson,readText,sha256,sourceHashes,region,targets,clusters,dataset,clipPolyline,lengthOf,geometryEqual,near,normalizePolyline,profileAt,pointInPolygon,project,product,distance,boundaryDistance } from './oracle.mjs';

const D=dataset(), {graph:G,scene:S,mapping:M,source:O,sourceScene:OS}=D;
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/clip-cases.json',import.meta.url)));
const expected=new Map(O.edges.map(e=>[e.id,clipPolyline(e.c)]).filter(([,fs])=>fs.length));
const bySource=new Map(); for(const e of G.edges) {let a=bySource.get(e.source_edge_id);if(!a)bySource.set(e.source_edge_id,a=[]);a.push(e);}
const nodes=new Map(G.nodes.map((n,i)=>[n.id,{...n,index:i}]));
const publicSeed=name=>readJson(`${seeds}public-north/${name}.json`);

test('PUB-01 source bytes và polygon fixture portable được ghim độc lập', async()=>{
  assert.equal(sha256(readFileSync(join(root,poc,'data/road-graph-31.json'))),sourceHashes.graph,'Source graph raw bytes');
  assert.equal(sha256(readFileSync(join(root,poc,'data/scene.json'))),sourceHashes.scene,'Source scene raw bytes');
  const {regionPolygon}=await product('city-region-31.js');assert.deepEqual(region,regionPolygon('bac'));
  assert.equal(expected.size,6815,'Oracle JS phải thấy đủ 6815 source edge');
});
test('PUB-01 manifest xác minh byte và provenance của mọi artifact cần dùng',()=>{
  const manifest=readJson(`${north}manifest.json`);
  assert.equal(manifest.region,'bac');assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.source.graphSha256,sourceHashes.graph);assert.equal(manifest.source.sceneSha256,sourceHashes.scene);
  const paths=new Set(); for(const f of manifest.files) {
    assert.ok(!f.path.includes('..')&&!paths.has(f.path),'Manifest path duy nhất/an toàn');paths.add(f.path);
    assert.ok(existsSync(join(root,f.path)),`Thiếu artifact ${f.path}`);
    const bytes=readFileSync(join(root,f.path));assert.equal(bytes.length,f.bytes,`Byte lệch ${f.path}`);assert.equal(sha256(bytes),f.sha256,`Hash lệch ${f.path}`);
    assert.ok(bytes.length<25*1024**2,'Artifact vượt 25MiB');
  }
  for(const name of ['scene.json','scene.js','road-graph.json','mapping.json','runtime-sidecars.json','heat-history-32.json'])assert.ok(paths.has(north+name),`Manifest thiếu ${name}`);
  assert.ok(![...paths].some(p=>/osm-raw|overture-region|accounts\.json|owners\.json|data\/scene\.js$/.test(p)),'Manifest kéo nguồn classic');
});
test('SIM-01 coverage 6815 nguồn nối tới edge/scene thật, không mapping placeholder',()=>{
  assert.equal(bySource.size,6815,'Coverage graph thật phải đủ 6815 nguồn');
  assert.deepEqual([...bySource.keys()].sort((a,b)=>a-b),[...expected.keys()].sort((a,b)=>a-b),'Tập source edge graph thật');
  for(const [id,fs] of expected) assert.equal(bySource.get(id)?.length,fs.length,`Fragment count source ${id}`);
  for(const id of [1,2038,23217,23534]) assert.ok(bySource.get(id)?.length,`Missing actual source edge ${id}`);
});
test('SIM-01 toàn bộ fragment giữ đỉnh cong, hướng và station nguồn trong 2cm',()=>{
  for(const [id,es] of bySource) {
    const fs=expected.get(id);assert.ok(fs,`Nguồn ngoài polygon ${id}`);
    es.sort((a,b)=>a.fragment-b.fragment);
    assert.equal(es.length,fs.length,`Fragment source ${id}`);
    es.forEach((e,i)=>{const f=fs[i];geometryEqual(e.c,f.c,`Geometry source ${id}/${i}`);near(e.length,lengthOf(e.c),`Length source ${id}/${i}`);near(e.source_station_start_m,f.start_m,'Source station start');near(e.source_station_end_m,f.end_m,'Source station end');});
  }
});
test('PUB-01 closure edgeMap roadMap nodeMap graph scene đặc và hai chiều',()=>{
  assert.ok(G.edges.length>0&&S.roads.length>0&&S.buildings.length>0,'Scene public rỗng');
  assert.equal(G.roads.length,G.edges.length,'Mỗi fragment là một road/edge');assert.equal(S.roads.length,G.roads.length,'Graph scene road count');
  assert.equal(M.edgeMap.length,G.edges.length,'edgeMap phải đóng graph');assert.equal(M.roadMap.length,G.roads.length,'roadMap phải đóng graph');assert.equal(M.nodeMap.length,G.nodes.length,'nodeMap phải đóng graph');
  for(const [table,key] of [[M.edgeMap,'public_edge_id'],[M.roadMap,'public_road_id'],[M.nodeMap,'public_node_id']])assert.equal(new Set(table.map(r=>r[key])).size,table.length,`Duplicate ${key}`);
  G.edges.forEach((e,i)=>{
    assert.equal(e.id,i,'Dense edge id');assert.equal(e.road,i,'Dense fragment road');
    const r=G.roads[i],s=S.roads[i],em=M.edgeMap.find(x=>x.public_edge_id===i),rm=M.roadMap.find(x=>x.public_road_id===i);
    assert.ok(em&&rm,`Mapping không resolve edge ${i}`);assert.equal(em.source_edge_id,e.source_edge_id,'Mapping source edge');assert.equal(rm.source_road_index,O.edges[e.source_edge_id].road,'Mapping source road');
    assert.equal(em.public_road_id,e.road,'Mapping public road');assert.equal(em.source_road_index,O.edges[e.source_edge_id].road,'edgeMap source road');assert.equal(em.fragment,e.fragment,'edgeMap fragment');assert.equal(rm.source_edge_id,e.source_edge_id,'roadMap source edge');assert.equal(rm.fragment,e.fragment,'roadMap fragment');assert.equal(rm.source_id,O.roads[rm.source_road_index].id,'roadMap source way');assert.equal(rm.source_part,O.roads[rm.source_road_index].part,'roadMap source part');assert.equal(em.from,e.from,'edgeMap from');assert.equal(em.to,e.to,'edgeMap to');near(em.source_station_start_m,e.source_station_start_m,'edgeMap station start');near(em.source_station_end_m,e.source_station_end_m,'edgeMap station end');
    assert.equal(r.index,i,'Dense road index');assert.deepEqual(r.edges,[i],'road.edges');assert.equal(e.v0,0);assert.equal(e.v1,s.c.length-1);
    geometryEqual(s.c,e.c,`Scene/edge ${i}`);assert.equal(r.nodes.length,s.c.length,'road.nodes shape song song scene');
    assert.ok(Array.isArray(r.source_shape_node_ids),'source_shape_node_ids bắt buộc');assert.equal(r.source_shape_node_ids.length,s.c.length,'source_shape_node_ids song song scene');
    near(em.length_m,lengthOf(e.c),'Mapping length geometry');
  });
  for(const n of G.nodes) {const m=M.nodeMap.find(r=>r.public_node_id===n.id);assert.ok(m,'nodeMap resolve topology');if(m.source_node_id!=null){assert.equal(O.nodes[m.source_node_index]?.id,m.source_node_id,'source_node_index là topology index');assert.equal(n.id,m.source_node_id,'ID node nguồn');}}
});
test('SIM-01 adjacency reciprocal bearing endpoint identity và boundary không gộp tầng',()=>{
  for(const n of G.nodes) {assert.ok(Array.isArray(n.adj)&&n.adj.length>0,`Adjacency rỗng node ${n.id}`);assert.equal(n.degree,n.adj.length,'Degree bằng adjacency');for(const [ei,end,b] of n.adj){const e=G.edges[ei];assert.ok(e,'Adjacency thiếu edge');assert.equal(end===0?e.from:e.to,n.id,'Adjacency endpoint');assert.ok(Number.isFinite(b),'Adjacency bearing');}}
  for(const e of G.edges) {
    const o=O.edges[e.source_edge_id],f=expected.get(o.id)[e.fragment],c=normalizePolyline(e.c),sourceLen=lengthOf(o.c);
    for(const [side,id,point,station] of [[0,e.from,c[0],f.start_m],[1,e.to,c.at(-1),f.end_m]]) {
      const n=nodes.get(id);assert.ok(n,`Endpoint thiếu ${id}`);near(n.x,point[0],'Endpoint x');near(n.z,point[1],'Endpoint z');
      assert.equal(n.adj.filter(a=>a[0]===e.id&&a[1]===side).length,1,'Reciprocal adjacency');
      let pair=side===0?[c[0],c.find(p=>distance(p,c[0])>1e-8)]:[c.at(-1),c.slice().reverse().find(p=>distance(p,c.at(-1))>1e-8)];
      const bearing=Math.atan2(pair[1][0]-pair[0][0],-(pair[1][1]-pair[0][1]))*180/Math.PI;
      const actual=n.adj.find(a=>a[0]===e.id&&a[1]===side)[2];near(((actual-bearing+540)%360)-180,0,'Bearing source',.11);
      if((side===0&&station<1e-7)||(side===1&&Math.abs(station-sourceLen)<1e-7)){const sourceId=side===0?o.from:o.to,on=O.nodes.find(x=>x.id===sourceId);assert.equal(n.id,sourceId,'Topology endpoint nguồn không đổi ID');near(n.x,on.x,'Source node x',1e-8);near(n.z,on.z,'Source node z',1e-8);if(on.kind==='boundary')assert.equal(n.kind,'boundary','Source boundary giữ kind');}
      else assert.equal(n.kind,'boundary','Cut endpoint boundary');
    }
  }
});
test('SIM-01 metadata, shape IDs, subsection và profile/rampOf bảo toàn theo nguồn',()=>{
  let profiles=0;for(const e of G.edges) {
    assert.ok(Number.isInteger(e.source_edge_id)&&O.edges[e.source_edge_id],`Edge source ID bắt buộc ${e.id}`);
    const o=O.edges[e.source_edge_id],r=G.roads[e.road],sr=O.roads[o.road],f=expected.get(o.id)[e.fragment];
    for(const key of ['oneway','lanes','elevationClass','rampOf'])assert.deepEqual(e[key],o[key],`Edge metadata ${key} source ${o.id}`);
    for(const key of ['id','part','oneway','lanes','layer','maxspeed','junction','covered','indoor','bridge','tunnel','signature','skipRender','hideReason'])assert.deepEqual(r[key],sr[key],`Road metadata ${key} source ${o.id}`);
    const sourcePoints=normalizePolyline(o.c),shapeIds=sr.nodes.slice(o.v0,o.v1+1),stations=[0];for(let i=1;i<sourcePoints.length;i++)stations.push(stations.at(-1)+distance(sourcePoints[i],sourcePoints[i-1]));
    const outPoints=normalizePolyline(e.c);let acc=f.start_m;outPoints.forEach((p,i)=>{if(i)acc+=distance(outPoints[i-1],p);const j=stations.findIndex(s=>Math.abs(s-acc)<.02);if(j>=0){assert.equal(r.nodes[i],shapeIds[j],'Shape ID nguồn không đổi');assert.equal(r.source_shape_node_ids[i],shapeIds[j],'Provenance shape nguồn');}});
    if(o.profile) {profiles++;assert.ok(e.profile?.length>=4,`Profile missing source ${o.id}`);assert.equal(e.y.length,outPoints.length,'y song song c');near(e.profile[0],0,'Profile start',1e-7);near(e.profile.at(-2),e.length,'Profile end');
      for(let i=2;i<e.profile.length;i+=2)assert.ok(e.profile[i]>e.profile[i-2],'Profile station tăng');
      const scale=o.length/lengthOf(o.c);for(let q=0;q<=8;q++){const s=e.length*q/8,expectedY=profileAt(o.profile,(f.start_m+(f.end_m-f.start_m)*q/8)*scale);near(profileAt(e.profile,s),expectedY,`Profile interpolated ${o.id}`);}
      let local=0;outPoints.forEach((p,i)=>{if(i)local+=distance(outPoints[i-1],p);near(e.y[i],profileAt(o.profile,(f.start_m+local)*scale),`Vertex y ${o.id}`);});
    }
  }assert.ok(profiles>=280,'Giữ toàn bộ 280 source profiles có giao dương');
});
test('CAM-01 đủ 12 OSM trong 10 cụm, gồm hai OSM Bac-01',()=>{
  const rows=publicSeed('node_map');assert.equal(rows.length,12,'12 target OSM');
  for(const [id,[osm,cluster]] of Object.entries(targets)){const row=rows.find(r=>r.node_id===id);assert.ok(row,`Missing required node ${id}`);assert.equal(row.osm_id,osm);assert.equal(row.cluster_id,cluster);assert.equal(row.junction_id,cluster);const n=nodes.get(osm);assert.ok(n,`Missing required OSM ${osm}`);near(row.x,n.x,`Seed x ${id}`);near(row.z,n.z,`Seed z ${id}`);}
  assert.deepEqual([...new Set(rows.map(r=>r.cluster_id))].sort(),clusters.slice().sort());
});
test('CAM-01 giữ 10 camera HX và thêm ít nhất 5 camera Bắc, không giới hạn trần',()=>{
  const cams=publicSeed('cameras'),old=readJson(`${seeds}cameras.json`);assert.ok(cams.length>=15,'Camera registry cần tối thiểu 15');
  assert.equal(new Set(cams.map(c=>c.camera_id)).size,cams.length,'Camera ID duy nhất');
  for(let i=1;i<=10;i++){const id=`CAM-HX-${String(i).padStart(3,'0')}`,c=cams.find(c=>c.camera_id===id),o=old.find(c=>c.camera_id===id);assert.ok(c,`Missing old camera ${id}`);assert.equal(c.node_id,o.node_id,'Camera giữ association');}
  for(let i=1;i<=5;i++)assert.ok(cams.some(c=>c.camera_id===`CAM-BAC-${String(i).padStart(3,'0')}`),'Missing north camera');
  for(const c of cams){assert.ok(targets[c.node_id],`Camera node association ${c.camera_id}`);assert.equal(c.junction_id,targets[c.node_id][1],'Camera junction association');assert.equal(c.cluster_id,targets[c.node_id][1],'Camera cluster association');}
});
test('CAM-01 camera pose trong Bắc và phép chiếu độc lập thấy tâm cụm mới',()=>{
  const cams=publicSeed('cameras'),rows=publicSeed('node_map');for(const c of cams){for(const k of ['x','z','height_m','yaw_deg','pitch_deg','fov_deg'])assert.ok(Number.isFinite(c[k]),`Camera pose ${c.camera_id}/${k}`);assert.ok(pointInPolygon([c.x,c.z]),`Camera outside north ${c.camera_id}`);assert.ok(c.height_m>1&&c.height_m<50);assert.ok(c.fov_deg>20&&c.fov_deg<140,'Camera FOV usable');}
  for(const c of cams.filter(c=>c.camera_id.startsWith('CAM-BAC-'))){const row=rows.find(r=>r.node_id===c.node_id);assert.ok(row,'Camera anchor');const n=nodes.get(row.osm_id),p=project(c,[n.x,n.y??G.frame.groundY,n.z]);assert.ok(p.depth>0&&p.x>=0&&p.x<=1280&&p.y>=0&&p.y<=720,`Camera target outside frame ${c.camera_id}: ${JSON.stringify(p)}`);}
});
test('SIM-01 synthetic oracle literal: cong lõm hai đầu ngoài collinear point tự giao đảo hướng',()=>{
  for(const c of fixtures.cases){const fs=clipPolyline(c.c,c.polygon||fixtures.square);assert.equal(fs.length,c.expected.length,c.name);fs.forEach((f,i)=>geometryEqual(f.c,c.expected[i],c.name));}
});
test('SIM-01 helper sản phẩm thực thi fixture synthetic cùng profile cắt hai đầu',()=>{
  const helper=join(root,'scripts/build_public_north.py');assert.ok(existsSync(helper),'Thiếu geometry helper seam');
  mkdirSync(join(root,'work/smtf-agent/logs/north-r2-hardtest'),{recursive:true});const dir=mkdtempSync(join(root,'work/smtf-agent/logs/north-r2-hardtest/synthetic-'));
  for(const c of fixtures.cases){const input=join(dir,`${c.name}.input.json`),output=join(dir,`${c.name}.output.json`);writeFileSync(input,JSON.stringify({schemaVersion:1,polygon:c.polygon||fixtures.square,edges:[{id:7,c:c.c,length:c.length||lengthOf(c.c),profile:c.profile}]}));
    const run=spawnSync(process.env.NORTH_TEST_PYTHON||'python',['-X','utf8',helper,'--input',input,'--output',output],{encoding:'utf8',timeout:30000});writeFileSync(join(dir,`${c.name}.log`),run.stdout+run.stderr);assert.equal(run.error,undefined,'Helper spawn không lỗi');assert.equal(run.status,0,`Helper process ${c.name}: ${run.stderr}`);
    const fs=JSON.parse(readFileSync(output,'utf8')).fragments;assert.equal(fs.length,c.expected.length,c.name);fs.forEach((f,i)=>geometryEqual(f.c,c.expected[i],`Helper ${c.name}`));
    if(c.expectedProfile){assert.equal(fs[0].profile.length,c.expectedProfile.length,'Synthetic profile breakpoints');fs[0].profile.forEach((v,i)=>near(v,c.expectedProfile[i],'Synthetic profile',1e-6));assert.deepEqual(fs[0].y,c.expectedY);}
  }
});
test('PUB-01 polygon helper giữ hole, polygon bao vùng và repair có ghi nhận',()=>{
  const helper=join(root,'scripts/build_public_north.py');assert.ok(existsSync(helper),'Thiếu polygon helper seam');const dir=mkdtempSync(join(root,'work/smtf-agent/logs/north-r2-hardtest/polygon-')),input=join(dir,'input.json'),output=join(dir,'output.json');
  writeFileSync(input,JSON.stringify({schemaVersion:1,polygon:fixtures.square,edges:[],layers:{buildings:Object.values(fixtures.polygons),water:[fixtures.polygons.hole.r],green:[fixtures.polygons.enclosing.r]}}));
  const r=spawnSync(process.env.NORTH_TEST_PYTHON||'python',['-X','utf8',helper,'--input',input,'--output',output],{encoding:'utf8',timeout:30000});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(readFileSync(output,'utf8')),enclosing=out.layers.buildings.filter(b=>b.source_id===1),hole=out.layers.buildings.find(b=>b.source_id===2);
  assert.equal(enclosing.length,1,'Polygon bao toàn vùng không được bỏ');near(Math.abs(area(enclosing[0].r[0])),100,'Enclosing area',1e-8);assert.equal(hole.r.length,2,'Hole không được lấp');near(Math.abs(area(hole.r[1])),16,'Hole area',1e-8);assert.ok(out.repairs.length>0,'Invalid polygon repair phải ghi nhận');
  assert.equal(out.layers.water[0].r.length,2,'Water giữ hole');near(Math.abs(area(out.layers.green[0].r[0])),100,'Green clipped area',1e-8);
});
function area(r){return r.reduce((a,p,i)=>a+p[0]*r[(i+1)%r.length][1]-r[(i+1)%r.length][0]*p[1],0)/2;}

test('PUB-01 buildingMap đóng và metadata/holes/center public bảo toàn',()=>{
  assert.ok(Array.isArray(M.buildingMap),'buildingMap bắt buộc');
  assert.equal(M.buildingMap.length,S.buildings.length,'buildingMap đóng');assert.equal(new Set(S.buildings.map(b=>b.id)).size,S.buildings.length,'Building IDs duy nhất');
  const byId=new Map(S.buildings.map(b=>[b.id,b]));for(const m of M.buildingMap){const b=byId.get(m.public_building_id),s=OS.buildings[m.source_index];assert.ok(b&&s,'Building mapping resolve');assert.equal(s.id,m.source_id,'Building source ID');for(const k of ['h','min','q','origin','source','license'])assert.deepEqual(b[k],s[k],`Building metadata ${k}`);assert.ok(b.r.length>0&&b.r.every(r=>r.length>=3),'Polygon rings hợp lệ');assert.ok(pointInPolygon(b.center,b.r[0]),'Building center thuộc part');assert.ok(b.r.slice(1).every(r=>!pointInPolygon(b.center,r)),'Building center ngoài holes');for(const r of b.r)for(const p of r)assert.ok(pointInPolygon(p)||boundaryDistance(p,region)<=.02,'Building vertex Bắc');}
  let holesChecked=0;for(const [i,s]of OS.buildings.entries())if(s.r.length>1&&s.r.every(r=>r.every(p=>pointInPolygon(p))&&Math.abs(lengthOf([...r,r[0]])-clipPolyline([...r,r[0]]).reduce((n,f)=>n+lengthOf(f.c),0))<1e-6)){
    const parts=M.buildingMap.filter(m=>m.source_index===i).map(m=>byId.get(m.public_building_id));assert.ok(parts.length,'Source building chứa hole phải còn');const actual=parts.flatMap(p=>p.r.slice(1)).reduce((n,r)=>n+Math.abs(area(r)),0),expected=s.r.slice(1).reduce((n,r)=>n+Math.abs(area(r)),0);near(actual,expected,`Source holes area index ${i}`,.020001);holesChecked++;
  }assert.ok(holesChecked>0,'Có source hole thật đã kiểm');
});
test('PUB-01 polygon lõm tạo nhiều part mà không mất ID nguồn',()=>{
  const helper=join(root,'scripts/build_public_north.py');assert.ok(existsSync(helper),'Thiếu multipart helper seam');const dir=mkdtempSync(join(root,'work/smtf-agent/logs/north-r2-hardtest/multipart-')),input=join(dir,'input.json'),output=join(dir,'output.json'),u=fixtures.cases.find(c=>c.name==='concave-two').polygon;
  writeFileSync(input,JSON.stringify({schemaVersion:1,polygon:u,edges:[],layers:{buildings:[{id:99,r:[[[-1,4],[11,4],[11,6],[-1,6]]]}]}}));const r=spawnSync(process.env.NORTH_TEST_PYTHON||'python',['-X','utf8',helper,'--input',input,'--output',output],{encoding:'utf8',timeout:30000});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const parts=JSON.parse(readFileSync(output,'utf8')).layers.buildings;assert.equal(parts.length,2,'Multipart clipping');assert.deepEqual(parts.map(p=>p.source_id),[99,99]);assert.deepEqual(parts.map(p=>p.fragment),[0,1]);for(const p of parts)near(Math.abs(area(p.r[0])),6,'Multipart area',1e-8);
});
test('PUB-01 CLI --out-root hai build độc lập byte giống artifact, lỗi python không ghi file',()=>{
  assert.ok(existsSync(join(root,'scripts/build_public_north.py')),'CLI cần helper trước khi thử out-root');
  assert.ok(readText('scripts/build_public_north.mjs').includes('--out-root'),'CLI cần hỗ trợ out-root trước khi gọi trong harness');
  const dir=mkdtempSync(join(root,'work/smtf-agent/logs/north-r2-hardtest/rebuild-')),out1=join(dir,'one'),out2=join(dir,'two'),builder=join(root,'scripts/build_public_north.mjs');
  const expectedBytes=new Map([...readJson(north+'manifest.json').files.map(f=>f.path),north+'manifest.json'].map(p=>[p,readFileSync(join(root,p))]));
  for(const out of [out1,out2]){const r=spawnSync(process.execPath,[builder,'--out-root',out],{cwd:root,encoding:'utf8',timeout:60000});writeFileSync(join(dir,out===out1?'one.log':'two.log'),r.stdout+r.stderr);assert.equal(r.error,undefined,'Builder spawn');assert.equal(r.status,0,`Builder --out-root: ${r.stderr}`);}
  for(const [path,bytes]of expectedBytes){assert.equal(sha256(readFileSync(join(root,path))),sha256(bytes),`Artifact changed during rebuild ${path}`);assert.equal(sha256(readFileSync(join(out1,path))),sha256(bytes),`Rebuild one ${path}`);assert.equal(sha256(readFileSync(join(out2,path))),sha256(bytes),`Rebuild two ${path}`);}
  const before=sha256(readFileSync(join(out1,north,'manifest.json'))),bad=spawnSync(process.execPath,[builder,'--python','north-python-does-not-exist','--out-root',out1],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(bad.error,undefined);assert.notEqual(bad.status,0,'CLI thiếu interpreter phải đỏ');assert.equal(sha256(readFileSync(join(out1,north,'manifest.json'))),before,'Lỗi interpreter không thay artifact');
});
