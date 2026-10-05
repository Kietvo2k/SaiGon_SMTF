#!/usr/bin/env python3
"""Dựng registry signature 31A: các đối tượng không bao giờ bị giảm chi tiết bởi "Mật độ chi tiết".

Xác định hoàn toàn (không ngẫu nhiên): id được đọc từ code runtime và data nguồn,
chỉ phần ngữ nghĩa (nhãn nào là công trình/đường/vùng, cầu nào qua sông) là danh mục tay.
Chạy: python outputs/hcmc-poc/scripts/build_signature_registry_31.py
"""
import hashlib
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "data" / "signature-registry-31.json"
OUT_JS = ROOT / "data" / "signature-registry-31.js"
INPUTS = [
    "webgpu-materials-24.js", "city-hero-corridor-30.js", "city-identity-facades-30.js",
    "hero-zone-20a.js", "hero-cluster-20b.js", "landmark-detail.js", "bach-dang-footbridge.js",
    "data/webgpu-corrections-24.js", "data/ba-son-bridge-detail.json", "data/bach-dang-footbridge.json",
    "data/facades-30.json", "data/facades-15.js", "data/times-facade-16d.js", "data/scene.js", "data/osm-raw.json",
]
# Bán kính đệm (m) quanh tim đường cho vùng giữ cây/đèn; đèn corridor đặt ở ±7 m, cây vỉa hè ~10–20 m.
CORRIDOR_BUFFER_M = 30.0
NGUYEN_HUE_BUFFER_M = 35.0  # đại lộ Nguyễn Huệ rộng ~64 m giữa hai dãy nhà
FOOTPRINT_BUFFER_M = 10.0
NEAREST_LIMIT_M = 40.0

# Cầu lớn qua sông Sài Gòn và rạch Bến Nghé (tên OSM chính xác của các way có tag bridge).
RIVER_BRIDGES = [
    ("Cầu Thủ Thiêm", "sông Sài Gòn"),
    ("Cầu Sài Gòn", "sông Sài Gòn"),
    ("Cầu Sài Gòn 2", "sông Sài Gòn"),
    ("Cầu Khánh Hội", "rạch Bến Nghé"),
    ("Cầu Ông Lãnh", "rạch Bến Nghé"),
    ("Cầu Calmette", "rạch Bến Nghé"),
    ("Cầu Chữ Y", "rạch Bến Nghé"),
    ("Cầu Mống", "rạch Bến Nghé"),
    ("Cầu Nguyễn Văn Cừ", "rạch Bến Nghé"),
]
# Cầu lớn liên quan nhưng không có way bridge trong osm-raw.json (builder dừng nếu dữ liệu đổi).
EXPECTED_MISSING_BRIDGES = [("Cầu Phú Mỹ", "sông Sài Gòn"), ("Cầu Thủ Thiêm 3", "sông Sài Gòn"), ("Cầu Thủ Thiêm 4", "sông Sài Gòn")]

# Ngữ nghĩa từng nhãn trong `places` của webgpu-materials-24.js.
PLACE_SEMANTICS = {
    "BITEXCO": ("building", None),
    "NHÀ HÁT THÀNH PHỐ": ("building", None),
    "LANDMARK 81": ("building", None),
    "MARINA CENTRAL · 240 M": ("building", None),
    "GRAND MARINA · 4 THÁP": ("building", None),
    "CẦU BA SON": ("bridge", None),
    "NGUYỄN HUỆ": ("road", "Nguyễn Huệ"),
    "ĐỒNG KHỞI": ("road", "Đồng Khởi"),
    "QUỐC HƯƠNG": ("road", "Quốc Hương"),
    "NGUYỄN VĂN HƯỞNG": ("road", "Nguyễn Văn Hưởng"),
    "THẢO ĐIỀN · VÙNG HIỆU CHỈNH": ("road", "Thảo Điền"),
    "BẾN BẠCH ĐẰNG": ("zone", "Công viên Bến Bạch Đằng"),
    "QUẢNG TRƯỜNG LAM SƠN": ("road", "Công trường Lam Sơn"),
}


