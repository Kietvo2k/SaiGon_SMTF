"""Batch 31A · Bước A — đồ thị đường và profile cao độ cầu, suy ra từ data/osm-raw.json.

Chạy:   python scripts/build_road_graph_31.py   (shapely theo requirements.txt; không gọi mạng)
Kiểm:   python scripts/validate_road_graph_31.py
Ra:     data/road-graph-31.json và data/road-graph-31.js (`window.ROAD_GRAPH_31=`). Không ghi scene.js.

Khung tọa độ giống scene.js (x đông, z nam, y lên, mét); số làm tròn 0,01.
  frame        groundY (= mặt đường webgpu-materials-24), extent [x0,x1,z0,z1] của bbox.
  roads[i]     song song D.roads[i] (cùng chỉ số): id/part (way OSM + thứ tự mảnh sau cắt bbox),
               nodes[] node OSM cho từng đỉnh D.roads[i].c (số âm = đỉnh sinh do cắt bbox, ghi ở
               boundaryVertices), edges[] chỉ số cạnh theo thứ tự đỉnh; oneway yes|-1|no, layer, maxspeed,
               lanes (+lanesInferred), junction, name, type, tag gốc bridge/tunnel/covered/indoor/highway;
               elevationClass ground|low|canal|overpass|river|skip, elevationReason, signature, override,
               skipRender ('ground' = vẽ phẳng ở groundY, 'hide' = mesh signature thay thế).
  nodes[]      id, x, z, y, kind junction(bậc≥3)|connector(bậc 2)|end(bậc 1)|boundary(cắt bbox), degree,
               adj [[cạnh, đầu (0=from, 1=to), hướng° từ bắc theo chiều kim đồng hồ]].
  edges[i]     from/to (id nút), road (chỉ số D.roads), way, v0..v1 (khoảng đỉnh trong D.roads[road].c),
               c [x0,z0,x1,z1,…], length, oneway, lanes, elevationClass; nếu được nâng: y[] theo đỉnh,
               profile [s0,y0,s1,y1,…] (mẫu dày theo chiều dài, s0=0, s cuối = length), rampOf (id cụm cầu
               khi cạnh mặt đất/skip mang dốc dẫn).
  bridges      clusters (chuỗi cầu nối liền), signature (Ba Son, Bạch Đằng), issue03, conflicts
               (công trình × hành lang cầu, cho bước C), crossings (giao cắt không chung nút), config.
Runtime lấy y tại một điểm: từ roads[i] tìm cạnh chứa đoạn đỉnh, tính s dọc cạnh (cộng dồn từ c), nội
suy tuyến tính profile; cạnh không có profile → frame.groundY.

Profile: mỗi cụm cầu có đỉnh H (bảng BRIDGE_CONFIG hoặc quy tắc lớp). y = g + (H−g)·S(t), S = smoothstep,
t = clamp(D/R, 0, 1), R = 1,5·(H−g)/DESIGN_GRADE nên dốc lớn nhất = DESIGN_GRADE. D = khoảng cách đồ thị tới
"neo mặt đất": đầu cụt của cụm, hoặc vành cách cụm R_out về phía đường mặt đất. R_in = min(R, độ sâu cụm −
PLATEAU_HALF_M) phần dốc nằm trong cầu, R_out = R − R_in lan sang way mặt đất liền kề (cạnh có rampOf).
D là hàm khoảng cách 1-Lipschitz nên y liên tục tại nút và dốc không vượt thiết kế; nhiều cụm lấy max.
Không có ngẫu nhiên; SEED ghi để thống nhất với các builder khác.
"""
import collections, hashlib, heapq, json, math, pathlib, re, sys

sys.dont_write_bytecode = True   # import prepare_scene không để lại scripts/__pycache__ (qa-project-hygiene)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import prepare_scene as ps  # chỉ dùng helper; main() của prepare_scene không chạy khi import
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

ROOT = ps.r
VERSION = 'road-graph-31A'
SEED = 31
GROUND_Y = 1.0                 # webgpu-materials-24.js: const y=road.bridge?13:1.0
WATER_Y = 0.7                  # webgpu-materials-24.js: flatGeometry(r,.7)
DESIGN_GRADE = 0.065           # mục tiêu thiết kế 6–8 %; validator chặn 8 %
SMOOTH_MAX_SLOPE = 1.5         # đạo hàm lớn nhất của smoothstep 3t²−2t³
PLATEAU_HALF_M = 10.0          # nửa chiều dài mặt cầu phẳng tối thiểu trước khi cho dốc vào trong cầu
PROFILE_STEP_M = 4.0
PROFILE_TOL_M = 0.01
DECK_THICKNESS_M = 1.5
CLEARANCE = {'vehicle': 4.5, 'foot': 2.5}
FOOT_HIGHWAYS = {'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway', 'corridor'}
ROAD_WIDTHS = {'motorway': 16, 'trunk': 15, 'primary': 14, 'secondary': 11, 'tertiary': 8, 'residential': 5,
               'living_street': 4, 'service': 3.5, 'unclassified': 5, 'footway': 2.5, 'pedestrian': 12,
               'cycleway': 2, 'path': 1.5}   # webgpu-materials-24.js, ribbon edge = width + 1.8
INFERRED_LANES = {'motorway': 4, 'trunk': 4, 'primary': 4, 'secondary': 2, 'tertiary': 2, 'motorway_link': 1,
                  'trunk_link': 1, 'primary_link': 1, 'secondary_link': 1, 'tertiary_link': 1}
CLASS_RANK = {'low': 1, 'canal': 2, 'overpass': 3, 'river': 4}
# Cao độ đỉnh mặc định (y tuyệt đối) theo lớp: kênh +4 m, cầu vượt +7 m, cầu nhỏ trên rạch/cống +1,5 m.
CLASS_PEAK_Y = {'low': GROUND_Y + 1.5, 'canal': GROUND_Y + 4.0, 'overpass': GROUND_Y + 7.0, 'river': GROUND_Y + 9.0}
RIVER_WATER_CROSS_M = 120.0    # cụm vượt mặt nước dài hơn ngưỡng này mà chưa cấu hình → river

