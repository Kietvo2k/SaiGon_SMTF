#!/usr/bin/env python3
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/confidence-map-11.json').read_text(encoding='utf-8')); copy=dict(p); expected=copy.pop('sha256'); actual=hashlib.sha256(json.dumps(copy,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
ranked=sorted((t for t in p['tiles'] if t['buildingCount']),key=lambda t:(-t['priorityScore'],t['id']))
checks={'hash':actual==expected,'grid':len(p['tiles'])==64 and p['grid']['rows']==8 and p['grid']['columns']==8,'buildings':len(p['buildingConfidence'])==p['summary']['buildings']==70719,'confidence_range':all(0<=v<=88 for v in p['buildingConfidence']),'priority_queue':p['priorityQueue']==[t['id'] for t in ranked[:12]],'no_capture':p['coverage']=={'capturedImages':0,'calibratedImages':0,'surveyedRealityTiles':0,'surveyedRealityCoveragePercent':0},'planning_label':p['classification']=='derived_priority_model_not_survey_validation','mode':all(t['recommendedMode'] in {'uav_oblique_plus_ground_control','ground_facade_corridors','hybrid_reconnaissance'} for t in p['tiles']),'constraints':len(p['constraints'])>=3 and len(p['upgradeContract'])>=4}
out={'status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'top':[{'id':t['id'],'score':t['priorityScore'],'mode':t['recommendedMode']} for t in ranked[:5]],'sha256':expected}; (ROOT/'research/confidence-map-11-validation.json').write_text(json.dumps(out,indent=2), encoding='utf-8', newline='\n'); print(json.dumps(out)); raise SystemExit(0 if out['status']=='PASS' else 1)