def text(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def window_payload(rel, name):
    raw = text(rel)
    prefix = f"window.{name}="
    assert raw.startswith(prefix), rel
    return json.loads(raw[len(prefix):].strip().rstrip(";"))


def line_of(rel, needle):
    for number, line in enumerate(text(rel).splitlines(), 1):
        if needle in line:
            return f"{rel}:{number}"
    raise SystemExit(f"Không tìm thấy '{needle}' trong {rel}")


def regex_ids(rel, pattern):
    match = re.search(pattern, text(rel))
    if not match:
        raise SystemExit(f"Không khớp {pattern} trong {rel}")
    return [int(value) for value in match.group(1).split(",")]


def norm(name):
    return unicodedata.normalize("NFC", name or "").replace("\u00d0", "\u0110").casefold().strip()


def slug(name):
    # Key ASCII ổn định: bỏ dấu, đ→d, mọi ký tự khác chữ/số thành '-'.
    base = unicodedata.normalize("NFD", norm(name).replace("đ", "d"))
    return re.sub(r"[^a-z0-9]+", "-", "".join(ch for ch in base if not unicodedata.combining(ch))).strip("-")


def contains(point, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        a, b = ring[i], ring[j]
        if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
        j = i
    return inside


def in_rings(point, rings):
    return contains(point, rings[0]) and not any(contains(point, hole) for hole in rings[1:])


def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def buffered_hull(points, radius):
    """Bao lồi của các điểm nở đều theo 8 hướng: xấp xỉ vùng đệm, xác định, không cần thư viện."""
    grown = [(round(x + radius * math.cos(k * math.pi / 4), 2), round(z + radius * math.sin(k * math.pi / 4), 2))
             for x, z in points for k in range(8)]
    return [list(p) for p in hull(grown)]


def capsules(coords, radius):
    # Một đa giác cho mỗi đoạn tim đường để vùng bám sát đường cong, không phủ lố.
    return [buffered_hull([tuple(coords[i]), tuple(coords[i + 1])], radius) for i in range(len(coords) - 1)]


def make_zone(polygons, protects):
    xs = [p[0] for ring in polygons for p in ring]
    zs = [p[1] for ring in polygons for p in ring]
    return {"protects": protects, "bbox": [min(xs), min(zs), max(xs), max(zs)], "polygons": polygons}


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # in tiếng Việt an toàn trên console Windows cp1252
    scene = window_payload("data/scene.js", "CITY_DATA")
    osm = json.loads(text("data/osm-raw.json"))
    center = scene["meta"]["center"]
    kx = 111320 * math.cos(math.radians(center[1]))

    def xz(lon, lat):
        return (round((lon - center[0]) * kx, 2), round((center[1] - lat) * 110574, 2))

    buildings = scene["buildings"]
    by_id = {}
    for b in buildings:
        by_id.setdefault(int(b["id"]), []).append(b)
    roads = {int(r["id"]): r for r in scene["roads"]}
    osm_ways = {e["id"]: e for e in osm["elements"] if e["type"] == "way"}
    water = scene["water"]
    bbox = scene["meta"]["bbox"]

    entries, unresolved = [], []

    def add(**entry):
        entry.setdefault("ids", [])
        if entry["kind"] in ("bridge", "road"):
            # Way chỉ có trong osm-raw (chưa vào D.roads) vẫn là signature nhưng không tính trong audit hiển thị.
            off_scene = [wid for wid in entry["ids"] if wid not in roads]
            if off_scene:
                entry["offScene"] = off_scene
        entries.append(entry)
        return entry

    def bname(bid):
        return next((b["name"] for b in by_id.get(bid, []) if b.get("name")), "")

    # 1. Ba hero envelope thay proxy gộp trong city mesh.
    hero_ids = regex_ids("webgpu-materials-24.js", r"heroEnvelopeIds=new Set\(\[([\d,]+)\]\)")
    hero_src = line_of("webgpu-materials-24.js", "const heroEnvelopeIds=")
    for bid in hero_ids:
        add(key=f"hero-envelope-{bid}", group="hero_envelopes", kind="building", label=bname(bid), ids=[bid], source=hero_src,
            reason="Hero envelope có nguồn ảnh thay proxy gộp; footprint bị loại khỏi city mesh nên không được giảm hay ẩn thêm.")

    # 2. Cầu Ba Son: way OSM + toàn bộ kết cấu dây văng.
    ba_son = json.loads(text("data/ba-son-bridge-detail.json"))
    add(key="ba-son-bridge-ways", group="ba_son_bridge", kind="bridge", label="Cầu Ba Son", ids=ba_son["mappedRoadIds"],
        source="data/ba-son-bridge-detail.json#mappedRoadIds",
        reason="Cầu Ba Son (Thủ Thiêm 2) là biểu tượng sông Sài Gòn; mặt cầu phải liên tục ở mọi mức mật độ.")
    add(key="ba-son-bridge-structure", group="ba_son_bridge", kind="module", label="Cầu Ba Son · kết cấu dây văng",
        module="webgpu-materials-24.js#bridgeGroup", source=line_of("webgpu-materials-24.js", "const bridgeGroup="),
        reason="Toàn bộ trụ, tháp và 28 dây văng của cầu Ba Son là nhận diện chính; không được lược dây hay trụ.")

    # 3. Cầu đi bộ Bạch Đằng.
    footbridge = json.loads(text("data/bach-dang-footbridge.json"))
    add(key="bach-dang-footbridge-ways", group="bach_dang_footbridge", kind="bridge", label=footbridge["name"],
        ids=footbridge["mappedConstructionWayIds"], source="data/bach-dang-footbridge.json#mappedConstructionWayIds",
        reason="Cầu đi bộ Bến Bạch Đằng – Thủ Thiêm đang thi công, là signature bờ sông trung tâm.")
    add(key="bach-dang-footbridge-structure", group="bach_dang_footbridge", kind="module", label="Cầu đi bộ · vòm lá dừa nước",
        module="bach-dang-footbridge.js", source=line_of("bach-dang-footbridge.js", "BACH_DANG"),
        reason="Kết cấu vòm cầu đi bộ hiện chỉ dựng trong runtime legacy; khi đưa vào WebGPU phải giữ nguyên.")

    # 4. Cầu lớn qua sông Sài Gòn và rạch Bến Nghé, tra theo tên trong osm-raw.json.
    def way_coords(wid):
        if wid in roads:
            return roads[wid]["c"]
        return [list(xz(g["lon"], g["lat"])) for g in osm_ways[wid].get("geometry") or []]

    def crosses_water(coords):
        for i in range(len(coords) - 1):
            a, b = coords[i], coords[i + 1]
            for step in range(11):
                t = step / 10
                p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                if any(in_rings(p, rings) for rings in water):
                    return True
        return False

    def outside_bbox(wid):
        return any(not (bbox[0] <= g["lon"] <= bbox[2] and bbox[1] <= g["lat"] <= bbox[3]) for g in osm_ways[wid].get("geometry") or [])

    for name, waterway in RIVER_BRIDGES:
        ids = sorted(wid for wid, e in osm_ways.items() if e.get("tags", {}).get("name") == name and e["tags"].get("bridge", "no") != "no")
        if not ids:
            unresolved.append({"label": name, "reason": f"Không có way bridge tên '{name}' trong osm-raw.json."})
            continue
        add(key=f"river-bridge-{slug(name)}", group="river_bridges", kind="bridge", label=name, ids=ids, water=waterway,
            crossesWater=any(crosses_water(way_coords(wid)) for wid in ids),
            partlyOutsideBbox=any(outside_bbox(wid) for wid in ids),
            source=f"data/osm-raw.json#way[bridge][name='{name}']",
            reason=f"Cầu lớn qua {waterway}: mốc định hướng của trục sông, phải giữ liên tục ở mọi mức mật độ.")
    for name, waterway in EXPECTED_MISSING_BRIDGES:
        named = {wid: e["tags"] for wid, e in osm_ways.items() if e.get("tags", {}).get("name") == name}
        if any(tags.get("bridge", "no") != "no" for tags in named.values()):
            raise SystemExit(f"{name} đã có way bridge trong osm-raw.json: chuyển sang RIVER_BRIDGES")
        if named:
            unresolved.append({"label": name, "water": waterway, "osmWayIds": sorted(named),
                               "reason": f"Chỉ có way highway={'/'.join(sorted({t.get('highway', '?') for t in named.values()}))} (chưa xây), không có tag bridge và không có trong D.roads nên không có gì để giữ."})
        else:
            unresolved.append({"label": name, "water": waterway,
                               "reason": f"Không có way nào mang tên này trong osm-raw.json; cầu nằm ngoài bbox tải {bbox}."})

    # 5. Marina Central và Grand Marina (WEBGPU_CORRECTIONS_24).
    corrections = text("data/webgpu-corrections-24.js")
    marina_block, grand_block = corrections.split("grandMarina:", 1)
    marina_ids = [int(v) for v in re.findall(r"(\d{6,}):Object\.freeze", marina_block)]
    grand_ids = [int(v) for v in re.findall(r"(\d{6,}):Object\.freeze", grand_block)]
    add(key="marina-central-tower", group="marina", kind="building", label="Marina Central Tower", ids=marina_ids,
        source=line_of("data/webgpu-corrections-24.js", "marinaCentral:"),
        reason="Marina Central 240 m / 55 tầng: ba phần footprint OSM đã hiệu chỉnh chiều cao chính thức.")
    add(key="grand-marina-residences", group="marina", kind="building", label="Grand Marina Residences", ids=grand_ids,
        source=line_of("data/webgpu-corrections-24.js", "grandMarina:"),
        reason="Cụm 4 tháp Grand Marina đã hiệu chỉnh chiều cao theo số tầng chính thức; là skyline Ba Son.")
    for key, needle, label in [("marina-central-detail", "const marinaDetail=", "Marina Central · dải giật cấp + vương miện"),
                               ("grand-marina-detail", "const grandMarinaDetail=", "Grand Marina · vương miện + khung")]:
        add(key=key, group="marina", kind="module", label=label, module=f"webgpu-materials-24.js#{needle[6:-1]}",
            source=line_of("webgpu-materials-24.js", needle), reason="Chi tiết nhận diện có nguồn của cụm Marina; không được lược ở mức mật độ thấp.")

    # 6. Hero corridor Lam Sơn – Đồng Khởi.
    frames = re.findall(r"(\w+):\{key:'\w+',name:'([^']+)',buildingId:(\d+),a:\[([-\d.]+),([-\d.]+)\],b:\[([-\d.]+),([-\d.]+)\]", text("city-hero-corridor-30.js"))
    corridor_roads = regex_ids("city-hero-corridor-30.js", r"roadIds=new Set\(\[([\d,]+)\]\)")
    for key, name, bid, *_ in frames:
        add(key=f"hero-corridor-{key}", group="hero_corridor", kind="building", label=name, ids=[int(bid)],
            source=line_of("city-hero-corridor-30.js", f"{key}:{{key:'{key}'"),
            reason="Công trình hero của corridor Lam Sơn – Đồng Khởi có vỏ hình học và ảnh nguồn riêng.")
    add(key="hero-corridor-roads", group="hero_corridor", kind="road", label="Công trường Lam Sơn · Đồng Khởi", ids=corridor_roads,
        source=line_of("city-hero-corridor-30.js", "const roadIds="),
        reason="Sáu tim đường OSM neo mặt đường PBR, curb, vạch và đèn phố của corridor.")
    add(key="hero-corridor-module", group="hero_corridor", kind="module", label="Hero Corridor 30B", module="city-hero-corridor-30.js#createHeroCorridor30",
        source=line_of("webgpu-materials-24.js", "createHeroCorridor30({"), reason="Toàn bộ lớp hero corridor (vỏ công trình, public realm, đèn) giữ nguyên ở mọi mức mật độ.")

    def park_polygons(name):
        rings = [[list(xz(g["lon"], g["lat"])) for g in e["geometry"]] for e in osm_ways.values()
                 if e.get("tags", {}).get("name") == name and e["tags"].get("leisure") == "park"]
        return [ring[:-1] if ring[0] == ring[-1] else ring for ring in rings]

    corridor_polygons = [poly for wid in corridor_roads for poly in capsules(roads[wid]["c"], CORRIDOR_BUFFER_M)]
    for bid in hero_ids:
        for b in by_id[bid]:
            corridor_polygons.append(buffered_hull([tuple(p) for p in b["r"][0]], FOOTPRINT_BUFFER_M))
    corridor_polygons += park_polygons("Công viên Lam Sơn")
    add(key="zone-hero-corridor", group="hero_corridor", kind="zone", label="Vùng giữ cây/đèn · corridor Lam Sơn – Đồng Khởi",
        zone=make_zone(corridor_polygons, ["tree", "lamp"]),
        method=f"Đệm {CORRIDOR_BUFFER_M:g} m quanh từng đoạn tim đường corridor + đệm {FOOTPRINT_BUFFER_M:g} m quanh 3 footprint hero + công viên Lam Sơn (OSM).",
        source=line_of("city-hero-corridor-30.js", "const roadIds="),
        reason="Cây và đèn phố trong corridor là một phần cảnh hero; bộ lọc mật độ không được bỏ.")

    # 7. Phố đi bộ Nguyễn Huệ.
    nh_ids = sorted(wid for wid, r in roads.items() if norm(r.get("name")) == norm("Nguyễn Huệ"))
    add(key="zone-nguyen-hue", group="protected_zones", kind="zone", label="Vùng giữ cây/đèn · phố đi bộ Nguyễn Huệ",
        zone=make_zone([poly for wid in nh_ids for poly in capsules(roads[wid]["c"], NGUYEN_HUE_BUFFER_M)], ["tree", "lamp"]),
        method=f"Đệm {NGUYEN_HUE_BUFFER_M:g} m quanh từng đoạn của {len(nh_ids)} way OSM tên 'Nguyễn Huệ' trong D.roads ({nh_ids}).",
        source="data/scene.js#roads[name='Nguyễn Huệ']",
        reason="Phố đi bộ Nguyễn Huệ là không gian công cộng biểu tượng; hàng cây và đèn phải giữ nguyên.")

    # 8. Identity facades 30 (cùng bộ lọc với city-identity-facades-30.js) và photo facades legacy.
    for e in json.loads(text("data/facades-30.json"))["entries"]:
        bid = int(e["building_id"])
        if (e.get("surface_fit") or {}).get("eligible") is True and e.get("render_mode") != "sampled_envelope" and bid not in hero_ids:
            add(key=f"identity-facade-{e['key']}", group="identity_facades_30", kind="building", label=e["name"], ids=[bid],
                source=f"data/facades-30.json#{e['key']}", reason="Mặt đứng ảnh đã qua cổng phẳng, đang render trong runtime 30B; footprint phải giữ để ảnh không lơ lửng.")
    for e in window_payload("data/facades-15.js", "FACADES_15")["manifest"]["entries"]:
        add(key=f"photo-facade-{e['key']}", group="photo_facades", kind="building", label=e["name"], ids=[int(e["building_id"])],
            source=f"data/facades-15.js#{e['key']}", reason="Công trình có ảnh mặt đứng nguồn (batch 15/16) trên trục Nguyễn Huệ – Đồng Khởi.")
    times = window_payload("data/times-facade-16d.js", "TIMES_FACADE_16D")["manifest"]
    add(key="photo-facade-times-16d", group="photo_facades", kind="building", label="Saigon Times Square · mặt kính 16d", ids=[int(times["building_id"])],
        source="data/times-facade-16d.js#manifest.building_id", reason="Mặt kính Times Square được dựng riêng ở batch 16d; là điểm nhấn cuối trục Nguyễn Huệ.")

    # 9. Nhãn `places`: xác định footprint/way/vùng tương ứng.
    places_src = line_of("webgpu-materials-24.js", "const places=")
    places = json.loads(re.search(r"const places=(\[\[.*?\]\]);", text("webgpu-materials-24.js")).group(1).replace("'", '"'))
    for label, lon, lat, _height in places:
        kind, ref = PLACE_SEMANTICS[label]
        anchor = xz(lon, lat)
        entry = dict(key=f"place-{slug(label)}", group="places", kind=kind, label=label,
                     anchor=list(anchor), source=places_src)
        if kind == "building":
            hits = sorted({int(b["id"]) for b in buildings if abs(b["center"][0] - anchor[0]) < 400 and abs(b["center"][1] - anchor[1]) < 400 and in_rings(anchor, b["r"])})
            if hits:
                entry.update(ids=hits, method="Point-in-polygon: mọi footprint (vòng ngoài trừ lỗ) chứa điểm neo nhãn.")
            else:
                nearest = min(buildings, key=lambda b: math.dist(b["center"], anchor))
                distance = math.dist(nearest["center"], anchor)
                if distance > NEAREST_LIMIT_M:
                    unresolved.append({"label": label, "reason": f"Không footprint nào chứa điểm neo; gần nhất cách {distance:.1f} m > {NEAREST_LIMIT_M:g} m."})
                    continue
                entry.update(ids=[int(nearest["id"])], method=f"Không footprint chứa điểm neo; chọn tâm footprint gần nhất ({distance:.1f} m ≤ {NEAREST_LIMIT_M:g} m).")
            entry["reason"] = "Công trình mang nhãn bản đồ; nhãn không được trỏ vào chỗ trống khi giảm mật độ."
        elif kind == "bridge":
            entry.update(ids=ba_son["mappedRoadIds"], method="mappedRoadIds trong data/ba-son-bridge-detail.json.",
                         reason="Nhãn cầu Ba Son; mặt cầu phải luôn hiển thị dưới nhãn.")
        elif kind == "road":
            ids = sorted(wid for wid, r in roads.items() if norm(r.get("name")) == norm(ref))
            entry.update(ids=ids, method=f"Mọi way trong D.roads có tên '{ref}' (chuẩn hóa NFC, Ð U+00D0 → Đ U+0110).",
                         reason="Tuyến đường mang nhãn bản đồ (trục trung tâm hoặc hành lang Flood Lab); không được ẩn dưới nhãn.")
        else:
            polygons = park_polygons(ref)
            gap = 0.0 if any(contains(anchor, ring) for ring in polygons) else min(math.dist(anchor, p) for ring in polygons for p in ring)
            entry.update(zone=make_zone(polygons, ["tree", "lamp"]), anchorDistanceM=round(gap, 1),
                         method=f"Đa giác OSM leisure=park tên '{ref}' trong osm-raw.json, chiếu về mét cục bộ.",
                         reason="Không gian công cộng mang nhãn; giữ cây và đèn trong công viên.")
        add(**entry)

    # 10. Signature bổ sung tìm thấy trong code.
    lm_ids = sorted({int(b["id"]) for b in buildings if b.get("type") == "illustrative-landmark-part"})
    add(key="extra-landmark-81", group="extra", kind="building", label="Landmark 81 · bó tháp minh họa", ids=lm_ids,
        source=line_of("landmark-detail.js", "illustrative-landmark-part"),
        reason="Bó tháp minh họa Landmark 81 (type illustrative-landmark-part); id dùng chung với footprint Vincom Center.")
    opera = next(e for e in window_payload("data/facades-15.js", "FACADES_15")["manifest"]["entries"] if e["key"] == "opera")
    add(key="extra-opera-hero-20a", group="extra", kind="building", label="Opera hero 20A", ids=[int(opera["building_id"])],
        source=line_of("hero-zone-20a.js", "e.key==='opera'"), reason="Cảnh hero Nhà hát batch 20A dựng từ ảnh chỉnh phối cảnh.")
    cluster_keys = ["continental", "caravelle"]
    add(key="extra-hero-cluster-20b", group="extra", kind="building", label="Hero cluster 20B · Continental + Caravelle",
        ids=sorted(int(e["building_id"]) for e in window_payload("data/facades-15.js", "FACADES_15")["manifest"]["entries"] if e["key"] in cluster_keys),
        source=line_of("hero-cluster-20b.js", "['opera','continental','caravelle']"), reason="Cụm hero batch 20B quanh quảng trường Lam Sơn.")
    add(key="extra-hero-cluster-20b-roads", group="extra", kind="road", label="Hero cluster 20B · Lam Sơn + Đồng Khởi",
        ids=sorted(set(regex_ids("hero-cluster-20b.js", r"lamson:\[([\d,]+)\]") + regex_ids("hero-cluster-20b.js", r"dongkhoi:\[([\d,]+)\]"))),
        source=line_of("hero-cluster-20b.js", "const roadIds="), reason="Tim đường neo public realm của cụm hero 20B.")
    add(key="extra-identity-facades-module", group="extra", kind="module", label="Identity Facades 30B", module="city-identity-facades-30.js#createIdentityFacades30",
        source=line_of("webgpu-materials-24.js", "createIdentityFacades30({"), reason="Lớp mặt đứng ảnh nhận diện; mật độ không được ẩn lớp này.")

    registry = {
        "schema": "rtr.city-lab.signature-registry.v1",
        "version": "31A",
        "generated": {
            "script": "scripts/build_signature_registry_31.py",
            "deterministic": True,
            "hash": "sha256 nội dung đã chuẩn hóa CRLF→LF (ổn định giữa checkout Windows/Linux)",
            "inputs": [{"path": rel, "sha256": hashlib.sha256((ROOT / rel).read_bytes().replace(b"\r\n", b"\n")).hexdigest()} for rel in INPUTS],
        },
        "coordinates": {"frame": "mét cục bộ [x, z] quanh CITY_DATA.meta.center", "center": center,
                        "projection": "x=(lon-lon0)·111320·cos(lat0), z=(lat0-lat)·110574"},
        "policy": "Mọi bộ lọc 'Mật độ chi tiết' phải đi qua signature-registry-31.js; mục trong registry luôn hiển thị ở mọi mức mật độ.",
        "entries": entries,
        "unresolved": unresolved,
    }
    OUT_JSON.write_text(json.dumps(registry, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    OUT_JS.write_text("window.SIGNATURE_REGISTRY_31=" + json.dumps(registry, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8", newline="\n")
    groups = {}
    for e in entries:
        groups[e["group"]] = groups.get(e["group"], 0) + 1
    print(json.dumps({"entries": len(entries), "groups": groups, "unresolved": [u["label"] for u in unresolved],
                      "bridges": {e["label"]: {"ids": e["ids"], "offScene": e.get("offScene", []), "crossesWater": e["crossesWater"], "partlyOutsideBbox": e["partlyOutsideBbox"]} for e in entries if e["group"] == "river_bridges"},
                      "places": {e["label"]: e["ids"] or e.get("anchorDistanceM") for e in entries if e["group"] == "places"}}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
