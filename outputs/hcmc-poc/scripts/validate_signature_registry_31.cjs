// Validator registry signature 31A: kiểm dữ liệu với scene.js/osm-raw.json và kiểm API ES module.
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};

function windowPayload(file,name){
  const text=read(file),prefix=`window.${name}=`;
  assert(text.startsWith(prefix),`${file} phải bắt đầu bằng ${prefix}`);
  return JSON.parse(text.slice(prefix.length).trim().replace(/;$/,''));
}

const registry=JSON.parse(read('data/signature-registry-31.json'));
const scene=windowPayload('data/scene.js','CITY_DATA');
const osmWays=new Set(JSON.parse(read('data/osm-raw.json')).elements.filter(e=>e.type==='way').map(e=>e.id));
const sceneBuildings=new Set(scene.buildings.map(b=>Number(b.id)));
const sceneRoads=new Set(scene.roads.map(r=>Number(r.id)));
const entries=registry.entries;
const byKey=new Map(entries.map(e=>[e.key,e]));
const group=name=>entries.filter(e=>e.group===name);
const idsOf=(list,kinds)=>new Set(list.filter(e=>kinds.includes(e.kind)).flatMap(e=>e.ids));
const BUILDING_KINDS=['building'],WAY_KINDS=['bridge','road'];
const VIETNAMESE=/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i;

check('registry có version 31A, provenance và wrapper .js trùng JSON',()=>{
  assert.equal(registry.version,'31A');
  assert(registry.generated?.script);
  assert(registry.generated.inputs.length>=8);
  for(const input of registry.generated.inputs){
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,input.path)).toString('latin1').replace(/\r\n/g,'\n'),'latin1').digest('hex');
    assert.equal(actual,input.sha256,`${input.path} đã đổi sau khi dựng registry: chạy lại build_signature_registry_31.py`);
  }
  assert.deepStrictEqual(windowPayload('data/signature-registry-31.js','SIGNATURE_REGISTRY_31'),registry);
});

check('mỗi mục có key duy nhất, kind hợp lệ, ids số nguyên, source và reason tiếng Việt',()=>{
  assert.equal(byKey.size,entries.length,'key bị trùng');
  for(const e of entries){
    assert(['building','bridge','road','zone','module'].includes(e.kind),`${e.key}: kind ${e.kind}`);
    assert(Array.isArray(e.ids)&&e.ids.every(Number.isSafeInteger),`${e.key}: ids`);
    assert(e.kind==='module'||e.kind==='zone'||e.ids.length>0,`${e.key}: thiếu ids`);
    assert(typeof e.source==='string'&&e.source.length>4,`${e.key}: thiếu source`);
    assert(VIETNAMESE.test(e.reason||''),`${e.key}: reason phải là tiếng Việt có dấu`);
  }
});

check('mọi building id tồn tại trong scene.js, mọi way id tồn tại trong D.roads hoặc osm-raw',()=>{
  for(const id of idsOf(entries,BUILDING_KINDS))assert(sceneBuildings.has(id),`building ${id} không có trong scene.js`);
  for(const id of idsOf(entries,WAY_KINDS))assert(sceneRoads.has(id)||osmWays.has(id),`way ${id} không có trong scene/osm-raw`);
});

check('đủ các nhóm tối thiểu',()=>{
  const has=(name,kinds,ids)=>{const found=idsOf(group(name),kinds);for(const id of ids)assert(found.has(id),`${name} thiếu ${id}`);};
  has('hero_envelopes',BUILDING_KINDS,[801710792,2000032897,39598465]);
  has('ba_son_bridge',WAY_KINDS,[321564421,321564423]);
  assert(group('ba_son_bridge').some(e=>e.kind==='module'),'thiếu module kết cấu Ba Son');
  has('bach_dang_footbridge',WAY_KINDS,[1504289918,1504289919,1504289920,1504289921]);
  const bridgeNames=group('river_bridges').map(e=>e.label);
  for(const name of ['Cầu Thủ Thiêm','Cầu Sài Gòn','Cầu Khánh Hội','Cầu Nguyễn Văn Cừ','Cầu Chữ Y','Cầu Mống'])assert(bridgeNames.includes(name),`thiếu ${name}`);
  assert(Array.isArray(registry.unresolved),'thiếu danh sách unresolved');
  has('marina',BUILDING_KINDS,[1432358258,1432358259,1432358260,1151026864,1151026865,1151026866,1151026867]);
  has('hero_corridor',BUILDING_KINDS,[801710792,2000032897,39598465]);
  has('hero_corridor',WAY_KINDS,[35112941,35114970,287132223,1278461438,1278461439,1343964589]);
  assert(group('hero_corridor').some(e=>e.kind==='zone'),'thiếu vùng corridor');
  assert(idsOf(group('identity_facades_30'),BUILDING_KINDS).size>=10);
  assert(idsOf(group('photo_facades'),BUILDING_KINDS).size>=20);
  has('photo_facades',BUILDING_KINDS,[165491082]);
  const labels=group('places').map(e=>e.label);
  for(const label of ['BITEXCO','NHÀ HÁT THÀNH PHỐ','BẾN BẠCH ĐẰNG','NGUYỄN HUỆ','LANDMARK 81','CẦU BA SON'])assert(labels.includes(label),`places thiếu ${label}`);
  has('places',BUILDING_KINDS,[801710792]);
  const bitexco=group('places').find(e=>e.label==='BITEXCO');
  assert(bitexco.kind==='building'&&bitexco.ids.length>0&&bitexco.method,'Bitexco phải có footprint và phương pháp');
  for(const key of ['zone-hero-corridor','zone-nguyen-hue']){
    const zone=byKey.get(key);assert(zone,`thiếu ${key}`);
    for(const kind of ['tree','lamp'])assert(zone.zone.protects.includes(kind),`${key} phải giữ ${kind}`);
  }
  assert(group('extra').length>=3,'thiếu signature bổ sung');
});

