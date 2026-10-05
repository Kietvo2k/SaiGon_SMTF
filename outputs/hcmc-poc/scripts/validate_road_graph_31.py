"""Kiểm tra data/road-graph-31.json (Batch 31A) với data/scene.js và data/osm-raw.json.

Chỉ dùng thư viện chuẩn, các quy tắc được viết lại từ đặc tả (không import builder).
Exit code 1 khi có bất kỳ kiểm tra nào FAIL.
"""
import collections, hashlib, json, math, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
GRAPH_JSON = ROOT / 'data/road-graph-31.json'
GRAPH_JS = ROOT / 'data/road-graph-31.js'
SCENE_JS = ROOT / 'data/scene.js'
JS_PREFIX = 'window.ROAD_GRAPH_31='
GROUND_Y = 1.0            # webgpu-materials-24.js: const y=road.bridge?13:1.0
MAX_GRADE = 0.08
GRADE_WINDOW_M = 2.0      # y làm tròn 0,01 m → đo dốc trên cửa sổ ≥ 2 m để sai số làm tròn ≤ 0,5 %
Y_TOL = 0.05
MAX_BYTES = 15 * 1024 * 1024
CLASSES = {'ground', 'low', 'canal', 'overpass', 'river', 'skip'}
BRIDGE_CLASSES = CLASSES - {'ground'}
EXCLUDED_HIGHWAYS = {'steps', 'construction', 'proposed'}
FOOT_HIGHWAYS = {'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway', 'corridor'}
BA_SON_WAYS = {321564421, 321564423}
BACH_DANG_WAYS = {1504289918, 1504289919, 1504289920, 1504289921}
ISSUE03_WAYS = {732142874, 732142875}   # "Cầu số 11 Đường N2", covered=yes, dưới building=roof 732220089
BA_SON_DECK_TOP_Y = 11.25 + 3.2 / 2     # webgpu-materials-24.js: BoxGeometry(24,3.2,…) đặt tại y=11.25

failures = []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''))
    if not ok:
        failures.append(name)
    return ok


def load_scene():
    text = SCENE_JS.read_text(encoding='utf-8')
    return json.loads(text[text.index('=') + 1:].rstrip().rstrip(';'))


