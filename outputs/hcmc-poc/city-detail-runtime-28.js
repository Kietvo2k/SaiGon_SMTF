import * as THREE from 'three/webgpu';

/*
 * City Detail Runtime 28
 *
 * Clean-room, camera-scaled detail for the HCMC twin. The source footprints
 * remain authoritative; this layer adds visually plausible urban components
 * only where the camera can resolve them. Every generated object is marked as
 * inferred presentation geometry and can be replaced by surveyed/BIM assets.
 */

const UP=new THREE.Vector3(0,1,0);
const dummy=new THREE.Object3D();

function polygonArea(ring){
  let sum=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    sum+=a[0]*b[1]-b[0]*a[1];
  }
  return Math.abs(sum*.5);
}

function longestEdges(building,limit=2){
  const ring=building.r?.[0]||[];
  return ring.map((a,index)=>{
    const b=ring[(index+1)%ring.length];
    return{a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};
  }).filter(edge=>edge.length>5).sort((a,b)=>b.length-a.length).slice(0,limit);
}

function placeBox(mesh,index,x,y,z,length,height,depth,angle){
  dummy.position.set(x,y,z);
  dummy.rotation.set(0,-angle,0);
  dummy.scale.set(length,height,depth);
  dummy.updateMatrix();
  mesh.setMatrixAt(index,dummy.matrix);
}

function createBoxInstances(count,material,name){
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,Math.max(1,count));
  mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

function centralBuilding(building,radius,minHeight=0,maxHeight=Infinity){
  return Math.hypot(building.center[0],building.center[1])<radius&&building.h>=minHeight&&building.h<=maxHeight;
}

