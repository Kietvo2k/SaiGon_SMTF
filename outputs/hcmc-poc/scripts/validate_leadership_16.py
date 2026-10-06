"""Integration contracts for the additive source-led leadership shell.
Browser acceptance remains required for real renderer interactions and layout.
"""
from pathlib import Path
from html.parser import HTMLParser
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.scripts=[]; self.styles=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('src'): self.scripts.append(attrs['src'].split('?')[0])
        if tag=='link' and attrs.get('rel')=='stylesheet': self.styles.append(attrs['href'].split('?')[0])
a=Assets();a.feed((root/'index.html').read_text(encoding='utf-8'))
js=(root/'leadership-16.js').read_text(encoding='utf-8')
css=(root/'leadership-16.css').read_text(encoding='utf-8')
manifest=json.loads((root/'research/facades-15/manifest.json').read_text(encoding='utf-8'))
checks={
 'all_entry_assets_exist': all((root/p).is_file() for p in a.scripts+a.styles),
 # Shell WebGL cũ (?legacy=1) nạp thêm add-on 17–24 sau demo-shell; thứ tự đầy đủ do validate_demo_ready.py kiểm.
 'legacy_demo_shortcuts_load_after_leadership': a.scripts.count('demo-shell.js')==1 and a.scripts.index('leadership-16.js')<a.scripts.index('demo-shell.js'),
 'catalog_precedes_leadership': a.scripts.index('data/planning-16.js')<a.scripts.index('leadership-16.js'),
 'photo_runtime_precedes_leadership': a.scripts.index('photo-facades-15.js')<a.scripts.index('leadership-16.js'),
 'single_shell_instance': a.scripts.count('leadership-16.js')==1 and a.styles.count('leadership-16.css')==1,
 'source_manifest_20_records': len(manifest['entries'])==20,
 'held_photos_remain_held': sum(e['surface_fit']['eligible'] is False for e in manifest['entries'])==5,
 'no_new_geometry_or_texture_mutation': not re.search(r'new\s+T\.|\.geometry\s*=|\.material\s*=|bg\.attributes',js),
 'comparison_reuses_existing_ab': "ab.click()" in js and "q('#facade15AB')" in js,
 'future_geometry_fails_closed': 'planningGeometryEnabled:false' in js,
 'no_timeline_control': 'type="range"' not in js,
 'day_overview_only_without_explicit_view': "if(!params.has('view'))" in js and "navigate('overview'),120" in js,
 'leadership_hides_legacy_huds': 'body.leadership-mode .map-hud' in css and 'body.leadership-mode #experience' in css,
 'responsive_scrollable_drawer': 'overflow:auto' in css and '@media(max-width:600px)' in css,
}
node=subprocess.run(['node','--check',str(root/'leadership-16.js')],capture_output=True,text=True)
checks['javascript_syntax']=node.returncode==0
p=root/'data/planning-16.json'
if p.exists():
    planning=json.loads(p.read_text(encoding='utf-8'));checks['source_catalog_no_ready_geometry']=planning.get('geometryReady') is False
else: checks['source_catalog_no_ready_geometry']=False
out={'version':'16a','staticChecks':checks,'passed':sum(checks.values()),'total':len(checks),'browserRequired':['default daylight overview','explicit view retention','one collapsible panel','same camera A/B and held facade disabled','tour next/back/end','research return cleanup','390px and desktop screenshot','fullscreen/presenter shortcuts']}
(root/'research/vibecode-16/validation-ui.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n', encoding='utf-8', newline='\n')
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
