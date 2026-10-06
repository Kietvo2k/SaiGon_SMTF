"""Validate real source linkage, atlas integrity, footprint anchoring and runtime captures."""
from pathlib import Path
import json,hashlib,math,base64,re
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'research/facades-15';A=ROOT/'assets/facades15'
doc=json.loads((R/'manifest.json').read_text(encoding='utf-8'));entries=doc['entries'];D=json.loads((ROOT/'data/scene.json').read_text(encoding='utf-8'));checks={}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert len(entries)==20 and len({e['key']for e in entries})==20 and len({e['building_id']for e in entries})==20
for e in entries:
 assert e['source_sha256']==sha(ROOT/e['source_file'])
 source=json.loads((R/'snapshots'/e['source_snapshot']).read_text(encoding='utf-8'));page=next(v for v in source['query']['pages'].values()if v['title']==e['source_title']);info=page['imageinfo'][0]
 assert info['descriptionurl']==e['source_url'] and info['extmetadata']['LicenseShortName']['value']==e['license']
 assert e['author'] and e['photo_date'] and e['license_url'] and e['observed_site_image'] and not e['surveyed_geometry']
 assert e['rectified_sha256']==sha(A/(e['key']+'-rectified.jpg'))
 assert all(0<=v<=1 for point in e['quad']for v in point)
 cross=[]
 for i in range(4):
  a,b,c=e['quad'][i],e['quad'][(i+1)%4],e['quad'][(i+2)%4];cross.append((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))
 assert min(cross)>0 or max(cross)<0,(e['key'],'nonconvex photo selection')
 building=next(b for b in D['buildings']if b['id']==e['building_id']);ring=building['r'][0]
 assert e['baseline_height_m']==building['h']
 assert not (e.get('height_override') and building['q']=='podium'), (e['key'],'podium cannot become tower')
 spread=max(math.degrees(math.acos(max(-1,min(1,sum(a*b for a,b in zip(strip['normal'],e['normal'])))))) for strip in e['strips'])
 assert e['surface_fit']['eligible']==(e['surface_review']['status']=='accepted' and e['surface_review']['source_model']=='planar' and spread<=5)
 for part in e.get('envelope_parts',[]):
  target=next(b for b in D['buildings'] if b['id']==part['building_id']);assert target['q']!='podium' and part['meters']>0
 for idx,strip in zip(e['edges'],e['strips']):
  assert strip['a']==ring[idx] and strip['b']==ring[(idx+1)%len(ring)]
  assert abs(math.hypot(*strip['normal'])-1)<1e-8
 assert 0<=e['vertical'][0]<e['vertical'][1]<=1 and e['height_m']>0
 u,v,w,h=e['atlas_rect'];assert 0<=u<u+w<=1 and 0<=v<v+h<=1
checks.update(unique_facades=20,unique_buildings=20,source_files_hashed=20,source_license_matches=20,convex_photo_quads=20,footprint_anchor_matches=20)
bundle=json.loads((ROOT/'data/facades-15.js').read_text(encoding='utf-8').removeprefix('window.FACADES_15=').rstrip(';\n'))
assert bundle['manifest']==doc
for channel,filename in [('color','facade-atlas.jpg'),('mask','facade-mask.png')]:
 assert base64.b64decode(bundle[channel].split(',',1)[1])==(A/filename).read_bytes()
for name,digest in json.loads((R/'snapshot-hashes.json').read_text(encoding='utf-8')).items():assert sha(R/'snapshots'/name)==digest
checks['embedded_atlas_byte_identity']=True
checks['eligible_surfaces']=sum(e['surface_fit']['eligible'] for e in entries)
checks['nonplanar_surfaces_held']=sum(not e['surface_fit']['eligible'] for e in entries)
checks['podium_height_overrides']=0
old=json.loads((R/'fixes/selections-15a.json').read_text(encoding='utf-8'))
old_vcb=next(e for e in old['entries'] if e['key']=='vietcombank')
assert next(b for b in D['buildings'] if b['id']==old_vcb['building_id'])['q']=='podium'
vcb=next(e for e in entries if e['key']=='vietcombank')
assert vcb['parent_building_id']==old_vcb['building_id'] and vcb['building_id']!=old_vcb['building_id']
assert vcb['render_mode']=='sampled_envelope' and len(vcb['envelope_parts'])==6
assert max(part['meters'] for part in vcb['envelope_parts'])==206
assert vcb['quad']!=old_vcb['quad']
checks['reported_podium_and_corner_regression_removed']=True
captures=[]
for e in entries:
 slug=re.sub('[0-9]','',e['key']);p=ROOT.parent/('poc-fifteen-facades-'+slug+'.metrics.json')
 if p.exists():
  c=json.loads(p.read_text(encoding='utf-8'));status=c.get('facades15',{})
  if status.get('version')==doc['version']:
   assert status['selected']==e['key'] and status['ready'] and status['visible']==e['surface_fit']['eligible'] and not status['errors'];captures.append(e['key'])
checks['runtime_captured_facades']=len(captures)
on=ROOT.parent/'poc-fifteen-facades-vietcombank.metrics.json';off=ROOT.parent/'poc-fifteen-facades-vietcombank-no-photo.metrics.json'
if on.exists() and off.exists():
 a=json.loads(on.read_text(encoding='utf-8'));b=json.loads(off.read_text(encoding='utf-8'))
 if a.get('facades15',{}).get('version')==doc['version'] and b.get('facades15',{}).get('version')==doc['version']:
  assert a['captureCamera']==b['captureCamera']
  assert a['facades15']['visible'] and not b['facades15']['visible']
  for frame in [a,b]:
   assert frame['facades15']['geometryChecks']['podiumHeight']==9
   assert frame['facades15']['geometryChecks']['heightUVAligned']
  assert b['facades15']['geometryChecks']['baselineRestored']
  checks['same_camera_ab_and_geometry_restoration']=True
report={'status':'PASS','checks':checks,'runtime_captures':captures,'classification':doc['classification'],'limit':'Source identity and geometry anchors validated. Metric accuracy, complete building reconstruction and current site condition are not verified.'}
(R/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2), encoding='utf-8', newline='\n');print(json.dumps(report,ensure_ascii=False))
