'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../source-core.js'),CLI=require('../scripts/project-data.cjs');
const dir=path.resolve(__dirname,'..'), outputs=path.resolve(dir,'../..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),clone=structuredClone;
const hcm=read(path.join(dir,'projects/hcmc.json'));
const ring=[[106.71,10.77],[106.711,10.77],[106.711,10.771],[106.71,10.771],[106.71,10.77]];
const geom=coordinates=>({type:'Polygon',coordinates}),future=()=>({...clone(hcm.sources[0]),id:'future_source',release:null,captureDate:null,rights:{license:'CC0-1.0',commercialAllowed:true,ingestionAllowed:true},assets:[{path:'future.geojson',sha256:'a'.repeat(64)}]});
function conf(source=future()){return {...clone(hcm),sources:[source],defaultBuildingSource:source.id};}
function fc(geometry=geom([ring])){return {type:'FeatureCollection',features:[{type:'Feature',id:'b-1',geometry,properties:{name:'Future building sample',height:{value:12,kind:'source_attribute',surveyed:false}}}]};}
function square(x,y,w=0.001){return [[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]];}
test('retained HCMC project manifest validates',()=>{assert.equal(C.validateProject(hcm).valid,true);});
test('HCMC south-positive frame inverts local Z below the origin',()=>{assert.ok(C.inverseLocal([0,100],hcm.frame)[1]<hcm.frame.origin[1]);});
test('HCMC frame roundtrips geographic coordinates to less than 1e-10 degrees',()=>{const p=hcm;for(const ll of [p.bbox.slice(0,2),p.bbox.slice(2),p.frame.origin]){const again=C.inverseLocal(C.forwardLocal(ll,p.frame),p.frame);assert.ok(Math.abs(ll[0]-again[0])<1e-10&&Math.abs(ll[1]-again[1])<1e-10);}});
test('unknown frame and nonfinite geographic coordinates reject',()=>{assert.throws(()=>C.inverseLocal([0,1],{...hcm.frame,zAxis:'east'}));assert.throws(()=>C.forwardLocal([Infinity,2],hcm.frame));assert.throws(()=>C.inverseLocal([NaN,2],hcm.frame));});
test('mismatched native scene origin rejects rather than moving reality',()=>{assert.throws(()=>C.normalizeScene({meta:{center:[hcm.frame.origin[0]+0.01,hcm.frame.origin[1]]},buildings:[]},hcm),/mismatches/);});
test('native polygons close with holes retained and model source date stays unknown',()=>{const d={meta:{center:hcm.frame.origin},buildings:[{id:3,r:[[[0,0],[10,0],[10,10],[0,10]],[[2,2],[2,4],[4,4],[4,2]]],h:6,q:'estimated'}]};const n=C.normalizeScene(d,hcm);assert.equal(n.features.length,1);assert.equal(n.features[0].geometry.coordinates.length,2);assert.equal(n.features[0].geometry.coordinates[0].length,5);assert.equal(n.features[0].properties.sourceEpoch,null);assert.equal(n.features[0].properties.height.surveyed,false);});
test('duplicate OSM IDs remain two representations and one source identity; illustrations separate',()=>{const make=(id,x,type)=>({id,r:[[[x,0],[x+10,0],[x+10,10],[x,10]]],h:9,q:'estimated',type});const n=C.normalizeScene({buildings:[make(10,0,'part'),make(10,11,'part'),make(20,22,'illustrative-landmark-part')]},hcm);assert.equal(n.features.length,3);assert.equal(n.normalization.sourceIdentityCount,1);assert.equal(n.normalization.counts.illustrative,1);assert.notEqual(n.features[0].id,n.features[1].id);});
test('valid generic WGS84 future-source FeatureCollection normalizes with explicit null epoch',()=>{const n=C.normalizeScene(fc(),conf());assert.equal(n.features.length,1);assert.equal(n.features[0].properties.sourceKey,'future_source');assert.equal(n.features[0].properties.height.surveyed,false);assert.equal(n.gates.spatialAnalysis.allowed,true);});
for(const [title,mutate,error] of [
 ['lead acquisition',s=>s.acquisition.status='lead','source_not_acquired'],
 ['noncommercial rights',s=>s.rights.commercialAllowed=false,'commercial_use_not_verified'],
 ['missing license',s=>s.rights.license=null,'rights_not_verified'],
 ['missing CRS',s=>s.horizontalCRS=null,'missing_horizontal_crs'],
 ['missing hash',s=>s.assets[0].sha256='pending','missing_asset_hash'],
 ['coordinate-unit mismatch',s=>s.coordinateUnits='m','geographic_coordinate_units_mismatch']
])test(title+' cannot bypass admission by calling normalizeScene',()=>{const s=future();mutate(s);const n=C.normalizeScene(fc(),conf(s));assert.equal(n.features.length,0);assert.ok(n.normalization.excluded[0].reason.includes(error));assert.equal(n.gates.spatialAnalysis.allowed,false);});
test('projected CRS cannot reinterpret GeoJSON degree coordinates',()=>{const s=future();s.horizontalCRS='EPSG:32648';s.coordinateUnits='m';assert.equal(C.normalizeScene(fc(),conf(s)).features.length,0);});
test('invalid hole crossing outside outer is rejected even when its first vertex is inside',()=>{const h=[[106.7105,10.7705],[106.712,10.7705],[106.712,10.7707],[106.7105,10.7707],[106.7105,10.7705]];assert.equal(C.validateGeoJSONGeometry(geom([ring,h])).valid,false);});
test('overlapping and nested holes reject',()=>{assert.equal(C.validateGeoJSONGeometry(geom([square(106.71,10.77,0.01),square(106.712,10.772,0.005),square(106.713,10.773,0.003)])).valid,false);});
test('crossed polygon and degenerate ring reject',()=>{assert.equal(C.validateGeoJSONGeometry(geom([[[0,0],[1,1],[0,1],[1,0],[0,0]]])).valid,false);assert.equal(C.validateGeoJSONGeometry(geom([[[0,0],[1,0],[2,0],[0,0]]])).valid,false);});
test('overlapping MultiPolygon components reject while separate components pass',()=>{assert.equal(C.validateGeoJSONGeometry({type:'MultiPolygon',coordinates:[[square(106.71,10.77)],[square(106.7105,10.7705)]]}).valid,false);assert.equal(C.validateGeoJSONGeometry({type:'MultiPolygon',coordinates:[[square(106.71,10.77)],[square(106.712,10.772)]]}).valid,true);});
test('MultiPolygon component inside a polygon hole does not overlap occupied interior',()=>{assert.equal(C.validateGeoJSONGeometry({type:'MultiPolygon',coordinates:[[square(106.71,10.77,0.01),square(106.712,10.772,0.006)],[square(106.714,10.774,0.001)]]}).valid,true);});
test('negative and infinite survey accuracy cannot qualify a surveyed source',()=>{for(const v of [-0.1,Infinity,NaN]){const s=future();s.representation='surveyed';s.validation.stage='survey_validated';s.captureDate='2026-09-01';s.verticalDatum='test-fixture';s.quality={horizontalAccuracyM:v,verticalAccuracyM:0.1,independentCheckpointsVerified:true};assert.ok(C.inspectSource(s,'survey').errors.includes('missing_accuracy_evidence'));}});
test('modeled survey and unapproved plans fail; unknown capability never passes',()=>{assert.equal(C.capabilityGate(hcm,'survey_measurement').allowed,false);assert.equal(C.capabilityGate(hcm,'approved_planning').allowed,false);assert.equal(C.capabilityGate(hcm,'invented').allowed,false);});
test('survey terrain alone is insufficient for hydrological simulation',()=>{const s=future();s.role='terrain';s.representation='surveyed';s.captureDate='2026-09-01';s.verticalDatum='test-fixture';s.validation.stage='survey_validated';s.quality={horizontalAccuracyM:0.1,verticalAccuracyM:0.1,independentCheckpointsVerified:true};const p=conf(s),g=C.capabilityGate(p,'hydrology');assert.equal(g.allowed,false);assert.ok(g.reasons.some(r=>r.includes('calibration')));});
test('procedural asset cannot become real capture by changing role',()=>{const s=future();s.role='gaussian_splat';s.captureDate='2026-09-01';s.validation.spatialRegistrationVerified=true;assert.equal(C.capabilityGate(conf(s),'photoreal_capture').allowed,false);});
test('unsafe source URLs and malformed source entries reject without script execution',()=>{for(const u of ['javascript:alert(1)','https://user:pass@example.com','https://example.com\\evil','file:///etc/passwd'])assert.equal(C.safeUrl(u),null);const p=clone(hcm);p.sources=[null];assert.equal(C.validateProject(p).valid,false);});
test('byte verification catches changed expected fingerprint without touching source',()=>{const p=clone(hcm);p.input.sha256='b'.repeat(64);const before=fs.readFileSync(path.resolve(outputs,p.input.path));assert.equal(CLI.verify(p).valid,false);assert.deepEqual(fs.readFileSync(path.resolve(outputs,p.input.path)),before);});
test('quarantine import admits one valid GeoJSON, holds rejected rights, prevents clobber and path traversal',()=>{
 const base=path.join(dir,'quarantine'),prefix=path.join(base,'source-test-'+process.pid);fs.mkdirSync(prefix,{recursive:true});
 try {
  const input=path.join(prefix,'sample.geojson'),manifest=path.join(prefix,'manifest.json');fs.writeFileSync(input,JSON.stringify(fc()));const before=fs.readFileSync(input),s=future();s.assets[0].sha256=crypto.createHash('sha256').update(before).digest('hex');fs.writeFileSync(manifest,JSON.stringify(s));
  const ok=CLI.importGeoJSON('hcmc',input,manifest,path.join(prefix,'accepted'));assert.equal(ok.valid,true);assert.equal(ok.published,false);assert.ok(fs.existsSync(path.join(prefix,'accepted','normalized.geojson')));
  assert.throws(()=>CLI.importGeoJSON('hcmc',input,manifest,path.join(prefix,'accepted')),/EEXIST/);
  s.rights.ingestionAllowed=false;fs.writeFileSync(manifest,JSON.stringify(s));const held=CLI.importGeoJSON('hcmc',input,manifest,path.join(prefix,'held'));assert.equal(held.valid,false);assert.equal(fs.existsSync(path.join(prefix,'held','normalized.geojson')),false);assert.deepEqual(fs.readFileSync(input),before);
  assert.throws(()=>CLI.importGeoJSON('hcmc',input,manifest,path.join(dir,'escape')),/contained/);assert.equal(fs.existsSync(path.join(dir,'escape')),false);
 } finally {fs.rmSync(prefix,{recursive:true,force:true});}
});
test('retained source snapshots verify actual local bytes for HCMC',()=>{assert.equal(CLI.verify('hcmc').valid,true);});
test('CLI separates byte integrity from admission and refuses an empty denied preparation',()=>{
 const slug='source-test-denied-'+process.pid,file=path.join(dir,'projects',slug+'.json'),out=path.join(dir,'prepared',slug),p=clone(hcm);p.id=slug;p.sources.filter(s=>s.role==='footprints').forEach(s=>s.rights.ingestionAllowed=false);
 fs.writeFileSync(file,JSON.stringify(p),{flag:'wx'});try{const r=CLI.verify(slug);assert.equal(r.byteIntegrityValid,true);assert.equal(r.admissionReady,false);assert.equal(r.valid,false);assert.throws(()=>CLI.prepare(slug,out),/fail/);assert.equal(fs.existsSync(out),false);}finally{fs.unlinkSync(file);}
});
test('asset symlink escape cannot masquerade as contained verified data',()=>{
 const outside=path.join(require('node:os').tmpdir(),'source-core-external-'+process.pid+'.json'),link=path.join(dir,'tests','source-test-link-'+process.pid),p=clone(hcm);fs.writeFileSync(outside,'{}');fs.symlinkSync(outside,link);
 p.input={path:path.relative(outputs,link),sha256:crypto.createHash('sha256').update('{}').digest('hex')};
 try{const r=CLI.verify(p);assert.equal(r.byteIntegrityValid,false);assert.ok(r.assets.some(a=>a.error==='asset_realpath_outside_outputs'));}finally{fs.unlinkSync(link);fs.unlinkSync(outside);}
});
test('CLI safe project slugs admit added configs and block filename traversal',()=>{assert.throws(()=>CLI.verify('../../hcmc-poc/data/scene'),/safe/);});
test('Point and LineString may be query geometries but cannot be normalized as footprint buildings',()=>{
 for(const geometry of [{type:'Point',coordinates:[106.71,10.77]},{type:'LineString',coordinates:[[106.71,10.77],[106.711,10.771]]}]){assert.equal(C.validateGeoJSONGeometry(geometry).valid,true);const n=C.normalizeScene(fc(geometry),conf());assert.equal(n.features.length,0);assert.ok(n.normalization.excluded[0].reason.includes('building_requires_polygon'));assert.equal(n.gates.spatialAnalysis.allowed,false);}
});
test('empty footprint collection is held in quarantine without a normalized artifact',()=>{
 const base=path.join(dir,'quarantine','source-empty-'+process.pid);fs.mkdirSync(base,{recursive:true});try{const input=path.join(base,'empty.geojson'),manifest=path.join(base,'source.json');fs.writeFileSync(input,JSON.stringify({type:'FeatureCollection',features:[]}));const s=future();s.assets[0].sha256=crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');fs.writeFileSync(manifest,JSON.stringify(s));const r=CLI.importGeoJSON('hcmc',input,manifest,path.join(base,'held'));assert.equal(r.valid,false);assert.ok(r.errors.includes('empty_footprint_collection'));assert.equal(fs.existsSync(path.join(base,'held','normalized.geojson')),false);}finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('unverified surveyed height claim is rejected instead of silently downgraded',()=>{const d=fc();d.features[0].properties.height.surveyed=true;const n=C.normalizeScene(d,conf());assert.equal(n.features.length,0);assert.ok(n.normalization.excluded[0].reason.includes('unverified_survey_height_claim'));});
