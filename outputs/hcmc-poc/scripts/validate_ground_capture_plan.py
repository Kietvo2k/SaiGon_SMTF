#!/usr/bin/env python3
"""Validate that the 07C plan stays a plan and reconciles with mapped roads."""
import json, math
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
plan=json.loads((ROOT/'data/ground-capture-plan.json').read_text(encoding='utf-8'));scene=json.loads((ROOT/'data/scene.json').read_text(encoding='utf-8'));stations=plan['stations'];road_ids={r['id'] for r in scene['roads']}
bins=[s['azimuthBin'] for s in stations];checks={
 'plan_only_no_images':plan['status']=='plan_only_no_images' and plan['capture']['capturedFrames']==0,
 'station_count_reconciles':len(stations)==plan['capture']['stations']==23,
 'planned_frames_reconcile':sum(s['plannedFrames'] for s in stations)==plan['capture']['plannedFrames']==69,
 'unique_azimuth_bins':len(bins)==len(set(bins)),
 'coverage_reconciles':round(len(set(bins))/plan['capture']['azimuthBins']*100,1)==plan['capture']['azimuthCoveragePercent']==95.8,
 'missing_bin_reconciles':plan['capture']['missingBins']==[i for i in range(plan['capture']['azimuthBins']) if i not in bins],
 'stations_reference_mapped_roads':all(s['roadId'] in road_ids for s in stations),
 'field_access_unverified':all(s['access']=='unverified_public_realm_candidate' and s['status']=='planned' for s in stations),
 'coordinates_finite':all(all(math.isfinite(v) for v in s['positionLocal']+s['positionWgs84']) for s in stations),
}
out={'checkedAt':datetime.now(timezone.utc).isoformat(),'status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'stations':len(stations),'plannedFrames':69,'capturedFrames':0,'azimuthCoveragePercent':95.8,'sha256':plan['sha256']}
(ROOT/'research/ground-capture-07c-validation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n', encoding='utf-8', newline='\n');print(json.dumps(out,ensure_ascii=False));raise SystemExit(0 if out['status']=='PASS' else 1)
