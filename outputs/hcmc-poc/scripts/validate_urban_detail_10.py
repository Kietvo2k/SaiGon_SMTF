#!/usr/bin/env python3
from pathlib import Path
import json, hashlib

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/"data/urban-detail-10.json").read_text(encoding='utf-8'))
copy=dict(p); expected=copy.pop("sha256")
actual=hashlib.sha256(json.dumps(copy,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
checks={
 "deterministic_hash":actual==expected,
 "counts":p["counts"]=={"rooftopAssets":600,"signBands":240,"hazeVolumes":24,"facadeShaderBuildings":70719},
 "classification":p["classification"]=="illustrative_procedural_microdetail_not_surveyed_or_observed",
 "performance_budget":p["performanceBudget"]["instancingRequired"] and p["performanceBudget"]["newDrawCallsTarget"]<=10,
 "generic_signage":all(0<=x["style"]<4 and "text" not in x for x in p["signs"]),
 "building_links":all("buildingId" in x and "buildingIndex" in x for x in p["rooftops"]+p["signs"]),
 "upgrade_contract":len(p["upgradeContract"])>=4
}
out={"status":"PASS" if all(checks.values()) else "FAIL","checks":checks,"sha256":expected}
(ROOT/"research/urban-detail-10-validation.json").write_text(json.dumps(out,indent=2), encoding='utf-8', newline='\n')
print(json.dumps(out))
raise SystemExit(0 if out["status"]=="PASS" else 1)
