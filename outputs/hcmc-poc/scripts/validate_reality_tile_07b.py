#!/usr/bin/env python3
"""Fail-loud checks for the first procedural GLB hot-swap tile."""
import hashlib
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TILE = ROOT / "tiles" / "rp-r2c3"
glb = (TILE / "lod2.glb").read_bytes()
magic, version, length = struct.unpack("<4sII", glb[:12])
json_len, json_type = struct.unpack("<II", glb[12:20])
doc = json.loads(glb[20:20 + json_len].decode().strip())
prov = json.loads((TILE / "provenance.json").read_text(encoding='utf-8'))
tileset = json.loads((ROOT / "data" / "3dtiles" / "tileset-07b.json").read_text(encoding='utf-8'))
sha = hashlib.sha256(glb).hexdigest()
checks = {
    "valid_glb2_header": magic == b"glTF" and version == 2 and length == len(glb) and json_type == 0x4E4F534A,
    "glb_declares_193_buildings": doc.get("extras", {}).get("buildingCount") == 193,
    "glb_is_explicitly_procedural": doc.get("extras", {}).get("classification") == "procedural_open_data_lod2" and doc.get("extras", {}).get("surveyedRealityMesh") is False,
    "provenance_hash_matches": prov.get("sha256") == sha,
    "provenance_contract_present": all(k in prov for k in ("tileId","contentUri","source","license","captureDate","horizontalCrs","verticalDatum","quality")),
    "quality_is_unverified": prov.get("quality", {}).get("status") == "unverified" and prov.get("quality", {}).get("positionAccuracyM") is None and prov.get("quality", {}).get("textureGsdCm") is None,
    "content_uri_resolves": (TILE / prov.get("contentUri", "missing")).is_file(),
    "tileset_references_glb": tileset["root"]["content"]["uri"] == "../../tiles/rp-r2c3/lod2.glb",
    "tileset_denies_survey_grade": tileset["root"]["extras"]["surveyedRealityMesh"] is False,
}
report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "tileId": "rp-r2c3", "bytes": len(glb), "sha256": sha}
(ROOT / "research" / "reality-tile-07b-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding='utf-8', newline='\n')
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if report["status"] == "PASS" else 1)
