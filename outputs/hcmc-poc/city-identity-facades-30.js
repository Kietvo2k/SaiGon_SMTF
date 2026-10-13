import * as THREE from 'three/webgpu';

/*
 * Evidence-gated identity layer for Visual Runtime 30B.
 *
 * This module only renders facade records whose earlier surface audit accepted
 * a planar target. It skips the three Hero Corridor envelopes (which have
 * dedicated geometry) and every record marked sampled_envelope or requiring a
 * surface split. The atlas contains site photographs; geometry remains an
 * approximate open-map registration and is never presented as survey output.
 */

const HERO_IDS=new Set([801710792,2000032897,39598465]);
const ACTIVE_VIEWS=new Set(['materials','boulevard','corridor']);

function loadTexture(loader,url,color=false,anisotropy=8){
  return new Promise((resolve,reject)=>loader.load(url,texture=>{
    texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.anisotropy=anisotropy;
    resolve(texture);
  },undefined,()=>reject(new Error(`Texture decode failed: ${url}`))));
}

function facadeGeometry(entry){
  const positions=[],uvs=[];
  const startY=1.5+entry.height_m*entry.vertical[0],endY=1.5+entry.height_m*entry.vertical[1];
  const rect=entry.atlas_rect,range=entry.horizontal||[0,1];
  for(const strip of entry.strips){
    const lo=Math.max(range[0],strip.u0),hi=Math.min(range[1],strip.u1);
    if(hi<=lo)continue;
    const blend=u=>{const t=(u-strip.u0)/(strip.u1-strip.u0);return[strip.a[0]+(strip.b[0]-strip.a[0])*t,strip.a[1]+(strip.b[1]-strip.a[1])*t];};
    const a=blend(lo),b=blend(hi),normal=strip.normal;
    const f0=(lo-range[0])/(range[1]-range[0]),f1=(hi-range[0])/(range[1]-range[0]);
    const u0=entry.reverse_u?1-f0:f0,u1=entry.reverse_u?1-f1:f1;
    const vertices=[
      [a[0]+normal[0]*.18,startY,a[1]+normal[1]*.18],
      [b[0]+normal[0]*.18,startY,b[1]+normal[1]*.18],
      [a[0]+normal[0]*.18,endY,a[1]+normal[1]*.18],
      [b[0]+normal[0]*.18,endY,b[1]+normal[1]*.18]
    ];
    const textureUv=[
      [rect[0]+rect[2]*u0,rect[1]],
      [rect[0]+rect[2]*u1,rect[1]],
      [rect[0]+rect[2]*u0,rect[1]+rect[3]],
      [rect[0]+rect[2]*u1,rect[1]+rect[3]]
    ];
    for(const index of [0,1,2,1,3,2]){positions.push(...vertices[index]);uvs.push(...textureUv[index]);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();
  return geometry;
}

export function createIdentityFacades30({scene,status={},atlasUrl='assets/facades15/facade-atlas.jpg',maskUrl='assets/facades15/facade-mask.png',anisotropy=8}={}){
  const root=new THREE.Group();root.name='Identity Facades 30B · accepted photo registrations';root.visible=false;scene.add(root);
  const resources={textures:[],geometries:[]};
  const material=new THREE.MeshStandardNodeMaterial({color:'#ffffff',roughness:.76,metalness:.025,alphaTest:.44,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  let ready=false;
  Object.assign(status,{version:'30b',state:'loading',accepted:0,rendered:0,held:0,atlasUrl,maskUrl,anisotropy,classification:'site photo patches on approximate open-map geometry'});

  fetch('./data/facades-30.json?v=31a').then(response=>{
    if(!response.ok)throw new Error(`facades-30.json HTTP ${response.status}`);
    return response.json();
  }).then(async manifest=>{
    const eligible=manifest.entries.filter(entry=>entry.surface_fit?.eligible===true&&entry.render_mode!=='sampled_envelope');
    const rendered=eligible.filter(entry=>!HERO_IDS.has(Number(entry.building_id)));
    for(const entry of rendered){
      const geometry=facadeGeometry(entry);resources.geometries.push(geometry);
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`Identity facade · ${entry.name}`;mesh.receiveShadow=true;
      mesh.userData={buildingId:entry.building_id,source:entry.source_url,author:entry.author,license:entry.license,surveyed:false};root.add(mesh);
    }
    const loader=new THREE.TextureLoader();
    const [map,alphaMap]=await Promise.all([
      loadTexture(loader,atlasUrl,true,anisotropy),
      loadTexture(loader,maskUrl,false,anisotropy)
    ]);
    // C2 (review-I): GIỮ mipmap cho atlas/mask facade Lite. Ảnh 1024×1280 (~1,3 triệu pixel) nên chi phí mipmap
    // nhỏ; giữ mipmap để facade ở tầm xa không nhấp nháy. Chỉ anisotropy bị hạ ≤ 2. Facade signature chỉ giảm
    // độ phân giải, không mất.
    resources.textures.push(map,alphaMap);material.map=map;material.alphaMap=alphaMap;material.needsUpdate=true;ready=true;
    Object.assign(status,{state:'ready',accepted:eligible.length,rendered:rendered.length,heroReplacements:eligible.length-rendered.length,held:manifest.entries.length-eligible.length,atlas:manifest.atlas,alphaMask:manifest.alpha_mask,atlasSize:map.image?[map.image.width,map.image.height]:null,maskSize:alphaMap.image?[alphaMap.image.width,alphaMap.image.height]:null,sources:rendered.map(entry=>({name:entry.name,buildingId:entry.building_id,url:entry.source_url,author:entry.author,license:entry.license}))});
  }).catch(error=>{status.state='error';status.error=String(error?.message||error);root.visible=false;});

  return{
    root,
    update(cameraDistance,activeView){root.visible=ready&&ACTIVE_VIEWS.has(activeView)&&cameraDistance<2600;status.visible=root.visible;},
    dispose(){root.removeFromParent();resources.geometries.forEach(geometry=>geometry.dispose());resources.textures.forEach(texture=>texture.dispose());material.dispose();}
  };
}