export function createCityDetailRuntime({scene,buildings,roads,widths,hash01,nightLevel,status={}}){
  const root=new THREE.Group();
  root.name='City Detail Runtime 28 · inferred camera-scaled geometry';
  scene.add(root);

  const architectural=new THREE.Group();architectural.name='LOD0/1 architectural relief';root.add(architectural);

  const parapetItems=[];
  const ledgeItems=[];
  const podiumItems=[];
  const awningItems=[];
  const signItems=[];
  const tankItems=[];
  for(const building of buildings){
    if(!centralBuilding(building,2050,10,210))continue;
    const ring=building.r?.[0];if(!ring?.length)continue;
    const area=polygonArea(ring),seed=hash01(building.id);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length<4.5)continue;
      parapetItems.push({x:(a[0]+b[0])*.5,y:building.h+2.05,z:(a[1]+b[1])*.5,length:Math.min(length,90),angle:Math.atan2(b[1]-a[1],b[0]-a[0])});
    }
    if(centralBuilding(building,1550,17,145)){
      for(const edge of longestEdges(building,building.h>48?2:1)){
        const angle=Math.atan2(edge.b[1]-edge.a[1],edge.b[0]-edge.a[0]);
        const mx=(edge.a[0]+edge.b[0])*.5,mz=(edge.a[1]+edge.b[1])*.5;
        const nx=mx-building.center[0],nz=mz-building.center[1],nl=Math.max(.001,Math.hypot(nx,nz));
        const bands=building.h>70?4:building.h>34?3:2;
        for(let band=1;band<=bands;band++)ledgeItems.push({x:mx+nx/nl*.28,y:1.5+building.h*band/(bands+1),z:mz+nz/nl*.28,length:Math.min(edge.length,72),angle});
        if(building.h>28)podiumItems.push({x:mx+nx/nl*.48,y:Math.min(12,Math.max(7.2,building.h*.13)),z:mz+nz/nl*.48,length:Math.min(edge.length+1.2,76),angle});
      }
    }
    if(centralBuilding(building,1350,6,25)&&area>32&&seed>.44){
      const edge=longestEdges(building,1)[0];
      if(edge){
        const angle=Math.atan2(edge.b[1]-edge.a[1],edge.b[0]-edge.a[0]);
        const mx=(edge.a[0]+edge.b[0])*.5,mz=(edge.a[1]+edge.b[1])*.5;
        const nx=mx-building.center[0],nz=mz-building.center[1],nl=Math.max(.001,Math.hypot(nx,nz));
        awningItems.push({x:mx+nx/nl*1.05,y:4.25,z:mz+nz/nl*1.05,length:Math.min(edge.length*.72,13),angle,seed});
        if(seed>.57)signItems.push({x:mx+nx/nl*.62,y:3.15+seed*1.2,z:mz+nz/nl*.62,length:Math.min(edge.length*.46,7.5),angle,seed});
      }
    }
    if(centralBuilding(building,1700,11,80)&&area>48&&seed>.72){
      tankItems.push({x:building.center[0],y:building.h+3.4,z:building.center[1],scale:Math.min(2.2,Math.max(.75,Math.sqrt(area)*.07)),seed});
    }
  }

  const concrete=new THREE.MeshStandardNodeMaterial({color:'#777d79',roughness:.78,metalness:.04});
  const ledgeMaterial=new THREE.MeshStandardNodeMaterial({color:'#a9ada7',roughness:.69,metalness:.05});
  const podiumMaterial=new THREE.MeshStandardNodeMaterial({color:'#79888a',roughness:.54,metalness:.16});
  const awningMaterial=new THREE.MeshStandardNodeMaterial({color:'#8c4536',roughness:.68,metalness:.04});
  const signMaterial=new THREE.MeshStandardNodeMaterial({color:'#d7c294',emissive:'#8a5c2a',emissiveIntensity:.08,roughness:.38,metalness:.12});
  const tankMaterial=new THREE.MeshStandardNodeMaterial({color:'#596b6e',roughness:.48,metalness:.34});
  const parapets=createBoxInstances(parapetItems.length,concrete,'Hero roof parapets · inferred');
  parapetItems.forEach((item,index)=>placeBox(parapets,index,item.x,item.y,item.z,item.length,.95,.42,item.angle));
  const ledges=createBoxInstances(ledgeItems.length,ledgeMaterial,'Hero facade ledges · inferred');
  ledgeItems.forEach((item,index)=>placeBox(ledges,index,item.x,item.y,item.z,item.length,.24,.72,item.angle));
  const podiums=createBoxInstances(podiumItems.length,podiumMaterial,'Hero podium cornices · inferred');
  podiumItems.forEach((item,index)=>placeBox(podiums,index,item.x,item.y,item.z,item.length,.52,1.02,item.angle));
  const awnings=createBoxInstances(awningItems.length,awningMaterial,'Street awnings · inferred');
  awningItems.forEach((item,index)=>{
    const colour=new THREE.Color().setHSL(.025+item.seed*.09,.42,.34+item.seed*.12);awnings.setColorAt(index,colour);
    placeBox(awnings,index,item.x,item.y,item.z,item.length,.18,2.1,item.angle);
  });
  const signs=createBoxInstances(signItems.length,signMaterial,'Ground-floor lightbox signs · inferred');
  signItems.forEach((item,index)=>{
    signs.setColorAt(index,new THREE.Color().setHSL(.035+item.seed*.1,.28,.55+item.seed*.16));
    placeBox(signs,index,item.x,item.y,item.z,item.length,.72,.16,item.angle);
  });
  const tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,12),tankMaterial,Math.max(1,tankItems.length));
  tanks.name='Rooftop water and plant tanks · inferred';tanks.castShadow=true;tanks.receiveShadow=true;
  tankItems.forEach((item,index)=>{dummy.position.set(item.x,item.y,item.z);dummy.rotation.set(0,item.seed*6.28,0);dummy.scale.set(item.scale,2.2+item.seed*2.4,item.scale);dummy.updateMatrix();tanks.setMatrixAt(index,dummy.matrix);});
  architectural.add(parapets,ledges,podiums,awnings,signs,tanks);

  // Đèn đường chuyển sang city-street-furniture-31.js (bước E2 31A): đặt theo mép mặt đường hợp nhất, không
  // còn đặt theo tim từng way. Runtime 28 chỉ giữ chi tiết kiến trúc.

  const counts={parapets:parapetItems.length,facadeLedges:ledgeItems.length,podiumCornices:podiumItems.length,awnings:awningItems.length,lightboxSigns:signItems.length,rooftopPlant:tankItems.length};
  Object.assign(status,{version:'28b',classification:'inferred presentation geometry',sourceGeometry:'CITY_DATA footprints',counts});

  let mode='';
  return{
    root,counts,
    update(cameraDistance,night){
      const next=cameraDistance<1350?'hero':cameraDistance<2800?'district':'city';
      if(next!==mode){
        mode=next;
        parapets.visible=next!=='city';
        ledges.visible=next==='hero';
        podiums.visible=next!=='city';
        awnings.visible=next==='hero';
        signs.visible=next==='hero';
        tanks.visible=next!=='city';
        status.lod=mode;
      }
      signMaterial.emissiveIntensity=.08+Math.max(0,Math.min(1,night||0))*1.45;
    },
    dispose(){
      root.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});
      root.removeFromParent();
    }
  };
}
