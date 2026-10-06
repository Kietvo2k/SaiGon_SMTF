#!/usr/bin/env python3
"""Fail-loud validation for the illustrative Ba Son Bridge correction."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research" / "ba-son-bridge-validation.json"


def main():
    bridge = json.loads((ROOT / "data/ba-son-bridge-detail.json").read_text(encoding='utf-8'))
    scene = json.loads((ROOT / "data/scene.json").read_text(encoding='utf-8'))
    runtime = (ROOT / "bridge-detail.js").read_text(encoding='utf-8')
    checks = {}
    checks["identity"] = bridge["name"] == "Cầu Ba Son" and bridge["formerName"] == "Cầu Thủ Thiêm 2"
    checks["mapped_carriageways"] = set(bridge["mappedRoadIds"]) == {321564421, 321564423}
    mapped = [r for r in scene["roads"] if r.get("id") in bridge["mappedRoadIds"]]
    checks["scene_roads"] = len(mapped) == 2 and all(r.get("bridge") and r.get("name") == "Cầu Ba Son" for r in mapped)
    checks["supports"] = [s["id"] for s in bridge["supports"]] == ["S1", "S2", "S3", "S4"]
    checks["finite_support_positions"] = all(len(s["position"]) == 2 and all(math.isfinite(v) for v in s["position"]) for s in bridge["supports"])
    design = bridge["design"]
    checks["published_design_parameters"] = (
        design["type"] == "asymmetric_cable_stayed"
        and design["cablePlanes"] == 2
        and design["mainCableStayedLengthM"] == 200
        and design["pylonHeightM"] == 113
        and design["mainBridgeLengthM"] == 885.7
        and design["totalProjectLengthM"] == 1465
        and design["lanes"] == 6
    )
    checks["provenance"] = len(bridge["sources"]) >= 2 and all(s["url"].startswith("https://") for s in bridge["sources"])
    checks["honesty_flags"] = bridge["surveyedGeometry"] is False and bridge["classification"] == "illustrative_structure_anchored_to_mapped_centerline"
    checks["runtime_contract"] = all(token in runtime for token in ("supports:4", "pylonHeightM:113", "cablePlanes:2", "cables:28", "surveyedGeometry:false"))
    result = {
        "status": "PASS" if all(checks.values()) else "FAIL",
        "checks": checks,
        "mappedRoadIds": bridge["mappedRoadIds"],
        "supportCount": len(bridge["supports"]),
        "sourceCount": len(bridge["sources"]),
        "classification": bridge["classification"],
        "surveyedGeometry": bridge["surveyedGeometry"],
        "sha256": bridge["sha256"],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding='utf-8', newline='\n')
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
