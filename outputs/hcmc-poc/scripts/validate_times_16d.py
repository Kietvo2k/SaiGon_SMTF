from pathlib import Path
import json,hashlib,base64,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parents[1]/'work/pylib'))
from PIL import Image
r=ROOT/'research/vibecode-16d';m=json.loads((r/'texture-manifest.json').read_text(encoding='utf-8'));e=next(e for e in json.loads((ROOT/'research/facades-15/manifest.json').read_text(encoding='utf-8'))['entries']if e['key']=='times');bundle=json.loads((ROOT/'data/times-facade-16d.js').read_text(encoding='utf-8').removeprefix('window.TIMES_FACADE_16D=').rstrip(';\n'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks={}
checks['original_immutable']=sha(ROOT/m['source_original'])==m['source_sha256']=='11d7c80e0af75c26774c5db0b75cbadcd552c57a77a7ad9915c758d0afb4f1f3'
checks['dedicated_texture_hashes']=all(sha(ROOT/'assets/facades16d'/f)==m[k]for f,k in [('times-front.jpg','color_sha256'),('times-mask.png','mask_sha256')])
checks['embedded_bytes_identical']=all(base64.b64decode(bundle[k].split(',',1)[1])==(ROOT/'assets/facades16d'/f).read_bytes()for k,f in [('color','times-front.jpg'),('mask','times-mask.png')])
checks['sign_free_asset_hashes']=all(sha(ROOT/'assets/facades16d'/f)==m[k]for f,k in [('times-sign-free-extension.jpg','extension_sha256'),('times-glass-sample.jpg','glass_sha256')])
checks['same_plane_crop_linked']=e['quad']==m['quad_normalized'] and e['source_sha256']==m['source_sha256']
checks['dedicated_non_square_resolution']=Image.open(ROOT/'assets/facades16d/times-front.jpg').size==(1024,1856)
width=e['width_m']*(e['horizontal'][1]-e['horizontal'][0]);height=e['height_m']*(e['vertical'][1]-e['vertical'][0]);checks['display_aspect_within_one_percent']=abs((width/height)/(1024/1856)-1)<.01
mask=Image.open(ROOT/'assets/facades16d/times-mask.png');checks['sky_mask_nonempty_bounded']=0<m['masked_fraction']<.08;checks['letter_band_mask_preserved']=mask.crop((340,90,885,130)).histogram()[0]==0
runtime=(ROOT/'times-facade-16d.js').read_text(encoding='utf-8');checks['times_only_selector_and_ab_gate']='marker.fill(1,start,end)' in runtime and 'facade?.enabled&&facade.ready&&!audit' in runtime
checks['no_sign_repetition']=m['sign_free_extension_crop'][1]>400 and m['glass_sample_crop'][1]>400 and 'else if(photoV<=1.)' in runtime
checks['one_material_observed_and_extension']='roughness:.86,metalness:0,envMapIntensity:.25' in runtime and 'diffuseColor*=finish' in runtime
checks['unseen_finish_declared']='inferred' in m['classification'] and 'original photograph pixels only' in m['physical_sign']
report={'status':'PASS'if all(checks.values())else'FAIL','checks':checks,'displayAspect':width/height,'textureAspect':1024/1856,'limit':'Source/hash/registration contract checks; browser confirms legibility, shader compilation and appearance.'};(r/'times-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n', encoding='utf-8', newline='\n');print(json.dumps(report,ensure_ascii=False));assert all(checks.values())