def head_sha256(rel):
    try:
        blob = subprocess.run(['git', 'show', f'HEAD:outputs/hcmc-poc/{rel}'], cwd=ROOT, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return hashlib.sha256(blob).hexdigest()


def oneway_expected(tags):
    """Đặc tả 31A: yes|-1|no; mặc định yes khi junction=roundabout|circular hoặc highway=motorway."""
    raw = tags.get('oneway')
    if raw in ('yes', 'true', '1'):
        return 'yes'
    if raw in ('-1', 'reverse'):
        return '-1'
    if raw is not None:
        return 'no'
    if tags.get('junction') in ('roundabout', 'circular') or tags.get('highway') == 'motorway':
        return 'yes'
    return 'no'


def lanes_tagged(tags):
    m = re.search(r'\d+(\.\d+)?', str(tags.get('lanes', '')))
    return m is not None and float(m.group()) >= 1


def polyline_length(flat):
    return sum(math.hypot(flat[i + 2] - flat[i], flat[i + 3] - flat[i + 1]) for i in range(0, len(flat) - 2, 2))


def point_in_ring(x, z, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        (xi, zi), (xj, zj) = ring[i], ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def point_at(flat, s):
    """Tọa độ tại chiều dài s dọc polyline phẳng [x0,z0,x1,z1,…]."""
    for i in range(0, len(flat) - 2, 2):
        seg = math.hypot(flat[i + 2] - flat[i], flat[i + 3] - flat[i + 1])
        if s <= seg or i == len(flat) - 4:
            t = min(1.0, s / seg) if seg else 0.0
            return flat[i] + (flat[i + 2] - flat[i]) * t, flat[i + 1] + (flat[i + 3] - flat[i + 1]) * t
        s -= seg
    return flat[0], flat[1]


def windowed_max_grade(s, y):
    worst, j = 0.0, 0
    for i in range(len(s)):
        j = max(j, i + 1)
        while j < len(s) and s[j] - s[i] < GRADE_WINDOW_M:
            j += 1
        if j < len(s):
            worst = max(worst, abs(y[j] - y[i]) / (s[j] - s[i]))
    return worst


def main():
    # --- scene.js giữ nguyên byte -------------------------------------------------------------
    scene_sha = hashlib.sha256(SCENE_JS.read_bytes()).hexdigest()
    head = head_sha256('data/scene.js')
    check('scene.js giữ nguyên byte so với HEAD', head is not None and scene_sha == head, f'sha256 {scene_sha[:16]} / HEAD {str(head)[:16]}')

    if not check('tồn tại file đồ thị', GRAPH_JSON.exists() and GRAPH_JS.exists(), str(GRAPH_JSON.relative_to(ROOT))):
        print('KẾT QUẢ: FAIL')
        return 1
    size_json, size_js = GRAPH_JSON.stat().st_size, GRAPH_JS.stat().st_size
    print(f'Kích thước: road-graph-31.json {size_json:,} B ({size_json / 1048576:.2f} MB); road-graph-31.js {size_js:,} B ({size_js / 1048576:.2f} MB)')
    check('kích thước ≤ 15 MB', max(size_json, size_js) <= MAX_BYTES)
    raw_json, raw_js = GRAPH_JSON.read_bytes(), GRAPH_JS.read_bytes()
    check('newline LF (không có CR)', b'\r' not in raw_json and b'\r' not in raw_js)
    G = json.loads(raw_json.decode('utf-8'))
    js = raw_js.decode('utf-8')
    check('road-graph-31.js bọc đúng JSON', js.startswith(JS_PREFIX) and js.rstrip().endswith(';')
          and json.loads(js[len(JS_PREFIX):].rstrip().rstrip(';')) == G)

    # --- Header ---------------------------------------------------------------------------------
    att = G.get('attribution', '')
    check('header version/source/attribution/seed/schema/frame',
          str(G.get('version', '')).startswith('road-graph-31') and isinstance(G.get('source'), dict)
          and 'OpenStreetMap' in att and 'ODbL' in att and isinstance(G.get('seed'), int)
          and isinstance(G.get('schema'), dict) and len(G['schema']) >= 10 and isinstance(G.get('frame'), dict))
    frame = G['frame']
    gy = frame.get('groundY')
    check(f'groundY khớp mặt đường webgpu-materials-24 ({GROUND_Y})', gy == GROUND_Y)
    check('header ghi sha256 của scene.js hiện tại', G['source'].get('sceneSha256') == scene_sha)

    D = load_scene()
    raw = json.loads((ROOT / 'data/osm-raw.json').read_text(encoding='utf-8'))
    ways_raw = {e['id']: e for e in raw['elements'] if e['type'] == 'way'}
    nodes, edges, roads = G['nodes'], G['edges'], G['roads']
    node_by_id = {n['id']: n for n in nodes}
    kinds = collections.Counter(n['kind'] for n in nodes)
    print(f"Số nút {len(nodes):,}; cạnh {len(edges):,}; giao lộ (bậc≥3) {kinds['junction']:,}; "
          f"điểm nối (bậc 2) {kinds['connector']:,}; đầu cụt {kinds['end']:,}; nút biên {kinds['boundary']:,}")
    check('id nút duy nhất', len(node_by_id) == len(nodes))
    check('số liệu stats khớp mảng', G.get('stats', {}).get('nodes') == len(nodes) and G['stats'].get('edges') == len(edges)
          and G['stats'].get('junctions') == kinds['junction'] and G['stats'].get('boundaryNodes') == kinds['boundary'])

    def two_dp(v):
        return abs(v * 100 - round(v * 100)) < 1e-6
    check('tọa độ làm tròn 2 chữ số', all(two_dp(v) for e in edges for v in e['c']) and all(two_dp(n['x']) and two_dp(n['z']) for n in nodes))

    # --- Toàn vẹn nút/cạnh ----------------------------------------------------------------------
    bad = []
    adj_seen = collections.Counter()
    for i, e in enumerate(edges):
        c = e['c']
        if e['id'] != i or len(c) < 4 or len(c) % 2 or e['from'] not in node_by_id or e['to'] not in node_by_id:
            bad.append((i, 'cấu trúc'))
            continue
        a, b = node_by_id[e['from']], node_by_id[e['to']]
        if abs(a['x'] - c[0]) > .005 or abs(a['z'] - c[1]) > .005 or abs(b['x'] - c[-2]) > .005 or abs(b['z'] - c[-1]) > .005:
            bad.append((i, 'đầu mút lệch nút'))
        if abs(polyline_length(c) - e['length']) > .05:
            bad.append((i, 'chiều dài'))
    for n in nodes:
        for entry in n['adj']:
            ei, end = entry[0], entry[1]
            if (edges[ei]['from'] if end == 0 else edges[ei]['to']) != n['id']:
                bad.append((ei, f'adj sai ở nút {n["id"]}'))
            adj_seen[(ei, end)] += 1
            if not 0 <= entry[2] < 360:
                bad.append((ei, 'góc hướng'))
        deg = len(n['adj'])
        want = 'boundary' if n['id'] < 0 else 'junction' if deg >= 3 else 'connector' if deg == 2 else 'end'
        if n['kind'] != want or n['degree'] != deg:
            bad.append((n['id'], f'kind {n["kind"]}≠{want}'))
    missing_adj = [i for i in range(len(edges)) if adj_seen[(i, 0)] != 1 or adj_seen[(i, 1)] != 1]
    check('cạnh/nút/adj nhất quán', not bad and not missing_adj, f'{bad[:5]} {missing_adj[:5]}')

    # --- Ánh xạ D.roads <-> roads ---------------------------------------------------------------
    map_err = []
    if len(roads) != len(D['roads']):
        map_err.append(f'số road {len(roads)}≠{len(D["roads"])}')
    owner = collections.Counter()
    part_next = collections.defaultdict(int)
    graph_node_ids = set(node_by_id)
    for i, (r, d) in enumerate(zip(roads, D['roads'])):
        if r['index'] != i or r['id'] != d['id'] or r['part'] != part_next[d['id']]:
            map_err.append((i, 'id/part'))
        part_next[d['id']] += 1
        flat = []
        prev_v1 = 0
        for k, ei in enumerate(r['edges']):
            e = edges[ei]
            owner[ei] += 1
            if e['road'] != i or e['way'] != d['id'] or e['v0'] != prev_v1 or e['oneway'] != r['oneway'] or e['lanes'] != r['lanes']:
                map_err.append((i, f'cạnh {ei} lệch'))
            prev_v1 = e['v1']
            flat.extend(e['c'] if k == 0 else e['c'][2:])
            interior = r['nodes'][e['v0'] + 1:e['v1']]
            if any(nid in graph_node_ids for nid in interior) or r['nodes'][e['v0']] != e['from'] or r['nodes'][e['v1']] != e['to']:
                map_err.append((i, f'cạnh {ei} chưa tách đúng tại nút'))
        coords = [[flat[j], flat[j + 1]] for j in range(0, len(flat), 2)]
        if coords != d['c'] or len(r['nodes']) != len(d['c']) or prev_v1 != len(d['c']) - 1:
            map_err.append((i, 'tọa độ không khớp D.roads'))
        w = ways_raw[r['id']]
        if any(nid > 0 and nid not in w['nodes'] for nid in r['nodes']):
            map_err.append((i, 'node ID không thuộc way'))
        bset = {k for k, nid in enumerate(r['nodes']) if nid < 0}
        if bset != set(r['boundaryVertices']) or not bset <= {0, len(r['nodes']) - 1}:
            map_err.append((i, 'boundaryVertices'))
    x0, x1, z0, z1 = frame['extent']
    for nid, n in node_by_id.items():
        if nid < 0 and min(abs(n['x'] - x0), abs(n['x'] - x1), abs(n['z'] - z0), abs(n['z'] - z1)) > .02:
            map_err.append((nid, 'nút biên không nằm trên cạnh bbox'))
    orphan_edges = [i for i in range(len(edges)) if owner[i] != 1]
    check('mọi way trong D.roads ánh xạ hai chiều (way id + part)', not map_err and not orphan_edges,
          f'{len(D["roads"]):,} road ↔ {len(roads):,}; lỗi {map_err[:5]}; cạnh không thuộc road {orphan_edges[:5]}')

    # --- Cạnh mồ côi ----------------------------------------------------------------------------
    parent = {}

    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in edges:
        parent[find(e['from'])] = find(e['to'])
    comp_edges = collections.defaultdict(list)
    for i, e in enumerate(edges):
        comp_edges[find(e['from'])].append(i)
    usage_kept = collections.Counter()
    for r in roads:
        for nid in set(r['nodes']):
            usage_kept[nid] += 1
    usage_raw = collections.Counter()
    excluded_nodes = set()
    for w in ways_raw.values():
        if 'highway' in w.get('tags', {}):
            for nid in set(w['nodes']):
                usage_raw[nid] += 1
                if w['tags']['highway'] in EXCLUDED_HIGHWAYS:
                    excluded_nodes.add(nid)
    lost, exceptions = [], collections.defaultdict(list)
    for comp in comp_edges.values():
        if len(comp) != 1:
            continue
        e = edges[comp[0]]
        ends = [node_by_id[e['from']], node_by_id[e['to']]]
        if any(n['kind'] in ('boundary', 'junction') for n in ends):
            continue
        if any(usage_kept[n['id']] > 1 for n in ends):
            lost.append(e['way'])
        elif any(n['id'] in excluded_nodes for n in ends):
            exceptions['chỉ nối với way bị loại (steps/construction/proposed)'].append(e['way'])
        elif any(usage_raw[n['id']] > 1 for n in ends):
            exceptions['nối với way highway khác ngoài phạm vi giữ lại'].append(e['way'])
        else:
            exceptions['way đứng riêng trong OSM (không chung node)'].append(e['way'])
    print(f'Thành phần liên thông: {len(comp_edges):,}; thành phần 1 cạnh hợp lệ: {sum(map(len, exceptions.values())):,}')
    for reason, ids in exceptions.items():
        print(f'  ngoại lệ hợp lệ [{reason}]: {len(ids)} — ví dụ {ids[:8]}')
    check('không có cạnh mồ côi do mất kết nối', not lost, f'{lost[:10]}')

    # --- Thuộc tính chuẩn hóa -------------------------------------------------------------------
    attr_err = []
    for r in roads:
        t = ways_raw[r['id']]['tags']
        if r['oneway'] != oneway_expected(t):
            attr_err.append((r['id'], 'oneway', r['oneway'], t.get('oneway')))
        if not isinstance(r['layer'], int) or (r['maxspeed'] is not None and not isinstance(r['maxspeed'], (int, float))):
            attr_err.append((r['id'], 'layer/maxspeed'))
        if 'layer' not in t and r['layer'] != 0:
            attr_err.append((r['id'], 'layer mặc định'))
        if not isinstance(r['lanes'], int) or r['lanes'] < 1 or r['lanesInferred'] != (not lanes_tagged(t)):
            attr_err.append((r['id'], 'lanes'))
        for k in ('bridge', 'covered', 'indoor', 'highway', 'junction', 'tunnel'):
            if r[k] != t.get(k):
                attr_err.append((r['id'], k))
    check('oneway/layer/maxspeed/lanes/tag cầu chuẩn hóa đúng', not attr_err, f'{attr_err[:6]}')
    ow = collections.Counter(r['oneway'] for r in roads)
    ow_edges = collections.Counter(e['oneway'] for e in edges)
    total_len = sum(e['length'] for e in edges)
    ow_len = sum(e['length'] for e in edges if e['oneway'] != 'no')
    print(f"Tỉ lệ oneway: road {(ow['yes'] + ow['-1']) / len(roads):.1%} ({dict(ow)}); "
          f"cạnh {(ow_edges['yes'] + ow_edges['-1']) / len(edges):.1%}; theo chiều dài {ow_len / total_len:.1%}")
    print(f"maxspeed có giá trị: {sum(r['maxspeed'] is not None for r in roads):,}/{len(roads):,}; lanes suy luận: {sum(r['lanesInferred'] for r in roads):,}")

    # --- Cầu và profile -------------------------------------------------------------------------
    br = G['bridges']
    clusters = {cl['id']: cl for cl in br['clusters']}
    cluster_of_road = {}
    for cl in br['clusters']:
        for ri in cl['roads']:
            cluster_of_road[ri] = cl
    prof_err = []
    for i, d in enumerate(D['roads']):
        r = roads[i]
        if not d['bridge']:
            if r['elevationClass'] != 'ground':
                prof_err.append((r['id'], 'road không cầu mang class cầu'))
            continue
        cl = cluster_of_road.get(i)
        if cl is None or r['elevationClass'] not in BRIDGE_CLASSES or cl['elevationClass'] != r['elevationClass'] or not r.get('elevationReason'):
            prof_err.append((r['id'], 'thiếu cụm/class/lý do'))
            continue
        if r['elevationClass'] == 'skip':
            continue
        if cl['peakY'] <= gy:
            prof_err.append((r['id'], 'peakY không cao hơn nền'))
        for ei in r['edges']:
            e = edges[ei]
            if len(e.get('y') or []) * 2 != len(e['c']) or not e.get('profile'):
                prof_err.append((r['id'], f'cạnh {ei} thiếu y/profile'))
    for r in roads:
        t = ways_raw[r['id']]['tags']
        hard_skip = t.get('covered', 'no') != 'no' or t.get('indoor', 'no') != 'no' or t.get('highway') == 'corridor'
        if r['bridge'] and hard_skip and r['elevationClass'] != 'skip':
            prof_err.append((r['id'], 'covered/indoor/corridor phải skip'))
        if r['elevationClass'] not in ('ground', 'skip') and t.get('highway') in FOOT_HIGHWAYS and not r.get('override'):
            prof_err.append((r['id'], 'footway không override phải skip'))
    check('mọi cầu không skip có profile; class hợp lệ; skip đúng quy tắc', not prof_err, f'{prof_err[:6]}')
    by_class = collections.Counter(cl['elevationClass'] for cl in br['clusters'])
    print(f"Cụm cầu: {len(br['clusters'])} ({dict(by_class)}); road cầu theo class: {dict(collections.Counter(r['elevationClass'] for r in roads if r['bridge']))}")

    y_err = []
    for i, e in enumerate(edges):
        ys = e.get('y')
        a, b = node_by_id[e['from']]['y'], node_by_id[e['to']]['y']
        ea, eb = (ys[0], ys[-1]) if ys else (gy, gy)
        if abs(ea - a) > Y_TOL or abs(eb - b) > Y_TOL:
            y_err.append((i, e['way'], ea, a, eb, b))
        if e['elevationClass'] not in CLASSES:
            y_err.append((i, 'class'))
        if ys and e['elevationClass'] == 'ground' and e.get('rampOf') not in clusters:
            y_err.append((i, 'cạnh ground có y nhưng không thuộc dốc dẫn của cụm nào'))
        if ys and any(v < gy - 1e-9 for v in ys):
            y_err.append((i, 'y thấp hơn nền'))
        prof = e.get('profile')
        if prof:
            if abs(prof[1] - ea) > Y_TOL or abs(prof[-1] - eb) > Y_TOL or abs(prof[-2] - e['length']) > .05 or prof[0] != 0:
                y_err.append((i, 'profile lệch đầu mút'))
        elif ys:
            y_err.append((i, 'có y nhưng thiếu profile'))
    ramps = sum(1 for e in edges if e.get('rampOf') is not None)
    check(f'y hai đầu mỗi cạnh khớp nút và cạnh kề (≤ {Y_TOL} m)', not y_err, f'{len(y_err)} lỗi, ví dụ {y_err[:4]}')
    print(f"Cạnh có y: {sum(1 for e in edges if e.get('y')):,} (cạnh cầu {sum(1 for e in edges if e.get('y') and e['elevationClass'] != 'ground'):,}, cạnh dốc dẫn {ramps:,})")

    worst = (0, None)
    for i, e in enumerate(edges):
        ys = e.get('y')
        if not ys:
            continue
        c = e['c']
        s = [0.0]
        for k in range(len(ys) - 1):
            s.append(s[-1] + math.hypot(c[2 * k + 2] - c[2 * k], c[2 * k + 3] - c[2 * k + 1]))
        p = e['profile']
        worst = max(worst, (windowed_max_grade(s, ys), (i, e['way'], 'đỉnh')), (windowed_max_grade(p[0::2], p[1::2]), (i, e['way'], 'profile')))
    check(f'độ dốc tối đa ≤ {MAX_GRADE:.0%} (cửa sổ {GRADE_WINDOW_M:g} m)', worst[0] <= MAX_GRADE, f'max {worst[0]:.2%} tại {worst[1]}')

    # --- Signature, ảnh 03, xung đột ------------------------------------------------------------
    sig = {s['key']: s for s in br['signature']}
    ba, bd = sig.get('ba-son'), sig.get('bach-dang-footbridge')
    ba_peaks = {clusters[cluster_of_road[i]['id']]['peakY'] for i, r in enumerate(roads) if r['id'] in BA_SON_WAYS}
    check('signature Ba Son khớp hộp mặt cầu (y≈11,25 + 1,6)',
          ba is not None and BA_SON_WAYS <= set(ba['wayIds']) and abs(ba['suggestedDeckTopY'] - BA_SON_DECK_TOP_Y) < .01
          and all(r['signature'] == 'ba-son' for r in roads if r['id'] in BA_SON_WAYS)
          and ba_peaks and all(abs(p - BA_SON_DECK_TOP_Y) < .01 for p in ba_peaks), f'peakY {sorted(ba_peaks)}')
    # Hộp mặt cầu signature phẳng ở y=11,25: đoạn Ba Son trên mặt nước phải nằm đúng đỉnh hộp.
    water_rings = [rg[0] for rg in D['water']]
    water_box = [(min(p[0] for p in rg), max(p[0] for p in rg), min(p[1] for p in rg), max(p[1] for p in rg)) for rg in water_rings]
    ba_water = []
    for r in roads:
        if r['id'] not in BA_SON_WAYS:
            continue
        for ei in r['edges']:
            e = edges[ei]
            p = e.get('profile') or []
            for k in range(0, len(p), 2):
                x, z = point_at(e['c'], p[k])
                yv = p[k + 1]
                if any(b[0] <= x <= b[1] and b[2] <= z <= b[3] and point_in_ring(x, z, rg) for b, rg in zip(water_box, water_rings)):
                    ba_water.append(yv)
    check('Ba Son: mọi đỉnh trên mặt nước nằm ở đỉnh hộp signature',
          bool(ba_water) and all(abs(v - BA_SON_DECK_TOP_Y) <= Y_TOL for v in ba_water),
          f'{len(ba_water)} đỉnh, y {min(ba_water, default=None)}–{max(ba_water, default=None)}')
    issue_y = [v for r in roads if r['id'] in ISSUE03_WAYS for ei in r['edges'] for v in (edges[ei].get('y') or [gy])]
    check('ảnh 03: không bị nâng (kể cả dốc dẫn lan tới)', bool(issue_y) and max(issue_y) <= gy + Y_TOL, f'max y {max(issue_y, default=None)}')
    check('signature bach-dang-footbridge có way id và gợi ý cao độ',
          bd is not None and BACH_DANG_WAYS <= set(bd['wayIds']) and isinstance(bd.get('suggestedDeckTopY'), (int, float)))
    conflicts = br['conflicts']
    issue = br.get('issue03') or {}
    issue_roads = [r for r in roads if r['id'] in ISSUE03_WAYS]
    hit = [c for c in conflicts if c['way'] in ISSUE03_WAYS]
    check('ảnh 03: way gây lỗi được xác định, đặt skip và có xung đột liệt kê',
          ISSUE03_WAYS <= set(issue.get('wayIds', [])) and issue_roads and all(r['elevationClass'] == 'skip' for r in issue_roads)
          and bool(hit) and bool(issue.get('action')), f"{len(hit)} xung đột trên way {sorted(ISSUE03_WAYS)}")
    by_action = collections.Counter(c['suggestion'] for c in conflicts)
    vertical = [c for c in conflicts if c['verticalOverlap']]
    print(f'Xung đột công trình–cầu: {len(conflicts)} (giao theo chiều cao {len(vertical)}; {dict(by_action)})')
    for c in conflicts[:40]:
        print(f"  way {c['way']} {c['name'] or '(không tên)'} [{c['elevationClass']}] ↔ công trình {c['building']} {c['buildingName'] or ''} ({c['origin']}, {c['buildingType']}, h={c['buildingH']} m, min={c['buildingMin']}) "
              f"mặt cầu y={c['deckY'][0]}–{c['deckY'][1]}, giao {c['overlapM2']} m² → {c['suggestion']}")
    if len(conflicts) > 40:
        print(f'  … còn {len(conflicts) - 40} xung đột (xem bridges.conflicts)')
    cross = br.get('crossings', [])
    print(f"Giao cắt cạnh nâng ↔ cạnh khác (không chung nút): {len(cross)}; cần xử lý xếp tầng: {sum(1 for c in cross if c['issue'])} "
          f"({dict(collections.Counter(c['issue'] for c in cross if c['issue']))})")

    print('KẾT QUẢ:', 'PASS' if not failures else f'FAIL ({len(failures)}): {failures}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
