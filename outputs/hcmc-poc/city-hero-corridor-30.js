import * as THREE from 'three/webgpu';

/*
 * Hero Corridor 30B
 *
 * A compact WebGPU-native port of the sourced Opera House / Continental /
 * Caravelle work from batches 20A–20B. It deliberately renders only in the
 * Lam Son–Dong Khoi view so city-scale performance and evidence semantics stay
 * intact. Photo planes are site images; envelope depth and street furniture
 * remain explicit approximations until survey/BIM data replaces them.
 */

const FRAMES={
  opera:{key:'opera',name:'Nhà hát Thành phố',buildingId:801710792,a:[-938.46,265.06],b:[-909.32,233.2],normal:[-.7379035723,-.674906155],width:43.176,height:26,asset:'assets/hero20/opera-arch-rectified-hd.jpg',source:'https://commons.wikimedia.org/wiki/File:Ho_Chi_Minh_City_Opera_House.jpg',author:'HĐ',license:'CC BY-SA 4.0'},
  continental:{key:'continental',name:'Hotel Continental Saigon',buildingId:2000032897,a:[-926.99,209.24],b:[-976.97,262.38],normal:[.7284333606,.685116661],width:72.951,height:24,asset:'assets/hero20b/continental-facade-rectified-hd.jpg',source:'https://commons.wikimedia.org/wiki/File:Hotel_Continental_Saigon_(53668610570).jpg',author:'Hans Brian Brandsberg Berg',license:'CC BY 2.0'},
  caravelle:{key:'caravelle',name:'Caravelle Saigon',buildingId:39598465,a:[-901.13,329.88],b:[-876.42,302.54],normal:[-.7418892519,-.6705224365],width:36.852,height:30,asset:'assets/hero20b/caravelle-wing-rectified-hd.jpg',source:'https://commons.wikimedia.org/wiki/File:Caravelle_Hotel_Saigon_2013-02.jpg',author:'BaonguyenCaravelas',license:'CC BY-SA 4.0'}
};

const dummy=new THREE.Object3D();
const frameOf=record=>({
  ...record,
  x:(record.a[0]+record.b[0])*.5,
  z:(record.a[1]+record.b[1])*.5,
  angle:Math.atan2(record.normal[0],record.normal[1])
});

function instanced(parent,name,geometry,material,items){
  const mesh=new THREE.InstancedMesh(geometry,material,Math.max(1,items.length));
  mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;
  items.forEach((item,index)=>{
    dummy.position.set(item.x,item.y,item.z);
    dummy.rotation.set(item.rx||0,item.ry||0,item.rz||0);
    dummy.scale.set(item.sx||1,item.sy||1,item.sz||1);
    dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true;parent.add(mesh);return mesh;
}

function ribbon(points,width,y,tileMeters=6){
  const positions=[],uv=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.05)continue;
    const ox=-dz/length*width*.5,oz=dx/length*width*.5;
    const vertices=[[a[0]+ox,y,a[1]+oz],[b[0]+ox,y,b[1]+oz],[a[0]-ox,y,a[1]-oz],[b[0]-ox,y,b[1]-oz]];
    const uvs=[[0,0],[0,length/tileMeters],[width/tileMeters,0],[width/tileMeters,length/tileMeters]];
    for(const index of [0,2,1,1,2,3]){positions.push(...vertices[index]);uv.push(...uvs[index]);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();
  return geometry;
}

// Bước G 31A: phép thử "cột đèn chạm mặt asphalt/giao lộ của city-road-network-31" trong một bbox (chỉ mảnh nhóm
// asphalt mặt đất, như qa-street-furniture-31). Cột bán kính r: thử tâm + 4 điểm trên chu vi.
function asphaltProbe(net,roadCount,[x0,z0,x1,z1]){
  const quads=[],polys=[],inside=(poly,x,z)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
  const near=pts=>pts.some(([x,z])=>x>=x0&&x<=x1&&z>=z0&&z<=z1);
  for(let r=0;r<roadCount;r++)for(const piece of net.pieces(r)){
    if(piece.group!=='asphalt'||piece.elevated)continue;
    const L=piece.left,R=piece.right;
    for(let k=0;k+1<L.length/3;k++){const q=[[L[k*3],L[k*3+2]],[R[k*3],R[k*3+2]],[R[k*3+3],R[k*3+5]],[L[k*3+3],L[k*3+5]]];if(near(q))quads.push(q);}
  }
  for(const j of net.junctions())if(j.group==='asphalt'&&!j.elevated){const poly=j.polygon.map(p=>[p[0],p[2]]);if(near(poly))polys.push(poly);}
  const hit=(x,z)=>quads.some(q=>inside(q,x,z))||polys.some(q=>inside(q,x,z));
  return (x,z,r=.3)=>[[0,0],[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dz])=>hit(x+dx,z+dz));
}

// Bước G3: phép thử "cột đèn nằm trong (hoặc sát mép) footprint công trình" trong một bbox. Cột bán kính r: thử tâm + 4 điểm
// trên chu vi trong polygon, hoặc tâm cách cạnh polygon < r. Footprint ẩn ở bước C (hiddenByCorrection) do app lọc trước.
function footprintProbe(buildings,[x0,z0,x1,z1]){
  const rings=[];
  for(const building of buildings){
    const ring=building.r?.[0];if(!ring?.length)continue;
    let bx0=Infinity,bz0=Infinity,bx1=-Infinity,bz1=-Infinity;
    for(const [x,z] of ring){bx0=Math.min(bx0,x);bz0=Math.min(bz0,z);bx1=Math.max(bx1,x);bz1=Math.max(bz1,z);}
    if(bx1>=x0&&bx0<=x1&&bz1>=z0&&bz0<=z1)rings.push({ring,box:[bx0,bz0,bx1,bz1]});
  }
  const inside=(ring,x,z)=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
  const edgeDistance=(ring,x,z)=>{let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],sx=b[0]-a[0],sz=b[1]-a[1],l=sx*sx+sz*sz,t=l?Math.max(0,Math.min(1,((x-a[0])*sx+(z-a[1])*sz)/l)):0;best=Math.min(best,Math.hypot(a[0]+sx*t-x,a[1]+sz*t-z));}return best;};
  return (x,z,r=.3)=>rings.some(({ring,box})=>x>=box[0]-r&&x<=box[2]+r&&z>=box[1]-r&&z<=box[3]+r&&([[0,0],[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dz])=>inside(ring,x+dx,z+dz))||edgeDistance(ring,x,z)<r));
}

