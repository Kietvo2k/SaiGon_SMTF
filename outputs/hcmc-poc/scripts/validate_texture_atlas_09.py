#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 d=json.loads((ROOT/'data/texture-atlas-09.json').read_text(encoding='utf-8'));a=d['atlas'];c=d['calibration'];checks={'atlas_grid':a['width']==1024 and a['height']==512 and a['columns']==4 and a['rows']==2 and len(a['families'])==8,'assignments':d['assignment']['buildings']==70719 and d['assignment']['directTaggedBuildings']==74 and d['assignment']['simulatedBuildings']==70645,'honest_calibration':c['capturedImages']==0 and c['measuredCharts']==0 and c['deltaE2000'] is None and c['controlsAreExploratory'] is True,'classification':d['classification']=='illustrative_procedural_texture_atlas_not_observed_facade_texture','upgrade_contract':len(d['upgradeContract'])==4};out={'status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'families':8,'capturedImages':0,'deltaE2000':None,'sha256':d['sha256']};(ROOT/'research/texture-atlas-09-validation.json').write_text(json.dumps(out,indent=2)+'\n', encoding='utf-8', newline='\n');print(json.dumps(out));raise SystemExit(0 if out['status']=='PASS' else 1)
if __name__=='__main__':main()
