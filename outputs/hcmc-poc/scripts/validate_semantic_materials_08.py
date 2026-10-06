#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    d = json.loads((ROOT / "data/semantic-materials-08.json").read_text(encoding='utf-8'))
    checks = {
        "building_count": d["renderedBuildings"] == 70719,
        "direct_records_reconcile": d["directTaggedBuildings"] == len(d["records"]) == 74,
        "tag_counts": d["directTagCounts"] == {"building:colour": 53, "roof:colour": 25, "building:material": 37, "roof:material": 11},
        "coverage_reconciles": d["directCoveragePercent"] == round(74 / 70719 * 100, 3),
        "classification": d["classification"] == "simulated_city_colour_not_observed_photogrammetry",
        "no_texture_claim": any("No street-level imagery or UAV texture" in x for x in d["limitations"]),
        "sources": len(d["sources"]) == 2,
    }
    out = {"status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "directTaggedBuildings": 74, "simulatedBuildings": 70645, "sha256": d["sha256"]}
    (ROOT / "research/semantic-materials-08-validation.json").write_text(json.dumps(out, indent=2) + "\n", encoding='utf-8', newline='\n')
    print(json.dumps(out))
    if out["status"] != "PASS": raise SystemExit(1)


if __name__ == "__main__": main()