BA_SON_WAYS = [321564421, 321564423]
BA_SON_DECK_TOP_Y = 11.25 + 3.2 / 2       # webgpu-materials-24.js: BoxGeometry(24,3.2,…) tại y=11.25
BACH_DANG_WAYS = [1504289918, 1504289919, 1504289920, 1504289921]
BACH_DANG_DECK_TOP_Y = 13 + 1.15 / 2      # bach-dang-footbridge.js: bdDeck BoxGeometry(w,1.15,…) tại y=13
ISSUE03_WAYS = [732142874, 732142875]
ISSUE03_ROOF = 732220089

# Bảng cấu hình cầu. Khớp theo way id trước, rồi theo tag name. peakY là y tuyệt đối của mặt đường đỉnh cầu
# (groundY = 1,0). Tĩnh không sông Sài Gòn theo Dân trí 23/9/2025: Thủ Thiêm 10 m, Ba Son 10 m, Sài Gòn 8 m;
# cộng ~2 m kết cấu. Các cầu Bến Nghé/Kênh Tẻ/Thị Nghè là ước lượng minh họa, không khảo sát.
BRIDGE_CONFIG = [
    {'key': 'ba-son', 'wayIds': BA_SON_WAYS, 'names': ['Cầu Ba Son'], 'class': 'river', 'peakY': BA_SON_DECK_TOP_Y,
     'signature': 'ba-son',
     'reason': 'Chọn "profile khớp đỉnh hộp", không bỏ ribbon: mặt đường phẳng y=12,85 (= đỉnh BoxGeometry(24,3.2) '
               'tại y=11,25) suốt nhịp qua sông; dốc dẫn hai bờ phần lớn nằm trong chính way cầu (~1 km mỗi way, gồm '
               'cầu dẫn — xem rampInsideM), phần còn lại lan sang đường mặt đất (rampOutsideM, cạnh rampOf) và chạm '
               'y=1,0. Phương án giữ phẳng tới hai đầu đã thử: buộc dốc lan ra 465 cạnh phố Quận 1/Thủ Thiêm cao tới '
               '~12 m — loại. Bước C cho hộp signature bám profile ở hai cầu dẫn. Tĩnh không 10 m (Dân trí 2025).'},
    {'key': 'thu-thiem', 'names': ['Cầu Thủ Thiêm'], 'class': 'river', 'peakY': 13.0,
     'reason': 'Sông Sài Gòn, tĩnh không 10 m (Dân trí 2025) + ~2 m kết cấu.'},
    {'key': 'sai-gon', 'names': ['Cầu Sài Gòn', 'Cầu Sài Gòn 2'], 'class': 'river', 'peakY': 11.0,
     'reason': 'Sông Sài Gòn, tĩnh không 8 m (Dân trí 2025) + ~2 m kết cấu.'},
    {'key': 'nguyen-van-cu', 'names': ['Cầu Nguyễn Văn Cừ'], 'class': 'river', 'peakY': 9.0,
     'reason': 'Kênh Tẻ/Bến Nghé, đường thủy nội địa; ước lượng minh họa ~6 m tĩnh không.'},
    {'key': 'kenh-te', 'names': ['Cầu Kênh Tẻ', 'Cầu Tân Thuận 1', 'Cầu Tân Thuận 2'], 'class': 'river', 'peakY': 9.0,
     'reason': 'Kênh Tẻ có tàu thuyền; ước lượng minh họa ~6 m tĩnh không.'},
    {'key': 'ben-nghe', 'names': ['Cầu Khánh Hội', 'Cầu Ông Lãnh', 'Cầu Calmette', 'Đường dẫn Cầu Calmette'],
     'class': 'river', 'peakY': 8.0, 'reason': 'Rạch Bến Nghé; ước lượng minh họa ~5 m tĩnh không.'},
    {'key': 'chu-y', 'names': ['Cầu Chữ Y'], 'class': 'river', 'peakY': 7.0,
     'reason': 'Ngã ba kênh Tàu Hủ – Kênh Tẻ, cầu thấp; ước lượng minh họa ~4 m tĩnh không.'},
    {'key': 'rach-ong', 'names': ['Cầu Rạch Ông'], 'class': 'canal', 'peakY': 6.0,
     'reason': 'Rạch Ông rộng hơn kênh nội đô; ước lượng minh họa.'},
    {'key': 'thi-nghe', 'names': ['Cầu Bông', 'Cầu Thị Nghè 1', 'Cầu Thị Nghè 2', 'Cầu Văn Thánh', 'Cầu Văn Thánh 2',
                                  'Cầu Kiệu', 'Cầu Điện Biên Phủ 1', 'Cầu Hoàng Hoa Thám', 'Cầu Đen', 'Cầu Sơn',
                                  'Cầu Trần Khánh Dư', 'Cầu Lê Văn Sỹ', 'Cầu Công Lý'],
     'class': 'canal', 'peakY': 5.0, 'reason': 'Kênh Nhiêu Lộc – Thị Nghè: cầu kênh nội đô ~3–5 m, không cao như cầu sông.'},
    {'key': 'thi-nghe-khac', 'names': ['Cầu Đinh Bộ Lĩnh', 'Cầu Văn Thánh 1', 'Cầu Đen 1', 'Cầu Đen 2',
                                       'Cầu Điện Biên Phủ 2', 'Cầu Bùi Hữu Nghĩa', 'Cầu Nguyễn Kiệu', 'Cầu Dừa',
                                       'Cầu Trắng', 'Cầu Trắng 2', 'Cầu Long Vân Tự', 'Cầu Ráp', 'Cầu Phú An'],
     'class': 'canal', 'peakY': 5.0, 'reason': 'Cầu kênh/rạch nội đô (Thị Nghè, Văn Thánh, Cầu Sơn…): ~3–5 m.'},
    {'key': 'mong', 'names': ['Cầu Mống'], 'class': 'canal', 'peakY': 5.5, 'allowFoot': True,
     'reason': 'Cầu Mống: cầu thép lịch sử trên rạch Bến Nghé, nay dành cho người đi bộ (highway=footway). Đặc tả '
               'yêu cầu cầu signature theo tĩnh không thật, nên override khỏi quy tắc skip footway; vòm thấp ~4 m.'},
    {'key': 'thu-thiem-kenh', 'names': ['Cầu số 6', 'Cầu số 10', 'Cầu số 13', 'Cầu số 14', 'Cầu số 15', 'Cầu số 16',
                                        'Cầu số 17', 'Cầu Kênh 1', 'Cầu Kênh 2', 'Cầu Cá Trê',
                                        'Cầu Cá Trê Lớn', 'Cầu Cá Trê Nhỏ', 'Cầu Ông Tranh 2'],
     'class': 'canal', 'peakY': 5.0,
     'reason': 'Cầu kênh khu đô thị Thủ Thiêm/Nguyễn Hữu Cảnh; kênh không có trong lớp nước scene nên quy tắc tự động '
               'dễ xếp nhầm thành cầu vượt — cố định lớp canal.'},
    {'key': 'vuot-hang-xanh', 'names': ['Cầu vượt Hàng Xanh'], 'class': 'overpass', 'peakY': 8.0,
     'reason': 'Cầu vượt nút giao: tĩnh không xe 4,75 m + kết cấu → ~7 m trên mặt đường.'},
    {'key': 'vuot-nguyen-huu-canh', 'names': ['Cầu vượt Nguyễn Hữu Cảnh'], 'class': 'overpass', 'peakY': 8.0,
     'reason': 'Cầu vượt nút giao: tĩnh không xe 4,75 m + kết cấu.'},
]
ISSUE03_DECISION = {
    'wayIds': ISSUE03_WAYS, 'roofBuilding': ISSUE03_ROOF, 'action': 'skip-ground',
    'reason': 'Tag thật: highway=residential, bridge=yes, layer=1, covered=yes, không có indoor. covered=yes nghĩa là '
              'đường đi dưới mái building=roof 732220089 (layer=1, cao 25,3 m là ước lượng, không đo); layer=1 '
              'chỉ là quan hệ tương đối với mái, không phải cầu vượt. Không nâng 13 m: đặt skip, vẽ phẳng ở groundY; '
              'bước C nâng min_height của mái (gợi ý raise-roof-min) để mái thành tán che phía trên đường.',
}


