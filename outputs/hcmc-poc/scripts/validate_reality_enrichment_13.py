from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
js=(root/'reality-enrichment-13.js').read_text(encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
checks={
 # Version cache của script do validate_demo_ready.py ghim; ở đây chỉ kiểm script còn được nạp.
 'script_loaded':re.search(r'<script src="reality-enrichment-13\.js\?v=[0-9a-z-]+"></script>',html) is not None,
 'view_19':"<small>19</small> Reality Enrichment" in js,
 'five_layers':all(x in js for x in ['FacadeMicroGeometry','MappedRoadMarkings','LayeredVegetation','DetailedRiverTraffic','WaterMicroSurface']),
 'instancing':js.count('new T.InstancedMesh')>=5 and js.count('instances(')>=7,
 'lod':all(x in js for x in ['facadeGroup.visible','roadGroup.visible','treeGroup.visible','boatGroup.visible','waterGroup.visible']),
 'ab':"id=\"re13AB\"" in js and 'setEnabled' in js,
 'honest_classification':'not_surveyed_reality' in js and 'chưa phải texture chụp' in js,
 'draw_budget':'additionalDrawCalls:14' in js,
 'metrics':'realityEnrichment13Status' in (root/'app.js').read_text(encoding='utf-8'),
 'report':(root.parent/'POC-13-REALITY-ENRICHMENT.md').exists(),
}
failed=[k for k,v in checks.items() if not v]
assert not failed,failed
print('Reality Enrichment 13 validator PASS',checks)
