#!/usr/bin/env python3
"""Validate identity, construction status and design provenance of the Bạch Đằng footbridge layer."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research" / "bach-dang-footbridge-validation.json"
IDS = {1504289918, 1504289919, 1504289920, 1504289921}


def main():
    data = json.loads((ROOT / "data/bach-dang-footbridge.json").read_text(encoding='utf-8'))
    raw = json.loads((ROOT / "data/osm-raw.json").read_text(encoding='utf-8'))
    ways = {e["id"]: e for e in raw["elements"] if e.get("id") in IDS}
    checks = {
        "mapped_construction_ways": set(data["mappedConstructionWayIds"]) == IDS == set(ways),
        "osm_construction_tags": all(e["tags"].get("highway") == "construction" and e["tags"].get("construction") == "footway" and e["tags"].get("bridge") == "yes" for e in ways.values()),
        "not_operational": data["operational"] is False and data["status"] == "under_construction_main_span_not_installed",
        "approved_form": data["design"]["concept"] == "nipa_palm_leaf" and data["design"]["structure"] == "spatial_steel_arch",
        "published_dimensions": data["design"]["routeLengthM"] == 720 and data["design"]["mainSpanM"] == 187 and data["design"]["widthRangeM"] == [6, 11] and data["design"]["navigationClearanceM"] == {"width": 80, "height": 10},
        "render_separates_fact_and_design": data["renderPolicy"]["builtWork"] == "solid" and data["renderPolicy"]["uninstalledMainSpan"] == "translucent_design_envelope",
        "survey_grade_denied": data["renderPolicy"]["surveyedGeometry"] is False,
        "provenance": len(data["sources"]) == 2 and all(s["url"].startswith("https://") for s in data["sources"]),
    }
    result = {"status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "wayIds": sorted(IDS), "operational": False, "statusDate": data["statusDate"], "sha256": data["sha256"]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding='utf-8', newline='\n')
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
