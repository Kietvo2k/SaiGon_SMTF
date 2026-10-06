from pathlib import Path
import datetime, hashlib, json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
manifest = json.loads((DATA / "reality-patch-manifest.json").read_text(encoding='utf-8'))
grid = json.loads((DATA / "reality-patch-grid.geojson").read_text(encoding='utf-8'))
tileset = json.loads((DATA / "3dtiles/tileset-plan.json").read_text(encoding='utf-8'))
registry = json.loads((ROOT / "research/reality-patch-sources.json").read_text(encoding='utf-8'))
embedded = (DATA / "reality-patch.js").read_text(encoding='utf-8').removeprefix("window.REALITY_PATCH=").removesuffix(";\n")

tiles = manifest["tiles"]
checks = {
    "tile_count_16": len(tiles) == 16 == len(grid["features"]),
    "unique_tile_ids": len({t["id"] for t in tiles}) == 16,
    "building_count_reconciles": sum(t["buildingCount"] for t in tiles) == manifest["proxy"]["buildingCount"],
    "reality_is_explicitly_missing": manifest["reality"]["meshCoveragePercent"] == 0 and all(t["realityMesh"] == "missing" for t in tiles),
    "no_fake_3d_tiles_content": all("content" not in child for child in tileset["root"]["children"]),
    "future_glb_contract_present": all(t["futureContent"]["lod2"].endswith(".glb") for t in tiles),
    "embedded_manifest_matches": json.loads(embedded) == manifest,
    "source_registry_has_provenance": all(s.get("name") and "license" in s and "coverage" in s for s in registry["sources"]),
}
assert all(checks.values()), checks
report = {
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "PASS",
    "checks": checks,
    "tileCount": len(tiles),
    "proxyBuildings": manifest["proxy"]["buildingCount"],
    "realityMeshCoveragePercent": 0,
    "manifestSha256": hashlib.sha256((DATA / "reality-patch-manifest.json").read_bytes()).hexdigest(),
}
(ROOT / "research/reality-patch-validation.json").write_text(json.dumps(report, indent=2), encoding='utf-8', newline='\n')
print(json.dumps(report))