export function createHeroCorridor30({scene,roads,nightLevel,roadNetwork=null,buildings=[],status={}}){
  const root=new THREE.Group();root.name='Hero Corridor 30B · sourced identity geometry + CC0 PBR public realm';root.visible=false;scene.add(root);
  const architecture=new THREE.Group();architecture.name='Sourced landmark envelopes';root.add(architecture);
  const publicRealm=new THREE.Group();publicRealm.name='OSM-aligned public realm proxy';root.add(publicRealm);
  const resources={textures:[],materials:[],geometries:[]};
  const material=options=>{const value=new THREE.MeshStandardNodeMaterial(options);resources.materials.push(value);return value;};
  const cream=material({color:'#d9ccb7',roughness:.73,metalness:.015});
  const trim=material({color:'#f1eadc',roughness:.64,metalness:.018});
  const stone=material({color:'#9c968b',roughness:.92,metalness:0});
  const slate=material({color:'#344148',roughness:.73,metalness:.12});
  const glass=material({color:'#344b58',roughness:.2,metalness:.42});
  const dark=material({color:'#28363a',roughness:.36,metalness:.62});
  const asphalt=material({color:'#858a8a',roughness:.94,metalness:.015});
  const paving=material({color:'#cec7ba',roughness:.93,metalness:0});
  const marking=material({color:'#e9e7dc',roughness:.78,metalness:0});
  const warm=material({color:'#f7dcaa',emissive:'#f09b42',emissiveIntensity:.08,roughness:.32,metalness:.1});

  function mesh(parent,geometry,mat,name){
    resources.geometries.push(geometry);const value=new THREE.Mesh(geometry,mat);
    value.name=name;value.castShadow=true;value.receiveShadow=true;parent.add(value);return value;
  }
  function box(parent,name,w,h,d,x,y,z,mat=cream){const value=mesh(parent,new THREE.BoxGeometry(w,h,d),mat,name);value.position.set(x,y,z);return value;}
  function localRoot(frame,name){const value=new THREE.Group();value.name=name;value.position.set(frame.x,1.65,frame.z);value.rotation.y=frame.angle;architecture.add(value);return value;}
  function loadPhoto(frame,materialValue,onReady){
    new THREE.TextureLoader().load(frame.asset,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
      texture.anisotropy=8;resources.textures.push(texture);materialValue.map=texture;materialValue.needsUpdate=true;
      status.loadedPhotos=(status.loadedPhotos||0)+1;onReady?.();
    },undefined,()=>{(status.errors||(status.errors=[])).push(`Không nạp được ${frame.asset}`);});
  }
  function loadPbrSet(materialValue,prefix,normalStrength=.42){
    const loader=new THREE.TextureLoader(),base=`assets/pbr30/${prefix}`;
    const jobs=[
      ['map',`${base}_diff_1k.jpg`,true],
      ['normalMap',`${base}_nor_gl_1k.jpg`,false],
      ['roughnessMap',`${base}_rough_1k.jpg`,false],
      ['aoMap',`${base}_ao_1k.jpg`,false]
    ];
    for(const [slot,url,srgb] of jobs)loader.load(url,texture=>{
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
      if(srgb)texture.colorSpace=THREE.SRGBColorSpace;
      if(slot==='aoMap')texture.channel=1;
      resources.textures.push(texture);materialValue[slot]=texture;
      if(slot==='normalMap')materialValue.normalScale=new THREE.Vector2(normalStrength,normalStrength);
      if(slot==='aoMap')materialValue.aoMapIntensity=.72;
      materialValue.needsUpdate=true;status.loadedPbrMaps=(status.loadedPbrMaps||0)+1;
    },undefined,()=>{(status.errors||(status.errors=[])).push(`Không nạp được ${url}`);});
  }
  loadPbrSet(asphalt,'asphalt',.34);
  loadPbrSet(paving,'pavement',.28);

  const opera=frameOf(FRAMES.opera),operaRoot=localRoot(opera,'Opera House · sourced hero envelope');
  box(operaRoot,'Opera main volume',opera.width,18.4,13.5,0,9.2,-5.9,cream);
  box(operaRoot,'Opera central projection',15.5,22.4,1.55,0,11.2,.55,cream);
  box(operaRoot,'Opera mansard',opera.width+.2,7.1,.82,0,21.95,.58,slate);
  box(operaRoot,'Opera plinth',opera.width+1,.8,1.25,0,.4,.2,stone);
  box(operaRoot,'Opera cornice',opera.width+.8,.55,14.2,0,18.15,-5.9,trim);
  box(operaRoot,'Opera balcony',10.7,.42,2.4,0,8.1,1.55,stone);
  const operaPhotoMaterial=material({color:'#f5eee3',roughness:.7,metalness:0,polygonOffset:true,polygonOffsetFactor:-2});
  const operaPhoto=mesh(operaRoot,new THREE.PlaneGeometry(14.5,20.4),operaPhotoMaterial,'Opera sourced identity patch');operaPhoto.position.set(0,11.7,1.39);
  loadPhoto(opera,operaPhotoMaterial);
  const columns=[-5.8,-4.55,4.55,5.8].map(x=>({x,y:7.25,z:1.72,sx:.48,sy:12.5,sz:.48}));
  instanced(operaRoot,'Opera facade columns',new THREE.CylinderGeometry(1,1,1,16),trim,columns);
  const operaRelief=[];for(const x of [-20.2,-8.1,8.1,20.2])operaRelief.push({x,y:8.55,z:1.12,sx:.68,sy:16.5,sz:.72});
  for(const y of [5.8,11.2,17.5])operaRelief.push({x:0,y,z:1.2,sx:opera.width*.94,sy:.24,sz:.34});
  instanced(operaRoot,'Opera facade relief',new THREE.BoxGeometry(1,1,1),trim,operaRelief);

  const continental=frameOf(FRAMES.continental),continentalRoot=localRoot(continental,'Continental · sourced hero envelope');
  box(continentalRoot,'Continental main',continental.width,22.6,15,0,11.3,-6.8,cream);
  box(continentalRoot,'Continental plinth',continental.width+.5,1.1,15.6,0,.55,-6.8,stone);
  box(continentalRoot,'Continental cornice',continental.width+.7,.55,15.7,0,21.6,-6.8,trim);
  const continentalPhotoMaterial=material({color:'#f8f1e6',roughness:.64,polygonOffset:true,polygonOffsetFactor:-2});
  const continentalPhoto=mesh(continentalRoot,new THREE.PlaneGeometry(continental.width*.93,20.2),continentalPhotoMaterial,'Continental sourced facade');continentalPhoto.position.set(0,11.2,1.05);
  loadPhoto(continental,continentalPhotoMaterial);
  const continentalRelief=[];for(let x=-continental.width*.44;x<=continental.width*.44;x+=continental.width/10)continentalRelief.push({x,y:12.3,z:1.25,sx:.38,sy:18.4,sz:.42});
  for(const y of [8.3,15.4,21])continentalRelief.push({x:0,y,z:1.3,sx:continental.width*.94,sy:.26,sz:.35});
  instanced(continentalRoot,'Continental facade relief',new THREE.BoxGeometry(1,1,1),trim,continentalRelief);

  const caravelle=frameOf(FRAMES.caravelle),caravelleRoot=localRoot(caravelle,'Caravelle · sourced hero envelope');
  box(caravelleRoot,'Caravelle low wing',caravelle.width,28.4,18,0,14.2,-7.8,cream);
  const caravellePhotoMaterial=material({color:'#d8b99e',roughness:.59,polygonOffset:true,polygonOffsetFactor:-2});
  const caravellePhoto=mesh(caravelleRoot,new THREE.PlaneGeometry(caravelle.width*.95,26.3),caravellePhotoMaterial,'Caravelle sourced low wing');caravellePhoto.position.set(0,14.2,1.25);
  loadPhoto(caravelle,caravellePhotoMaterial);
  const towerHeight=76.8;
  box(caravelleRoot,'Caravelle tower · 24-storey display rule',29,towerHeight,20,2,towerHeight*.5,-17,cream).userData={storeys:24,surveyed:false};
  const bays=[];for(let floor=1;floor<23;floor++)for(let column=-4;column<=4;column++)bays.push({x:2+column*2.65,y:4.1+floor*3.05,z:-6.88,sx:1.85,sy:1.65,sz:.16});
  instanced(caravelleRoot,'Caravelle tower windows',new THREE.BoxGeometry(1,1,1),glass,bays);
  const bands=[];for(let floor=3;floor<23;floor+=3)bands.push({x:2,y:3.5+floor*3.05,z:-6.5,sx:29.5,sy:.25,sz:.7});
  instanced(caravelleRoot,'Caravelle balcony bands',new THREE.BoxGeometry(1,1,1),trim,bands);
  box(caravelleRoot,'Caravelle crown',31,5.8,21.5,2,74,-17,cream);

  const roadIds=new Set([35112941,35114970,287132223,1278461438,1278461439,1343964589]);
  const corridorRoads=roads.filter(road=>roadIds.has(road.id));
  for(const road of corridorRoads){
    mesh(publicRealm,ribbon(road.c,roadIds.has(road.id)&&road.id<100000000?12.5:14,1.36,1.8),paving,`Hero corridor curb ${road.id}`);
    mesh(publicRealm,ribbon(road.c,road.id<100000000?9.5:11,1.43,30),asphalt,`Hero corridor road ${road.id}`);
    mesh(publicRealm,ribbon(road.c,.15,1.51),marking,`Hero corridor centreline ${road.id}`);
  }
  const furniture=[];
  // Bước G 31A: đèn đặt ±7 m theo tim, nhưng mặt đường 31 (bề rộng theo làn) và polygon giao lộ có thể phủ tới đó. Đèn
  // chạm asphalt được dời tới ô trống gần nhất (ra mép ngoài cùng phía ≤ +6 m, trượt dọc ≤ 8 m) — giữ số lượng và phía.
  const corridorPts=corridorRoads.flatMap(road=>road.c),pad=30,xs=corridorPts.map(p=>p[0]),zs=corridorPts.map(p=>p[1]);
  const onAsphalt=roadNetwork&&corridorPts.length?asphaltProbe(roadNetwork,roads.length,[Math.min(...xs)-pad,Math.min(...zs)-pad,Math.max(...xs)+pad,Math.max(...zs)+pad]):()=>false;
  // Bước G3: thêm né footprint công trình (trước đây chỉ né asphalt/giao lộ nên có cột bị dời vào trong nhà). Cột đứng trong
  // footprint hoặc cách mép < 0,6 m bị coi là bị chặn.
  const inBuilding=buildings.length&&corridorPts.length?footprintProbe(buildings,[Math.min(...xs)-pad,Math.min(...zs)-pad,Math.max(...xs)+pad,Math.max(...zs)+pad]):()=>false;
  // Ô ứng viên theo độ dời tăng dần: ra mép ngoài 7…13 m, rồi trượt dọc tim ≤ 8 m (mép giao lộ) — nhịp ~28 m giữ nguyên.
  // Nếu cả vùng đó bị asphalt/footprint chặn thì mở rộng tìm ra mép ngoài ≤ 20 m, trượt dọc ≤ 16 m (ô mở rộng xếp sau).
  const lampSlots=[],extendedSlots=[];
  for(let out=7;out<=20;out+=.25)for(let along=0;along<=16;along+=.5)for(const sign of along?[1,-1]:[1])(out<=13&&along<=8?lampSlots:extendedSlots).push([out,along*sign]);
  const byDisplacement=(a,b)=>(a[0]-7)+Math.abs(a[1])-((b[0]-7)+Math.abs(b[1]))||Math.abs(a[1])-Math.abs(b[1])||a[1]-b[1]||a[0]-b[0];
  lampSlots.sort(byDisplacement);extendedSlots.sort(byDisplacement);
  lampSlots.push(...extendedSlots);
  const blocked=(x,z)=>onAsphalt(x,z)||inBuilding(x,z,.6);
  let movedLamps=0,blockedLamps=0;
  for(const road of corridorRoads){
    for(let i=0;i<road.c.length-1;i++){
      const a=road.c[i],b=road.c[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<8)continue;
      const count=Math.max(1,Math.floor(length/28)),nx=-dz/length,nz=dx/length;
      for(let n=0;n<count;n++){
        const t=(n+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t,side=n%2?1:-1;
        const ux=dx/length,uz=dz/length,best=lampSlots.find(([out,along])=>!blocked(x+nx*out*side+ux*along,z+nz*out*side+uz*along));
        // Không tìm được ô trống: bỏ cột này (còn hơn cắm cột vào lòng đường hoặc trong nhà); ghi vào status.lamps.dropped.
        if(!best){blockedLamps++;continue;}
        const [out,along]=best;if(out!==7||along!==0)movedLamps++;
        furniture.push({x:x+nx*out*side+ux*along,y:3.5,z:z+nz*out*side+uz*along,sx:.11,sy:7,sz:.11});
      }
    }
  }
  status.lamps={count:furniture.length,moved:movedLamps,dropped:blockedLamps,rule:'±7 m theo tim; chạm asphalt/giao lộ 31 hoặc footprint công trình thì dời ít nhất (ra mép ngoài ≤ +13 m, trượt dọc ≤ 16 m); không còn ô trống thì bỏ cột đó'};
  instanced(publicRealm,'Lam Son street lamps',new THREE.CylinderGeometry(1,1,1,9),dark,furniture);
  instanced(publicRealm,'Lam Son lamp glow',new THREE.SphereGeometry(1,10,8),warm,furniture.map(item=>({...item,y:7.15,sx:.34,sy:.34,sz:.34})));

  const crosswalk=[];
  for(let x=-16;x<=16;x+=2.35)crosswalk.push({x:-917+x*.72,y:1.57,z:267-x*.69,sx:1.15,sy:.035,sz:7.5,ry:.82});
  instanced(publicRealm,'Lam Son crosswalk markings',new THREE.BoxGeometry(1,1,1),marking,crosswalk);

  Object.assign(status,{version:'30b',classification:'site photos on approximate open-map envelopes',active:false,loadedPhotos:0,loadedPbrMaps:0,landmarks:Object.values(FRAMES).map(frame=>({name:frame.name,buildingId:frame.buildingId,source:frame.source,author:frame.author,license:frame.license,surveyed:false})),roadSourceIds:[...roadIds],publicRealm:'OSM centerlines with illustrative widths and furniture; CC0 PBR surface maps',pbrSources:['Poly Haven / aerial_asphalt_01 / CC0','Poly Haven / concrete_pavement_02 / CC0'],pbrReceipt:'assets/pbr30/SOURCES.json',caravelleHeight:'24 storeys × 3.2 m display rule; not surveyed'});
  return{
    root,architecture,publicRealm,
    update(cameraDistance,night,active){
      const visible=!!active&&cameraDistance<1800;root.visible=visible;publicRealm.visible=visible&&cameraDistance<1050;
      warm.emissiveIntensity=.08+Math.max(0,Math.min(1,night||0))*3.2;
      status.active=visible;status.publicRealmVisible=publicRealm.visible;status.lod=publicRealm.visible?'hero':visible?'landmark':'city';
    },
    dispose(){root.traverse(object=>{if(object.isMesh)object.geometry.dispose();});resources.materials.forEach(value=>value.dispose());resources.textures.forEach(value=>value.dispose());root.removeFromParent();}
  };
}
