"""Xuất đường khu Bắc cho bản đồ nhiệt web (M4c) — tất định: chạy lại cho cùng một file.

Đầu vào:
  - outputs/hcmc-poc/data/road-graph-31.json  (G.edges, G.roads: tên, cấp đường)
  - outputs/hcmc-poc/city-region-31.js        (đa giác khu `bac`, đỉnh trong `const V`)
  - outputs/smart-traffic/backend/app/seed/node_map.json (6 nút HX)
Đầu ra:
  - outputs/smart-traffic/web/public/north-roads-32.json

Quy tắc: cạnh cấp >= tertiary (motorway…tertiary, kể cả *_link) có ít nhất một đỉnh trong khu
hoặc một đoạn cắt biên khu; tọa độ làm tròn 1 m; giản lược Douglas–Peucker 3 m.
Chạy: python scripts/export_north_roads_32.py   (Python 3.10+, không cần thư viện ngoài)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH = ROOT / 'outputs' / 'hcmc-poc' / 'data' / 'road-graph-31.json'
REGION_JS = ROOT / 'outputs' / 'hcmc-poc' / 'city-region-31.js'
NODE_MAP = ROOT / 'outputs' / 'smart-traffic' / 'backend' / 'app' / 'seed' / 'node_map.json'
OUT = ROOT / 'outputs' / 'smart-traffic' / 'web' / 'public' / 'north-roads-32.json'

REGION_ID = 'bac'
HIGHWAYS = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')   # cấp >= tertiary
SIMPLIFY_M = 3.0
MAX_BYTES = int(1.5 * 1024 * 1024)


def load_region(src_path):
    """Đọc đỉnh `const V={KEY:[x,z],…}` và vòng đa giác của khu `bac` từ city-region-31.js."""
    src = src_path.read_text(encoding='utf-8')
    block = re.search(r'const V=\{(.*?)\};', src, re.S).group(1)
    verts = {m.group(1): (float(m.group(2)), float(m.group(3)))
             for m in re.finditer(r'([A-Z][A-Z0-9]*):\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]', block)}
    m = re.search(r"id:'" + REGION_ID + r"'.*?polygon:ring\(([^)]*)\)", src, re.S)
    if not m:
        raise SystemExit(f'Không tìm thấy khu {REGION_ID} trong {src_path.name}')
    keys = re.findall(r"'([A-Z][A-Z0-9]*)'", m.group(1))
    missing = [k for k in keys if k not in verts]
    if missing or len(keys) < 3:
        raise SystemExit(f'Đỉnh khu {REGION_ID} thiếu: {missing}')
    return [verts[k] for k in keys]


def inside(x, z, poly):
    """Ray casting, cùng cách với inPolygon trong city-region-31.js."""
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            hit = not hit
        j = i
    return hit


def _orient(ax, az, bx, bz, cx, cz):
    return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)


def _seg_cross(p1, p2, p3, p4):
    d1 = _orient(*p3, *p4, *p1)
    d2 = _orient(*p3, *p4, *p2)
    d3 = _orient(*p1, *p2, *p3)
    d4 = _orient(*p1, *p2, *p4)
    return d1 * d2 < 0 and d3 * d4 < 0


def touches_region(pts, poly):
    """Polyline có đỉnh trong khu, hoặc có đoạn cắt biên khu."""
    if any(inside(x, z, poly) for x, z in pts):
        return True
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        for j in range(len(poly)):
            if _seg_cross(a, b, poly[j], poly[(j + 1) % len(poly)]):
                return True
    return False


def _seg_dist(p, a, b):
    px, pz = p
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    L = dx * dx + dz * dz
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L))
    qx, qz = ax + t * dx, az + t * dz
    return ((px - qx) ** 2 + (pz - qz) ** 2) ** 0.5


def simplify(pts, eps):
    """Douglas–Peucker (lặp, không đệ quy); luôn giữ hai đầu."""
    if len(pts) <= 2:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, best_d = -1, -1.0
        for k in range(i + 1, j):
            d = _seg_dist(pts[k], pts[i], pts[j])
            if d > best_d:
                best, best_d = k, d
        if best >= 0 and best_d > eps:
            keep[best] = True
            stack.append((i, best))
            stack.append((best, j))
    return [p for p, k in zip(pts, keep) if k]


def main():
    poly = load_region(REGION_JS)
    G = json.loads(GRAPH.read_text(encoding='utf-8'))
    edges = G['edges']
    if any(e['id'] != i for i, e in enumerate(edges)):
        raise SystemExit('G.edges không khớp chỉ số (id != index)')
    roads = G['roads']
    wanted = set(HIGHWAYS)

    out_edges = []
    for e in edges:
        road = roads[e['road']]
        hw = road.get('highway') or ''
        base = hw[:-5] if hw.endswith('_link') else hw
        if base not in wanted:
            continue
        flat = e['c']
        raw = [(round(flat[i]), round(flat[i + 1])) for i in range(0, len(flat) - 1, 2)]
        pts = []
        for p in raw:
            if not pts or pts[-1] != p:
                pts.append(p)
        if len(pts) < 2:
            continue
        pts_f = [(float(x), float(z)) for x, z in pts]
        if not touches_region(pts_f, poly):
            continue
        simp = simplify(pts, SIMPLIFY_M)
        if len(simp) < 2:
            continue
        out_edges.append({'edge': e['id'], 'name': road.get('name') or '', 'highway': hw,
                          'coords': [[x, z] for x, z in simp]})

    all_xy = [p for e in out_edges for p in e['coords']]
    bbox = [min(p[0] for p in all_xy), min(p[1] for p in all_xy),
            max(p[0] for p in all_xy), max(p[1] for p in all_xy)]

    nodes = [{'id': n['node_id'], 'x': n['x'], 'z': n['z']}
             for n in json.loads(NODE_MAP.read_text(encoding='utf-8')) if n['prefix'] == 'HX']
    nodes.sort(key=lambda n: n['id'])

    doc = {
        'version': 'north-roads-32',
        'source': {'graph': G['version'], 'region': REGION_ID, 'highways': list(HIGHWAYS),
                   'links': True, 'roundM': 1, 'simplifyM': SIMPLIFY_M},
        'attribution': '© OpenStreetMap contributors, ODbL 1.0.',
        'bbox': bbox,
        'nodes': nodes,
        'edges': out_edges,
    }
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n'
    data = text.encode('utf-8')
    if len(data) > MAX_BYTES:
        raise SystemExit(f'File {len(data)} byte vượt giới hạn {MAX_BYTES}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(data)
    print(f'edges={len(out_edges)} nodes={len(nodes)} bbox={bbox} bytes={len(data)} -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