check('zone hợp lệ: polygon ≥3 đỉnh, diện tích dương, nằm trong bbox',()=>{
  const zones=entries.filter(e=>e.zone);assert(zones.length>=2);
  for(const e of zones){
    const {polygons,bbox,protects}=e.zone;
    assert(Array.isArray(protects)&&polygons.length>0&&bbox.length===4,e.key);
    for(const ring of polygons){
      assert(ring.length>=3,`${e.key}: polygon < 3 đỉnh`);
      let area=0;
      ring.forEach((p,i)=>{
        assert(p.length===2&&p.every(Number.isFinite),`${e.key}: tọa độ lỗi`);
        assert(p[0]>=bbox[0]-1e-6&&p[1]>=bbox[1]-1e-6&&p[0]<=bbox[2]+1e-6&&p[1]<=bbox[3]+1e-6,`${e.key}: đỉnh ngoài bbox`);
        const q=ring[(i+1)%ring.length];area+=p[0]*q[1]-q[0]*p[1];
      });
      assert(Math.abs(area)>1,`${e.key}: diện tích bằng 0`);
    }
  }
});

(async()=>{
  // Nạp qua data: URL để Node luôn coi là ES module như trình duyệt (không phụ thuộc package.json bên ngoài).
  const api=await import(`data:text/javascript;base64,${Buffer.from(read('signature-registry-31.js')).toString('base64')}`);
  check('API tra cứu building/way đúng cho hero và không nhận nhầm',()=>{
    const reg=api.loadSignatureRegistry(registry);
    for(const id of [801710792,2000032897,39598465]){assert(reg.isSignatureBuilding(id));assert(api.isSignatureBuilding(String(id)));}
    assert(!api.isSignatureBuilding(35114136));
    assert(api.isSignatureWay(321564421)&&api.isSignatureWay(1504289918));
    assert(!api.isSignatureWay(32575792));
    const ids=api.signatureBuildingIds();
    assert(ids.length===idsOf(entries,BUILDING_KINDS).size&&ids.includes(801710792));
  });
  check('inProtectedZone đúng cho Nguyễn Huệ/corridor và sai cho điểm xa',()=>{
    const road=scene.roads.find(r=>r.id===341504312),mid=road.c[Math.floor(road.c.length/2)];
    for(const kind of ['tree','lamp','any'])assert(api.inProtectedZone(mid[0],mid[1],kind),`Nguyễn Huệ ${kind}`);
    assert(api.inProtectedZone(-924,249),'trọng tâm corridor Lam Sơn');
    assert(!api.inProtectedZone(3000,3000));
    assert(!api.inProtectedZone(1137,-1758,'tree'),'Landmark 81 không phải vùng giữ cây');
    assert.throws(()=>api.inProtectedZone(0,0,'car'));
  });
  check('auditSignatureVisibility phát hiện đối tượng registry bị ẩn',()=>{
    const buildings=api.signatureBuildingIds(),ways=api.signatureWayIds();
    const full=api.auditSignatureVisibility({buildings,ways});
    assert.equal(full.complete,true);assert.equal(full.visible,full.total);
    const partial=api.auditSignatureVisibility({buildings:buildings.filter(id=>id!==801710792),ways});
    assert.equal(partial.complete,false);assert.deepStrictEqual(partial.missing.buildings,[801710792]);
    assert.equal(partial.visible,partial.total-1);
    // Toàn bộ scene hiển thị phải đạt 100 %: way không có trong D.roads (chỉ có trong osm-raw) không được tính là bị ẩn.
    const scenewide=api.auditSignatureVisibility({buildings:scene.buildings.map(b=>b.id),ways:scene.roads.map(r=>r.id)});
    assert.equal(scenewide.complete,true,`scene đầy đủ vẫn thiếu: ${JSON.stringify(scenewide.missing)}`);
    assert(api.isSignatureWay(1504289918),'way cầu đi bộ ngoài D.roads vẫn là signature');
  });
  const counts=Object.fromEntries([...new Set(entries.map(e=>e.group))].map(name=>[name,group(name).length]));
  console.log(JSON.stringify({suite:'signature-registry-31',passed:checks.length,checks,entries:entries.length,buildings:idsOf(entries,BUILDING_KINDS).size,ways:idsOf(entries,WAY_KINDS).size,groups:counts,unresolved:registry.unresolved.length},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