def num(v):
    m = re.search(r'-?\d+(\.\d+)?', str(v)) if v is not None else None
    return float(m.group()) if m else None


def oneway_of(t):
    raw = t.get('oneway')
    if raw in ('yes', 'true', '1'):
        return 'yes'
    if raw in ('-1', 'reverse'):
        return '-1'
    if raw is not None:
        return 'no'
    return 'yes' if t.get('junction') in ('roundabout', 'circular') or t.get('highway') == 'motorway' else 'no'


def lanes_of(t):
    v = num(t.get('lanes'))
    if v is not None and v >= 1:
        return max(1, int(round(v))), False
    return INFERRED_LANES.get(t['highway'], 1), True


def r2(v):
    return round(v + 0.0, 2) + 0.0


def bearing(ax, az, bx, bz):
    b = round(math.degrees(math.atan2(bx - ax, -(bz - az))) % 360, 1)
    return 0.0 if b >= 360 else b


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def match_vertex_ids(e, line):
    """Node OSM cho từng đỉnh của mảnh đã cắt; None = đỉnh do cắt bbox sinh ra."""
    orig = ps.coords(e['geometry'])
    closed = e['nodes'][0] == e['nodes'][-1]
    ids, j = [], 0
    for p in line.coords:
        p = tuple(p)
        f = next((q for q in range(j, len(orig)) if orig[q] == p), None)
        if f is None and closed:
            f = next((q for q in range(len(orig)) if orig[q] == p), None)
        ids.append(None if f is None else e['nodes'][f])
        if f is not None:
            j = f + 1 if f + 1 < len(orig) else 0
    return ids


def dijkstra(seeds, adj, limit=math.inf):
    """Đa nguồn; seeds {node: dist0} (cho phép âm); adj node→[(edge, other, length)]."""
    dist = dict(seeds)
    heap = [(d, n) for n, d in seeds.items()]
    heapq.heapify(heap)
    while heap:
        d, n = heapq.heappop(heap)
        if d > dist.get(n, math.inf) or d > limit:
            continue
        for ei, m, length in adj[n]:
            nd = d + length
            if nd < dist.get(m, math.inf):
                dist[m] = nd
                heapq.heappush(heap, (nd, m))
    return dist


