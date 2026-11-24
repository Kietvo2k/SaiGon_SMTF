#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tra ứng viên nút trọng điểm khu Bắc từ outputs/hcmc-poc/data/road-graph-31.json.

Chỉ là script tra cứu để viết đặc tả (work/, không commit): in bảng node id OSM,
x, z, tên đường giao, số nhánh, cấp đường cao nhất. Không sửa dữ liệu.

Chạy:  PYTHONUTF8=1 python work/tra-nut-trong-diem-31.py [--top N]
"""
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
GRAPH = ROOT / "outputs" / "hcmc-poc" / "data" / "road-graph-31.json"

# Đa giác khu bac, sao chép từ city-region-31.js (hệ cảnh, m; x = đông, z = nam).
# Thứ tự giữ nguyên ring('TL','B9','B8','B7','B6','B5','B4','B3','B2','B1','N8','M0',
# 'N7','N6','N5','N4','N3','N2','N1','A').
BAC_POLY = [
    [-3600, -3700], [1150, -3700], [1250, -3100], [1450, -2700], [1710, -2300],
    [1700, -1900], [1600, -1500], [1445, -1200], [1180, -1000], [700, -920],
    [60, -960], [-230, -975], [-380, -1130], [-520, -1330], [-770, -1480],
    [-1250, -1560], [-1900, -1760], [-2450, -1900], [-3050, -1960], [-3600, -2060],
]
# Cụm Hàng Xanh (quyết định §8): quanh x 0, z -2485 hệ cảnh.
HANG_XANH = (0.0, -2485.0, 420.0)  # tâm + bán kính lọc cụm (m)
HX_QUOTA = 6                       # số nút tối đa giữ cho cụm Hàng Xanh
REGION_TRAFFIC_MARGIN_M = 250.0    # = REGION_TRAFFIC_MARGIN_M của city-region-31.js
# Tên đường ưu tiên theo quyết định §2/§8 (để không sót cụm đã chốt).
PRIORITY = (
    "Hàng Xanh", "Điện Biên Phủ", "Xô Viết Nghệ Tĩnh", "Đinh Bộ Lĩnh",
    "Nguyễn Hữu Cảnh", "Cầu Sài Gòn", "Phan Đăng Lưu", "Lê Quang Định",
    "Nguyễn Bỉnh Khiêm", "Ung Văn Khiêm", "Nguyễn Gia Trí", "Bạch Đằng",
)

RANK = {"motorway": 6, "trunk": 5, "primary": 4, "secondary": 3, "tertiary": 2}
RANK_LABEL = {6: "motorway", 5: "trunk", 4: "primary", 3: "secondary", 2: "tertiary", 1: "nhỏ", 0: "không lái được"}


def fold(name):
    """Chuẩn hóa tên để so khớp: dữ liệu OSM có chỗ dùng 'Ð' (U+00D0) thay 'Đ'."""
    return name.replace("Ð", "Đ").replace("ð", "đ").lower()


def in_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def dist_poly(x, z, poly):
    best = float("inf")
    for i in range(len(poly)):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % len(poly)]
        sx, sz = bx - ax, bz - az
        l = sx * sx + sz * sz
        t = max(0.0, min(1.0, ((x - ax) * sx + (z - az) * sz) / l)) if l else 0.0
        best = min(best, math.hypot(ax + sx * t - x, az + sz * t - z))
    return best


def main():
    top = 12
    if "--top" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1])

    data = json.loads(GRAPH.read_text(encoding="utf-8"))
    roads = data["roads"]
    nodes = data["nodes"]
    edges = data["edges"]

    node_road_names = {}   # node OSM id -> set(tên đường)
    node_road_types = {}   # node OSM id -> set(highway)
    for e in edges:
        r = roads[e["road"]]
        name = (r.get("name") or "").strip()
        hw = (r.get("highway") or r.get("type") or "").replace("_link", "")
        for key in ("from", "to"):
            nid = e[key]
            node_road_names.setdefault(nid, set())
            node_road_types.setdefault(nid, set())
            if name:
                node_road_names[nid].add(name)
            if hw:
                node_road_types[nid].add(hw)

    cands = []
    for n in nodes:
        x, z = float(n["x"]), float(n["z"])
        # Cùng phép thử với regionTrafficContains (margin 250 m, city-region-31.js):
        # nút sát ranh (ĐBP × Nguyễn Bỉnh Khiêm, đầu cầu…) vẫn thuộc khu giao thông.
        if not (in_poly(x, z, BAC_POLY) or dist_poly(x, z, BAC_POLY) <= REGION_TRAFFIC_MARGIN_M):
            continue
        names = sorted(node_road_names.get(n["id"], ()))
        types = node_road_types.get(n["id"], set())
        streets = [t for t in names if not fold(t).startswith("hẻm")]
        if len(streets) < 2 and len(names) < 2 and n.get("degree", 0) < 3:
            continue
        rank = max((RANK.get(t, 1) for t in types), default=0)
        pri = sum(1 for s in streets for p in PRIORITY if fold(p) in fold(s))
        score = rank * 10 + min(n.get("degree", 0), 8) + min(len(streets), 4) * 3 + pri * 10
        hx = math.hypot(x - HANG_XANH[0], z - HANG_XANH[1]) <= HANG_XANH[2]
        if hx:
            score += 25
        cands.append({
            "id": n["id"], "x": x, "z": z, "kind": n.get("kind"),
            "degree": n.get("degree", 0), "names": names, "streets": streets,
            "rank": rank, "score": score, "hang_xanh": hx,
            "key": frozenset(streets) if streets else frozenset({f"id:{n['id']}"}),
        })

    cands.sort(key=lambda c: (-c["score"], c["id"]))
    picked, seen_keys, hx_picked = [], set(), 0
    for c in cands:                       # cụm Hàng Xanh: 1 nút / cụm tên đường, tối đa 6
        if hx_picked >= HX_QUOTA:
            break
        if not c["hang_xanh"] or c["key"] in seen_keys:
            continue
        picked.append(c)
        seen_keys.add(c["key"])
        hx_picked += 1
    for c in cands:                       # phần còn lại: 1 nút / cụm giao danh sách tên đường
        if len(picked) >= top:
            break
        if c["key"] in seen_keys or c in picked:
            continue
        if c["hang_xanh"]:                # không để cụm Hàng Xanh lấn chỗ đa dạng
            continue
        seen_keys.add(c["key"])
        picked.append(c)
    picked.sort(key=lambda c: (-c["score"], c["id"]))

    print("ỨNG VIÊN nút trọng điểm khu Bắc (road-graph-31.json, hệ cảnh m)")
    print(f"{'#':>2} {'node OSM':>12} {'x':>7} {'z':>7} {'nhánh':>5} {'cấp':>9}  tên đường giao | Hàng Xanh")
    for k, c in enumerate(picked, 1):
        ten = " ∩ ".join(c["names"]) if c["names"] else "(không tên)"
        print(f"{k:>2} {c['id']:>12} {c['x']:>7.0f} {c['z']:>7.0f} {c['degree']:>5} "
              f"{RANK_LABEL[c['rank']]:>9}  {ten} | {'X' if c['hang_xanh'] else ''}")
    print(f"\nTổng ứng viên khu Bắc (đa giác + margin {REGION_TRAFFIC_MARGIN_M:.0f} m): {len(cands)}"
          f" (bậc ≥ 3 nhánh hoặc ≥ 2 tên đường); nhóm Hàng Xanh: bán kính {HANG_XANH[2]:.0f} m quanh ({HANG_XANH[0]:.0f}, {HANG_XANH[1]:.0f})")


if __name__ == "__main__":
    main()
