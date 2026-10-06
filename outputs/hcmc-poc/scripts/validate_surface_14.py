"""Checks the actual embedded assets against acquisition evidence, not source-code tokens."""
import json,hashlib,base64,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'research/visual-14'
s=(ROOT/'data/pbr-assets-14.js').read_text(encoding='utf-8');bundle=json.loads(s.removeprefix('window.PBR_ASSETS_14=').strip().removesuffix(';'))
manifest=json.loads((ROOT/'assets/pbr14/manifest.json').read_text(encoding='utf-8'));assert bundle['manifest']==manifest
assert len(manifest['assets'])==5
checked=0
for a in manifest['assets']:
 assert a['license']=='CC0-1.0' and a['site_observed'] is False
 assert a['creation_method']=='PBRPhotogrammetry'
 assert (R/'snapshots'/a['metadata_snapshot']).exists()
 assert a['id'] in [x['assetId']for x in json.loads((R/'snapshots'/a['metadata_snapshot']).read_text(encoding='utf-8'))['foundAssets']]
 assert set(a['maps'])=={'color','normal','roughness'}
 for channel,m in a['maps'].items():
  raw=(ROOT/m['path']).read_bytes();assert len(raw)==m['bytes'];assert hashlib.sha256(raw).hexdigest()==m['sha256']
  embedded=base64.b64decode(bundle['images'][a['key']][channel].split(',',1)[1]);assert embedded==raw
  assert m['color_space']==('sRGB' if channel=='color' else 'linear')
  assert raw[:2]==b'\xff\xd8';checked+=1
hashes=json.loads((R/'snapshot-hashes.json').read_text(encoding='utf-8'))
for name,digest in hashes.items():assert hashlib.sha256((R/'snapshots'/name).read_bytes()).hexdigest()==digest,name
claims=[json.loads(x)for x in (R/'claims.jsonl').read_text(encoding='utf-8').splitlines() if x]
for c in claims:assert c['evidence_span'] in (R/'snapshots'/c['capture']['snapshot']).read_text(encoding='utf-8')
assert len({c['entity']for c in claims})==27
images=json.loads((R/'hcmc-image-candidates.json').read_text(encoding='utf-8'))['candidates']
assert len(images)==12 and all(not i['image_downloaded'] and i['license']for i in images)
report={'status':'PASS','verified_texture_maps':checked,'asset_sets':len(manifest['assets']),'registry_entities':27,'claims':len(claims),'reference_photo_candidates':len(images),'snapshot_hashes':len(hashes),'embedded_byte_identity':True,'source_location_observed':False}
(ROOT/'research/surface-14-validation.json').write_text(json.dumps(report,indent=2), encoding='utf-8', newline='\n');print(json.dumps(report))