def main():
    scene_path = ROOT / 'data/scene.js'
    scene_bytes = scene_path.read_bytes()
    text = scene_bytes.decode('utf-8')
    D = json.loads(text[text.index('=') + 1:].rstrip().rstrip(';'))
    raw_path = ROOT / 'data/osm-raw.json'
    raw_bytes = raw_path.read_bytes()
    raw = json.loads(raw_bytes.decode('utf-8'))
    g = GROUND_Y

    # --- 1. roads ↔ D.roads, node ID theo đỉnh ----------------------------------------------------
    roads, vertex_ids = [], []
    part_count = collections.Counter()
    boundary_next = -1
    for e in raw['elements']:
        if not ps.is_road(e):
            continue
        t = e['tags']
        for line in ps.road_parts(e):
            i = len(roads)
            d = D['roads'][i]
            if d['id'] != e['id'] or ps.road_xy(line) != d['c']:
                raise SystemExit(f'D.roads[{i}] không khớp road_parts của way {e["id"]} — scene.js lệch prepare_scene.py')
            ids = match_vertex_ids(e, line)
            bverts = []
            for k, v in enumerate(ids):
                if v is None:
                    if k not in (0, len(ids) - 1):
                        raise SystemExit(f'đỉnh cắt bbox nằm giữa way {e["id"]}')
                    ids[k] = boundary_next
                    boundary_next -= 1
                    bverts.append(k)
            oneway = oneway_of(t)
            lanes, inferred = lanes_of(t)
            layer = num(t.get('layer'))
            speed = num(t.get('maxspeed'))
            if speed is not None and 'mph' in str(t.get('maxspeed')):
                speed = round(speed * 1.609)
            roads.append({
                'index': i, 'id': e['id'], 'part': part_count[e['id']], 'name': t.get('name', ''), 'type': t['highway'],
                'oneway': oneway, 'layer': int(layer) if layer is not None else 0,
                'maxspeed': (int(speed) if speed is not None and float(speed).is_integer() else speed),
                'lanes': lanes, 'lanesInferred': inferred, 'junction': t.get('junction'), 'highway': t['highway'],
                'bridge': t.get('bridge'), 'tunnel': t.get('tunnel'), 'covered': t.get('covered'), 'indoor': t.get('indoor'),
                'elevationClass': 'ground', 'nodes': ids, 'boundaryVertices': bverts, 'edges': []})
            part_count[e['id']] += 1
            vertex_ids.append(ids)
    if len(roads) != len(D['roads']):
        raise SystemExit(f'số road {len(roads)} ≠ D.roads {len(D["roads"])}')

    # --- 2. đồ thị -------------------------------------------------------------------------------
    use = collections.Counter(v for ids in vertex_ids for v in ids)
    graph_ids = {v for v, n in use.items() if n >= 2}
    for ids in vertex_ids:
        graph_ids.update((ids[0], ids[-1]))
    node_xz = {}
    edges = []
    for i, r in enumerate(roads):
        c = D['roads'][i]['c']
        ids = r['nodes']
        for k, v in enumerate(ids):
            node_xz.setdefault(v, (c[k][0], c[k][1]))
        cuts = [k for k, v in enumerate(ids) if v in graph_ids]
        for v0, v1 in zip(cuts, cuts[1:]):
            pts = c[v0:v1 + 1]
            flat = [x for p in pts for x in p]
            length = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
            r['edges'].append(len(edges))
            edges.append({'id': len(edges), 'from': ids[v0], 'to': ids[v1], 'road': i, 'way': r['id'], 'v0': v0, 'v1': v1,
                          'c': flat, 'length': r2(length), '_len': length, 'oneway': r['oneway'], 'lanes': r['lanes'],
                          'elevationClass': 'ground'})
    order = []
    seen = set()
    for e in edges:
        for v in (e['from'], e['to']):
            if v not in seen:
                seen.add(v)
                order.append(v)
    nodes = {v: {'id': v, 'x': node_xz[v][0], 'z': node_xz[v][1], 'y': g, 'kind': '', 'degree': 0, 'adj': []} for v in order}
    adj = collections.defaultdict(list)
    for ei, e in enumerate(edges):
        c = e['c']
        k = 2
        while k < len(c) - 2 and c[k] == c[0] and c[k + 1] == c[1]:
            k += 2
        nodes[e['from']]['adj'].append([ei, 0, bearing(c[0], c[1], c[k], c[k + 1])])
        k = len(c) - 4
        while k > 0 and c[k] == c[-2] and c[k + 1] == c[-1]:
            k -= 2
        nodes[e['to']]['adj'].append([ei, 1, bearing(c[-2], c[-1], c[k], c[k + 1])])
        adj[e['from']].append((ei, e['to'], e['_len']))
        adj[e['to']].append((ei, e['from'], e['_len']))
    for n in nodes.values():
        n['degree'] = len(n['adj'])
        n['kind'] = 'boundary' if n['id'] < 0 else 'junction' if n['degree'] >= 3 else 'connector' if n['degree'] == 2 else 'end'

    # --- 3. phân lớp cầu ---------------------------------------------------------------------------
    cfg_by_way = {w: c for c in BRIDGE_CONFIG for w in c.get('wayIds', [])}
    cfg_by_name = {nm: c for c in BRIDGE_CONFIG for nm in c.get('names', [])}
    bridge_roads = [i for i, d in enumerate(D['roads']) if d['bridge']]
    road_cfg = {}
    for i in bridge_roads:
        r = roads[i]
        cfg = cfg_by_way.get(r['id']) or cfg_by_name.get(r['name'])
        road_cfg[i] = cfg
        if r['id'] in ISSUE03_WAYS:
            r['elevationClass'], r['skipRender'] = 'skip', 'ground'
            r['elevationReason'] = 'issue03: ' + ISSUE03_DECISION['reason']
        elif (r['covered'] or 'no') != 'no' or (r['indoor'] or 'no') != 'no' or r['highway'] == 'corridor':
            r['elevationClass'], r['skipRender'] = 'skip', 'ground'
            r['elevationReason'] = f"covered={r['covered']}/indoor={r['indoor']}: đường dưới mái/trong nhà, không phải cầu nâng"
        elif r['highway'] in FOOT_HIGHWAYS and not (cfg and cfg.get('allowFoot')):
            r['elevationClass'], r['skipRender'] = 'skip', 'ground'
            r['elevationReason'] = f"highway={r['highway']} bridge: cầu bộ hành không có mesh riêng; vẽ phẳng để không trôi 13 m (bước C)"
    # Cụm = thành phần liên thông của road cầu qua nút chung, chỉ gộp khi cùng trạng thái skip và cùng mục cấu hình
    # (ví dụ nhánh N1/N2 tách khỏi Ba Son để tự hạ dốc; dốc dẫn của cụm này vẫn lan sang cụm kề và lấy max).
    def group_key(i):
        cfg = road_cfg.get(i)
        return (roads[i]['elevationClass'] == 'skip', cfg['key'] if cfg else None)
    parent = {}

    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    node_roads = collections.defaultdict(set)
    for i in bridge_roads:
        for ei in roads[i]['edges']:
            node_roads[edges[ei]['from']].add(i)
            node_roads[edges[ei]['to']].add(i)
    for members in node_roads.values():
        members = sorted(members)
        for a in members[1:]:
            for b in members:
                if b < a and group_key(a) == group_key(b):
                    parent[find(a)] = find(b)
                    break
    groups = collections.defaultdict(list)
    for i in bridge_roads:
        groups[find(i)].append(i)
    water = unary_union([Polygon(rg[0], rg[1:]).buffer(0) for rg in D['water']])
    lines_xz = [LineString([(e['c'][k], e['c'][k + 1]) for k in range(0, len(e['c']), 2)]) for e in edges]
    ground_lines = [(ei, lines_xz[ei]) for ei, e in enumerate(edges)
                    if not D['roads'][e['road']]['bridge'] and not D['roads'][e['road']]['tunnel']]
    ground_tree = STRtree([ln for _, ln in ground_lines])
    clusters = []
    for members in sorted(groups.values(), key=lambda m: min(m)):
        cid = len(clusters)
        cedges = [ei for i in members for ei in roads[i]['edges']]
        cnodes = {edges[ei]['from'] for ei in cedges} | {edges[ei]['to'] for ei in cedges}
        lines = [lines_xz[ei] for ei in cedges]
        length = sum(edges[ei]['_len'] for ei in cedges)
        water_m = sum(ln.intersection(water).length for ln in lines)
        cross_roads = set()
        for ln in lines:
            for hit in ground_tree.query(ln, predicate='intersects'):
                ei = ground_lines[hit][0]
                if edges[ei]['from'] not in cnodes and edges[ei]['to'] not in cnodes:
                    cross_roads.add(ei)
        names = sorted({roads[i]['name'] for i in members if roads[i]['name']})
        skip = roads[members[0]]['elevationClass'] == 'skip'
        cfgs = [road_cfg[i] for i in members if road_cfg[i]]
        cfg = max(cfgs, key=lambda c: (CLASS_RANK[c['class']], c['peakY'])) if cfgs else None
        if skip:
            cls, peak, reason = 'skip', g, roads[members[0]]['elevationReason']
        elif cfg:
            cls, peak, reason = cfg['class'], cfg['peakY'], f"cấu hình '{cfg['key']}': {cfg['reason']}"
        elif any('vượt' in nm.lower() for nm in names) or (water_m < 1 and cross_roads):
            cls, peak = 'overpass', CLASS_PEAK_Y['overpass']
            reason = f'quy tắc: tên "cầu vượt" hoặc không qua nước mà cắt {len(cross_roads)} cạnh đường mặt đất'
        elif water_m >= RIVER_WATER_CROSS_M:
            cls, peak = 'river', CLASS_PEAK_Y['river']
            reason = f'quy tắc: vượt mặt nước {water_m:.0f} m ≥ {RIVER_WATER_CROSS_M:.0f} m, chưa cấu hình riêng'
        elif water_m >= 1:
            cls, peak = 'canal', CLASS_PEAK_Y['canal']
            reason = f'quy tắc: vượt mặt nước {water_m:.0f} m (kênh/rạch)'
        else:
            cls, peak = 'low', CLASS_PEAK_Y['low']
            reason = 'quy tắc: không giao lớp nước/đường trong scene (cống, rạch nhỏ chưa vẽ) → cầu thấp'
        for i in members:
            r = roads[i]
            r['elevationClass'] = cls
            r.setdefault('elevationReason', reason)
            if not skip:
                r['elevationReason'] = reason
            if cfg and cfg.get('signature'):
                r['signature'] = cfg['signature']
            if r['id'] in BACH_DANG_WAYS:
                r['signature'] = 'bach-dang-footbridge'
        clusters.append({'id': cid, 'roads': sorted(members), 'wayIds': sorted({roads[i]['id'] for i in members}),
                         'names': names, 'elevationClass': cls, 'peakY': r2(peak), 'configKey': cfg['key'] if cfg else None,
                         'reason': reason, 'lengthM': r2(length), 'waterCrossM': r2(water_m), 'crossesGroundEdges': len(cross_roads),
                         'layers': sorted({roads[i]['layer'] for i in members}), '_edges': set(cedges), '_nodes': cnodes})
    for e in edges:
        e['elevationClass'] = roads[e['road']]['elevationClass']

    # --- 4. profile cao độ -------------------------------------------------------------------------
    vertex_s = []
    for e in edges:
        c, s = e['c'], [0.0]
        for k in range(0, len(c) - 2, 2):
            s.append(s[-1] + math.hypot(c[k + 2] - c[k], c[k + 3] - c[k + 1]))
        vertex_s.append(s)
    water_prep = prep(water)
    fields = collections.defaultdict(list)     # cạnh → [(cụm, hàm y(s))]
    # Chuỗi cầu: mọi cạnh cầu không skip liền nhau (bỏ qua việc tách cụm theo cấu hình).
    lifted = {ei for cl in clusters if cl['elevationClass'] != 'skip' for ei in cl['_edges']}
    for cl in clusters:
        if cl['elevationClass'] == 'skip':
            continue
        H, E, N = cl['peakY'], cl['_edges'], cl['_nodes']
        R = SMOOTH_MAX_SLOPE * (H - g) / DESIGN_GRADE
        chain_edges, stack = set(E), list(N)
        chain_nodes = set(N)
        while stack:
            n = stack.pop()
            for ei, m, _ in adj[n]:
                if ei in lifted and ei not in chain_edges:
                    chain_edges.add(ei)
                    if m not in chain_nodes:
                        chain_nodes.add(m)
                        stack.append(m)
        # B: nút của chuỗi cầu chạm cạnh không thuộc chuỗi (đường mặt đất hoặc cầu skip). Nút nối hai cụm cầu
        # (Ba Son ↔ nhánh N1/N2) không phải điểm chạm đất; nhưng đầu mặt đất của cụm kề vẫn là B nên khoảng cách
        # âm không lan qua cụm kề ra phố. Đầu cụt (bậc 1, không phải biên bbox) của cụm là neo mặt đất.
        B = {n for n in chain_nodes if any(ei not in chain_edges for ei, _, _ in adj[n])}
        dead = {n for n in N if nodes[n]['kind'] == 'end'}
        u = dijkstra({n: 0.0 for n in B}, adj) if B else {}
        depth = 0.0
        for ei in E:
            e = edges[ei]
            ua, ub = u.get(e['from'], math.inf), u.get(e['to'], math.inf)
            if math.isfinite(ua) and math.isfinite(ub):
                depth = max(depth, (ua + ub + e['_len']) / 2 if abs(ua - ub) <= e['_len'] else min(ua, ub) + e['_len'])
        # Nhịp qua mặt nước luôn ở đỉnh: phần dốc trong cầu không vượt khoảng cách từ B tới điểm nước gần nhất.
        water_u = math.inf
        for ei in E:
            e, L = edges[ei], edges[ei]['_len']
            ua, ub = u.get(e['from'], math.inf), u.get(e['to'], math.inf)
            n = max(1, math.ceil(L / 2))
            for k in range(n + 1):
                s = L * k / n
                if water_prep.contains(lines_xz[ei].interpolate(s)):
                    water_u = min(water_u, ua + s, ub + L - s)
        r_in = min(R, max(0.0, depth - PLATEAU_HALF_M), water_u) if B else 0.0
        r_out = R - r_in if B else 0.0
        cvals = dijkstra({n: -u[n] for n in N if n in u}, adj, limit=r_out) if B else {}
        dd = dijkstra({n: 0.0 for n in dead}, adj, limit=R) if dead else {}
        affected = set(E)
        for n, cv in cvals.items():
            if cv < r_out:
                affected.update(ei for ei, _, _ in adj[n])
        for ei in affected:
            e = edges[ei]
            a, b, L = e['from'], e['to'], e['_len']
            inside = ei in E
            ua, ub = u.get(a, math.inf), u.get(b, math.inf)
            ca, cb = cvals.get(a, math.inf), cvals.get(b, math.inf)
            da, db = dd.get(a, math.inf), dd.get(b, math.inf)

            def y_at(s, inside=inside, ua=ua, ub=ub, ca=ca, cb=cb, da=da, db=db, L=L, H=H, R=R, r_out=r_out):
                if inside:
                    v = r_out + min(ua + s, ub + L - s)
                else:
                    v = r_out - min(ca + s, cb + L - s)
                v = min(v, da + s, db + L - s)
                return g + (H - g) * smooth(v / R)
            fields[ei].append((cl['id'], y_at))
        cl.update({'rampLengthM': r2(R), 'rampInsideM': r2(r_in), 'rampOutsideM': r2(r_out), 'groundAttachNodes': len(B),
                   'deadEnds': len(dead), 'designGrade': DESIGN_GRADE})

    def profile_of(ei):
        e, L = edges[ei], edges[ei]['_len']
        n = max(1, math.ceil(L / PROFILE_STEP_M))
        ss = sorted(set([L * k / n for k in range(n + 1)] + vertex_s[ei]))
        pts = [(s, max(f(s) for _, f in fields[ei])) for s in ss]
        keep = [0, len(pts) - 1]

        def rdp(i0, i1):
            (s0, y0), (s1, y1) = pts[i0], pts[i1]
            worst, wi = 0.0, None
            for k in range(i0 + 1, i1):
                yl = y0 + (y1 - y0) * (pts[k][0] - s0) / (s1 - s0) if s1 > s0 else y0
                if abs(pts[k][1] - yl) > worst:
                    worst, wi = abs(pts[k][1] - yl), k
            if wi is not None and worst > PROFILE_TOL_M / 2:
                keep.append(wi)
                rdp(i0, wi)
                rdp(wi, i1)
        rdp(0, len(pts) - 1)
        out = []
        for k in sorted(set(keep)):
            out += [r2(pts[k][0]), r2(pts[k][1])]
        out[-2] = e['length']
        return out

    ramp_edges = 0
    for ei, e in enumerate(edges):
        if not fields[ei]:
            continue
        ys = [r2(max(f(s) for _, f in fields[ei])) for s in vertex_s[ei]]
        bridge_profile = e['elevationClass'] not in ('ground', 'skip')
        if not bridge_profile and max(ys) <= g + 0.005:
            continue
        e['y'] = ys
        e['profile'] = profile_of(ei)
        if not bridge_profile:
            mid = e['_len'] / 2
            e['rampOf'] = max(fields[ei], key=lambda cf: cf[1](mid))[0]
            ramp_edges += 1
        for v, yv in ((e['from'], ys[0]), (e['to'], ys[-1])):
            nodes[v]['y'] = max(nodes[v]['y'], yv)

    # --- 5. giao cắt không chung nút, xung đột công trình ---------------------------------------

    def y_on(ei, x, z):
        e = edges[ei]
        if 'profile' not in e:
            return g
        s = lines_xz[ei].project(Point(x, z))
        p = e['profile']
        for k in range(0, len(p) - 2, 2):
            if p[k + 2] >= s:
                return p[k + 1] + (p[k + 3] - p[k + 1]) * ((s - p[k]) / (p[k + 2] - p[k]) if p[k + 2] > p[k] else 0)
        return p[-1]
    tree = STRtree(lines_xz)
    crossings = []
    elevated = [ei for ei, e in enumerate(edges) if 'y' in e and not D['roads'][e['road']]['tunnel']]
    for ei in elevated:
        e = edges[ei]
        for oi in tree.query(lines_xz[ei], predicate='intersects'):
            oi = int(oi)
            o = edges[oi]
            if oi == ei or D['roads'][o['road']]['tunnel'] or {e['from'], e['to']} & {o['from'], o['to']}:
                continue
            if 'y' in o and oi < ei:
                continue   # cặp hai cạnh cùng nâng chỉ ghi một lần
            hit = lines_xz[ei].intersection(lines_xz[oi])
            pts = [hit] if hit.geom_type == 'Point' else [gm for gm in getattr(hit, 'geoms', []) if gm.geom_type == 'Point']
            if not pts:
                continue
            p = pts[0]
            ya, yb = y_on(ei, p.x, p.y), y_on(oi, p.x, p.y)
            up, lo = (ei, oi) if ya >= yb else (oi, ei)
            sep = abs(ya - yb)
            lower_road = roads[edges[lo]['road']]
            clear = CLEARANCE['foot' if lower_road['highway'] in FOOT_HIGHWAYS else 'vehicle']
            issue = None
            if max(ya, yb) <= g + 0.3:
                continue
            if sep < 0.3:
                issue = 'same-level'
            elif sep < clear + DECK_THICKNESS_M:
                issue = 'low-clearance'
            elif roads[edges[up]['road']]['layer'] < lower_road['layer']:
                issue = 'layer-order'
            crossings.append({'edge': ei, 'other': oi, 'way': e['way'], 'otherWay': o['way'], 'x': r2(p.x), 'z': r2(p.y),
                              'y': r2(ya), 'otherY': r2(yb), 'layer': roads[e['road']]['layer'],
                              'otherLayer': roads[o['road']]['layer'], 'issue': issue})
    bpolys = [Polygon(b['r'][0], b['r'][1:]).buffer(0) for b in D['buildings']]
    btree = STRtree(bpolys)
    conflicts = []
    for i in bridge_roads:
        r, d = roads[i], D['roads'][i]
        width = ROAD_WIDTHS.get(d['type'], 4)
        if d.get('lanes'):
            width = max(width, d['lanes'] * 3.1)
        half = (width + 1.8) / 2
        corridor = LineString(d['c']).buffer(half, cap_style=2)
        samples = []
        for ei in r['edges']:
            L = edges[ei]['_len']
            n = max(1, math.ceil(L / 2))
            for k in range(n + 1):
                pt = lines_xz[ei].interpolate(L * k / n)
                samples.append((pt, y_on(ei, pt.x, pt.y)))
        clear = CLEARANCE['foot' if r['highway'] in FOOT_HIGHWAYS else 'vehicle']
        for bi in btree.query(corridor, predicate='intersects'):
            bi = int(bi)
            area = corridor.intersection(bpolys[bi]).area
            if area < 1.0:
                continue
            b = D['buildings'][bi]
            near = [yv for pt, yv in samples if bpolys[bi].distance(pt) <= half]
            ys = near or [min(samples, key=lambda s: bpolys[bi].distance(s[0]))[1]]
            lo, hi = min(ys), max(ys)
            base, top = (b.get('min') or 0) + 1.5, b['h'] + 1.5     # webgpu-materials-24.js: base=b.min+1.5, y=b.h+1.5
            vertical = base < hi + clear and top > lo - DECK_THICKNESS_M
            origin = b.get('origin') or ('Overture' if b.get('gers') else 'OSM')
            if not vertical:
                suggestion = 'none-below-deck' if top <= lo - DECK_THICKNESS_M else 'none-above-clearance'
            elif b.get('type') == 'roof':
                suggestion = 'raise-roof-min'
            elif origin == 'Overture':
                suggestion = 'hide-building'
            else:
                suggestion = 'clip-building'
            conflicts.append({'way': r['id'], 'road': i, 'name': r['name'], 'elevationClass': r['elevationClass'],
                              'building': b['id'], 'buildingIndex': bi, 'partIndex': b.get('partIndex'),
                              'buildingName': b.get('name') or '', 'origin': origin, 'buildingType': b.get('type'),
                              'buildingH': b['h'], 'buildingMin': b.get('min') or 0, 'deckY': [r2(lo), r2(hi)],
                              'overlapM2': r2(area), 'verticalOverlap': vertical, 'suggestion': suggestion})
    conflicts.sort(key=lambda c: (not c['verticalOverlap'], -c['overlapM2']))

    # --- 6. ghi file ----------------------------------------------------------------------------
    for cl in clusters:
        for k in [k for k in cl if k.startswith('_')]:
            del cl[k]
    for r in roads:
        if r['highway'] in FOOT_HIGHWAYS and r['elevationClass'] not in ('ground', 'skip'):
            r['override'] = road_cfg[r['index']]['key']
    out_edges = []
    for e in edges:
        out_edges.append({k: v for k, v in e.items() if not k.startswith('_')})
    node_list = list(nodes.values())
    for n in node_list:
        n['y'] = r2(n['y'])
    kinds = collections.Counter(n['kind'] for n in node_list)
    x0, z0 = ps.xy(ps.bbox[0], ps.bbox[3])
    x1, z1 = ps.xy(ps.bbox[2], ps.bbox[1])
    signature = [
        {'key': 'ba-son', 'wayIds': BA_SON_WAYS, 'decision': 'profile-match-box-top', 'suggestedDeckTopY': r2(BA_SON_DECK_TOP_Y),
         'roads': [r['index'] for r in roads if r['id'] in BA_SON_WAYS],
         'reason': BRIDGE_CONFIG[0]['reason']},
        {'key': 'bach-dang-footbridge', 'wayIds': BACH_DANG_WAYS, 'decision': 'skip-signature-mesh',
         'suggestedDeckTopY': r2(BACH_DANG_DECK_TOP_Y), 'roads': [r['index'] for r in roads if r['id'] in BACH_DANG_WAYS],
         'reason': 'Các way là highway=construction (construction=footway) nên prepare_scene không đưa vào D.roads; '
                   'không dựng profile OSM. Mesh bach-dang-footbridge.js (bdDeck y=13, dày 1,15) giữ nguyên hình dạng; '
                   'cao độ đỉnh mặt cầu ghi để bước B/C neo người đi bộ.'},
    ]
    issue03 = dict(ISSUE03_DECISION)
    issue03['roads'] = [r['index'] for r in roads if r['id'] in ISSUE03_WAYS]
    issue03['tags'] = {str(w['id']): w['tags'] for w in raw['elements'] if w['type'] == 'way' and w['id'] in ISSUE03_WAYS + [ISSUE03_ROOF]}
    issue03['conflicts'] = sum(1 for c in conflicts if c['way'] in ISSUE03_WAYS)
    total_len = sum(e['_len'] for e in edges)
    stats = {
        'roads': len(roads), 'nodes': len(node_list), 'edges': len(edges), 'junctions': kinds['junction'],
        'connectors': kinds['connector'], 'ends': kinds['end'], 'boundaryNodes': kinds['boundary'],
        'bridgeRoads': len(bridge_roads), 'clusters': len(clusters),
        'clustersByClass': dict(collections.Counter(cl['elevationClass'] for cl in clusters)),
        'bridgeRoadsByClass': dict(collections.Counter(roads[i]['elevationClass'] for i in bridge_roads)),
        'onewayRoadShare': round(sum(r['oneway'] != 'no' for r in roads) / len(roads), 4),
        'onewayLengthShare': round(sum(e['_len'] for e in edges if e['oneway'] != 'no') / total_len, 4),
        'elevatedEdges': sum(1 for e in edges if 'y' in e), 'rampEdges': ramp_edges,
        'rampRaisedLengthM': r2(sum(e['profile'][k + 2] - e['profile'][k] for e in edges if e.get('rampOf') is not None
                                    for k in range(0, len(e['profile']) - 2, 2)
                                    if max(e['profile'][k + 1], e['profile'][k + 3]) > g + 0.01)),
        'conflicts': len(conflicts), 'conflictsVertical': sum(c['verticalOverlap'] for c in conflicts),
        'crossings': len(crossings), 'crossingIssues': dict(collections.Counter(c['issue'] for c in crossings if c['issue'])),
    }
    G = {
        'version': VERSION, 'batch': '31A', 'seed': SEED,
        'attribution': '© OpenStreetMap contributors, ODbL 1.0. Cao độ cầu là ước lượng minh họa, không khảo sát.',
        'source': {'osmRaw': 'data/osm-raw.json', 'osmRawSha256': hashlib.sha256(raw_bytes).hexdigest(),
                   'osmBase': raw['osm3s']['timestamp_osm_base'], 'scene': 'data/scene.js',
                   'sceneSha256': hashlib.sha256(scene_bytes).hexdigest(), 'builder': 'scripts/build_road_graph_31.py',
                   'clipHelpers': 'scripts/prepare_scene.py (is_road, road_parts, road_xy)'},
        'frame': {'units': 'm', 'axes': 'x đông, z nam, y lên (giống scene.js)', 'groundY': GROUND_Y, 'waterY': WATER_Y,
                  'extent': [r2(x0), r2(x1), r2(z0), r2(z1)], 'designGrade': DESIGN_GRADE, 'maxGrade': 0.08},
        'schema': {
            'roads[i]': 'song song D.roads[i]; id+part = way OSM + thứ tự mảnh sau cắt bbox',
            'roads[i].nodes': 'node OSM theo từng đỉnh D.roads[i].c; số âm = đỉnh do cắt bbox (boundaryVertices)',
            'roads[i].edges': 'chỉ số cạnh theo thứ tự đỉnh; edges[k].v0..v1 là khoảng đỉnh',
            'roads[i].oneway': "yes|-1|no; mặc định yes cho junction=roundabout|circular và highway=motorway",
            'roads[i].elevationClass': 'ground|low|canal|overpass|river|skip; skipRender ground|hide',
            'nodes[].kind': 'junction bậc≥3, connector bậc 2, end bậc 1, boundary = cắt bbox (id âm)',
            'nodes[].adj': '[cạnh, đầu 0=from/1=to, hướng° từ bắc theo chiều kim đồng hồ]',
            'edges[].c': 'tọa độ phẳng [x0,z0,x1,z1,…] trích nguyên từ D.roads',
            'edges[].y': 'y theo đỉnh khi cạnh được nâng (cầu hoặc dốc dẫn)',
            'edges[].profile': '[s0,y0,…] mẫu dày dọc cạnh; runtime nội suy tuyến tính theo s',
            'edges[].rampOf': 'id cụm cầu khi cạnh mặt đất/skip mang dốc dẫn',
            'bridges.conflicts': 'công trình giao hành lang cầu (ribbon width+1,8) — bước C xử lý',
            'bridges.crossings': 'cạnh nâng cắt cạnh khác không chung nút; issue same-level|low-clearance|layer-order',
        },
        'stats': stats, 'roads': roads, 'nodes': node_list, 'edges': out_edges,
        'bridges': {'clusters': clusters, 'signature': signature, 'issue03': issue03, 'conflicts': conflicts,
                    'crossings': crossings, 'config': BRIDGE_CONFIG,
                    'classPeakY': CLASS_PEAK_Y, 'clearance': CLEARANCE, 'deckThicknessM': DECK_THICKNESS_M},
    }
    body = json.dumps(G, ensure_ascii=False, separators=(',', ':'))
    (ROOT / 'data/road-graph-31.json').write_text(body, encoding='utf-8', newline='\n')
    (ROOT / 'data/road-graph-31.js').write_text('window.ROAD_GRAPH_31=' + body + ';', encoding='utf-8', newline='\n')
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print('bytes', len(body.encode('utf-8')))


if __name__ == '__main__':
    main()
