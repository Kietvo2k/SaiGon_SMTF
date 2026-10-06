"""Bảng sửa lỗi công trình runtime cho bước C 31A (cầu): data/bridge-corrections-31.{json,js}.

Không sửa scene.js hay dữ liệu nguồn: runtime webgpu-materials-24.js đọc bảng này (window.BRIDGE_CORRECTIONS_31) rồi ẩn
hoặc chỉnh min/h của từng công trình, mỗi mục kèm lý do — cùng cách WEBGPU_CORRECTIONS_24.

Ba quy tắc, công trình signature (signature-registry-31.json, kind=building) không bao giờ bị ẩn hay chỉnh:
  1. bridge-conflict: công trình giao mặt đường nâng (đoạn cầu có y ≥ groundY + bản mặt, đoạn dốc dẫn trên road mặt đất
     có y ≥ groundY + 4 m) cùng
     bridges.conflicts của road-graph-31) và chồng theo chiều cao với [đáy bản mặt, mặt cầu + tĩnh không].
       building=roof   → raise-min: mái thành tán che, đáy cao hơn mặt đường + tĩnh không, dày 1,2 m.
       Overture        → hide: footprint ước lượng (ảnh vệ tinh/ML), mặt cầu là quan hệ đã kiểm trên OSM.
       OSM khác        → clip-below-deck: hạ đỉnh xuống dưới đáy bản mặt nếu còn ≥ 3 m, nếu không thì hide.
  2. nguyen-hue-plaza: footprint Overture q=estimated nằm ≥ 80 % trong lòng phố đi bộ Nguyễn Huệ (dải giữa hai lòng
     đường 341504312 và 377881079, lùi 1 m khỏi mép lòng đường) → hide.
  3. in-road-surface: footprint Overture q=estimated nằm ≥ 80 % trong mặt đường xe/pedestrian ở mặt đất (bề rộng như
     city-road-network-31.js) → hide.

Chạy: PYTHONPATH=<thư mục có shapely> python scripts/build_bridge_corrections_31.py (từ outputs/hcmc-poc).
Đầu ra xác định: sắp xếp theo id, không có thời gian sinh; inputs ghi sha256 nội dung đã chuẩn hóa CRLF→LF.
"""
import collections
import hashlib
import json
import math
import pathlib
import sys

from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / 'data/bridge-corrections-31.json'
OUT_JS = ROOT / 'data/bridge-corrections-31.js'

# webgpu-materials-24.js: widths + roadWidth31 (city-road-network-31.js) — bề rộng mặt đường đang vẽ.
WIDTHS = {'motorway': 16, 'trunk': 15, 'primary': 14, 'secondary': 11, 'tertiary': 8, 'residential': 5,
          'living_street': 4, 'service': 3.5, 'unclassified': 5, 'footway': 2.5, 'pedestrian': 12, 'cycleway': 2,
          'path': 1.5}
FOOT_TYPES = {'footway', 'path', 'cycleway', 'steps', 'bridleway', 'corridor'}
BUILDING_BASE_M = 1.5          # webgpu-materials-24.js: base = b.min + 1.5, đỉnh = b.h + 1.5
ELEVATED_EPS_M = 0.3
# Quy tắc 1 tự đo chỉ xét đoạn có mặt đường cao ≥ groundY + bề dày bản mặt (thấy được mặt dưới), hành lang đúng bề rộng
# mặt đường (không biên), giao ≥ 2 m²: dốc dẫn thấp trong hẻm sát nhà không bị coi là xuyên nhà. 23 xung đột của
# road-graph-31 (hành lang width + 1,8 m) vẫn áp nguyên.
CONFLICT_MIN_OVERLAP_M2 = 2.0
# Dốc dẫn trên road mặt đất (elevationClass ground) chỉ xét khi đủ cao để thấy rõ mặt dưới và lối đi bên dưới
# (groundY + bản mặt + tĩnh không bộ hành = groundY + 4 m); thấp hơn là nền đắp, nhà sát hẻm không bị ẩn.
RAMP_MIN_LIFT_M = 1.5 + 2.5
CORRIDOR_MARGIN_M = 0.9        # chỉ để ghi policy: biên mỗi bên của bridges.conflicts trong build_road_graph_31.py
CANOPY_THICKNESS_M = 1.2
CLIP_MIN_HEIGHT_M = 3.0
IN_ROAD_SHARE = 0.8
NGUYEN_HUE_WAYS = (341504312, 377881079)
NGUYEN_HUE_INSET_M = 1.0
# Ba footprint được báo "sai giữa phố đi bộ Nguyễn Huệ" trong yêu cầu bước C — kiểm riêng, ghi quyết định.
NGUYEN_HUE_REPORTED = (2000032744, 2000032745, 2000032746)


def load_js_json(path):
    text = path.read_text(encoding='utf-8')
    return json.loads(text[text.index('=') + 1:].rstrip().rstrip(';'))


def sha_lf(path):
    return hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def road_width(d):
    w = WIDTHS.get(d['type'], 4)
    return max(w, d['lanes'] * 3.1) if d.get('lanes') else w


def poly_of(b):
    p = Polygon(b['r'][0], b['r'][1:])
    return p if p.is_valid else p.buffer(0)


def r2(v):
    return round(v + 0.0, 2)


def main():
    D = load_js_json(ROOT / 'data/scene.js')
    G = json.loads((ROOT / 'data/road-graph-31.json').read_text(encoding='utf-8'))
    REG = json.loads((ROOT / 'data/signature-registry-31.json').read_text(encoding='utf-8'))
    gy = G['frame']['groundY']
    clear = G['bridges']['clearance']
    deck = G['bridges']['deckThicknessM']
    signature = {int(i) for e in REG['entries'] if e['kind'] == 'building' for i in e['ids']}
    buildings = D['buildings']
    polys = [poly_of(b) for b in buildings]
    tree = STRtree(polys)
    roads_g = G['roads']

    def drawn(ri):
        return not D['roads'][ri]['tunnel'] and roads_g[ri].get('skipRender') != 'hide'

    def origin(b):
        return b.get('origin') or ('Overture' if b.get('gers') else 'OSM')

    def clearance_of(ri):
        return clear['foot'] if roads_g[ri]['highway'] in FOOT_TYPES else clear['vehicle']

    out = {}   # id -> mục sửa (mục đầu tiên theo thứ tự quy tắc thắng)
    skipped_signature = []

    def add(b, entry):
        bid = int(b['id'])
        if bid in signature:
            skipped_signature.append({'id': bid, 'rule': entry['rule'], 'reason': 'công trình signature: không ẩn/chỉnh'})
            return
        if bid in out:
            out[bid].setdefault('alsoRules', []).append(entry['rule'])
            return
        entry = {'id': bid, 'origin': origin(b), 'q': b.get('q'), 'type': b.get('type'), 'h': b['h'],
                 'min': b.get('min') or 0, **entry}
        out[bid] = entry

    # --- 1. bridge-conflict ------------------------------------------------------------------------
    # Mẫu mặt đường nâng: mỗi cạnh có y, lấy mẫu 2 m theo polyline, mỗi mẫu là đoạn hành lang (buffer) + y.
    conflict_hits = collections.defaultdict(list)   # building index -> [(road index, y lo, y hi, overlap m²)]
    for ei, e in enumerate(G['edges']):
        ri = e['road']
        floor_y = gy + (deck if roads_g[ri]['elevationClass'] not in ('ground', 'skip') else RAMP_MIN_LIFT_M)
        if not e.get('y') or max(e['y']) < floor_y or not drawn(ri):
            continue
        d = D['roads'][ri]
        half = road_width(d) / 2
        c = e['c']
        pts = [(c[k], c[k + 1]) for k in range(0, len(c), 2)]
        ys = e['y']
        for k in range(len(pts) - 1):
            ya, yb = ys[k], ys[k + 1]
            if max(ya, yb) < floor_y:
                continue
            seg = LineString([pts[k], pts[k + 1]])
            if seg.length < 1e-6:
                continue
            band = seg.buffer(half, cap_style=2)
            for bi in tree.query(band, predicate='intersects'):
                bi = int(bi)
                area = band.intersection(polys[bi]).area
                if area < CONFLICT_MIN_OVERLAP_M2:
                    continue
                conflict_hits[bi].append((ri, min(ya, yb), max(ya, yb), area))
    for c in G['bridges']['conflicts']:
        if c['verticalOverlap']:
            lo, hi = c['deckY']
            conflict_hits[c['buildingIndex']].append((c['road'], lo, hi, c['overlapM2']))
    for bi in sorted(conflict_hits, key=lambda i: int(buildings[i]['id'])):
        b = buildings[bi]
        hits = conflict_hits[bi]
        base, top = (b.get('min') or 0) + BUILDING_BASE_M, b['h'] + BUILDING_BASE_M
        lo = min(h[1] for h in hits)
        hi = max(h[2] for h in hits)
        need = max(clearance_of(h[0]) for h in hits)
        if not (base < hi + need and top > lo - deck):
            continue   # công trình nằm hẳn dưới bản mặt hoặc trên tĩnh không: không xung đột
        ri = max(hits, key=lambda h: h[3])[0]
        way = D['roads'][ri]['id']
        name = D['roads'][ri].get('name') or '(không tên)'
        area = r2(sum(h[3] for h in hits))
        common = {'rule': 'bridge-conflict', 'way': way, 'deckY': [r2(lo), r2(hi)], 'overlapM2': area}
        if b.get('type') == 'roof':
            new_min = r2(hi + need - BUILDING_BASE_M)
            add(b, {**common, 'action': 'raise-min', 'setMin': new_min, 'setH': r2(max(new_min + CANOPY_THICKNESS_M, 0)),
                    'reason': f'building=roof che phía trên way {way} {name} (mặt đường y≤{hi:.2f} m): nâng đáy mái lên trên '
                              f'tĩnh không {need} m thành tán che dày {CANOPY_THICKNESS_M} m; h={b["h"]} m là ước lượng, không đo'})
        elif origin(b) == 'Overture':
            add(b, {**common, 'action': 'hide',
                    'reason': f'footprint Overture ({b.get("q")}) nằm trong hành lang mặt đường nâng way {way} {name} '
                              f'(y {lo:.2f}–{hi:.2f} m), chồng chiều cao với bản mặt/tĩnh không'})
        else:
            clip_h = r2(lo - deck - BUILDING_BASE_M - 0.3)
            if clip_h - (b.get('min') or 0) >= CLIP_MIN_HEIGHT_M:
                add(b, {**common, 'action': 'clip-below-deck', 'setH': clip_h,
                        'reason': f'công trình OSM dưới mặt đường nâng way {way} {name}: hạ đỉnh xuống dưới đáy bản mặt '
                                  f'(y {lo:.2f} m − {deck} m)'})
            else:
                add(b, {**common, 'action': 'hide',
                        'reason': f'công trình OSM nằm trong hành lang way {way} {name}, không đủ chỗ dưới bản mặt '
                                  f'(còn < {CLIP_MIN_HEIGHT_M} m) nên ẩn'})

    # --- 2. nguyen-hue-plaza ----------------------------------------------------------------------
    by_id = {d['id']: (i, d) for i, d in enumerate(D['roads'])}
    (ia, a), (ib, bb) = by_id[NGUYEN_HUE_WAYS[0]], by_id[NGUYEN_HUE_WAYS[1]]
    hull = Polygon(list(a['c']) + list(bb['c']))
    carriage = unary_union([LineString(a['c']).buffer(road_width(a) / 2 + NGUYEN_HUE_INSET_M, cap_style=2),
                            LineString(bb['c']).buffer(road_width(bb) / 2 + NGUYEN_HUE_INSET_M, cap_style=2)])
    plaza = hull.buffer(0).difference(carriage)
    for bi in sorted((int(i) for i in tree.query(plaza, predicate='intersects')), key=lambda i: int(buildings[i]['id'])):
        b = buildings[bi]
        share = polys[bi].intersection(plaza).area / max(polys[bi].area, 1e-6)
        if share >= IN_ROAD_SHARE and origin(b) == 'Overture' and b.get('q') == 'estimated':
            add(b, {'rule': 'nguyen-hue-plaza', 'action': 'hide', 'share': r2(share),
                    'reason': f'footprint Overture ước lượng nằm {share:.0%} trong lòng phố đi bộ Nguyễn Huệ '
                              f'(giữa hai lòng đường {NGUYEN_HUE_WAYS[0]}/{NGUYEN_HUE_WAYS[1]}): quảng trường mở, không có nhà'})
    reported = []
    for bid in NGUYEN_HUE_REPORTED:
        bi = next(i for i, b in enumerate(buildings) if int(b['id']) == bid)
        b = buildings[bi]
        share = polys[bi].intersection(plaza).area / max(polys[bi].area, 1e-6)
        near = min((LineString(d['c']).distance(polys[bi]), d['id'], d.get('name') or '') for d in D['roads']
                   if len(d['c']) > 1 and LineString(d['c']).distance(polys[bi]) < 60)
        reported.append({'id': bid, 'center': b['center'], 'plazaShare': r2(share), 'nearestRoad': {'way': near[1], 'name': near[2], 'distanceM': r2(near[0])},
                         'decision': 'hide' if bid in out else 'keep',
                         'reason': 'nằm trong khối nhà phía đông lòng đường 377881079 (Đông Du–Nguyễn Thiệp–Đồng Khởi), '
                                   'không nằm trong lòng phố đi bộ; không có mặt đường nào phủ' if bid not in out else out[bid]['reason']})

    # --- 3. in-road-surface -----------------------------------------------------------------------
    elevated_edges = {ei for ei, e in enumerate(G['edges']) if e.get('y') and max(e['y']) > gy + ELEVATED_EPS_M}
    bands = []
    for ri, d in enumerate(D['roads']):
        if not drawn(ri) or d['type'] in FOOT_TYPES or len(d['c']) < 2:
            continue
        if any(ei in elevated_edges for ei in roads_g[ri]['edges']):
            continue   # mặt đường nâng đã xét ở quy tắc 1 (công trình dưới cầu có thể hợp lệ)
        bands.append(LineString(d['c']).buffer(road_width(d) / 2, cap_style=2, join_style=2))
    band_tree = STRtree(bands)
    in_road = 0
    for bi, b in enumerate(buildings):
        if origin(b) != 'Overture' or b.get('q') != 'estimated':
            continue
        p = polys[bi]
        near = [bands[int(k)] for k in band_tree.query(p, predicate='intersects')]
        if not near:
            continue
        share = p.intersection(unary_union(near)).area / max(p.area, 1e-6)
        if share >= IN_ROAD_SHARE:
            in_road += 1
            add(b, {'rule': 'in-road-surface', 'action': 'hide', 'share': r2(share),
                    'reason': f'footprint Overture ước lượng nằm {share:.0%} trong mặt đường đang vẽ ở mặt đất'})

    entries = [out[k] for k in sorted(out)]
    by_action = dict(sorted(collections.Counter(e['action'] for e in entries).items()))
    by_rule = dict(sorted(collections.Counter(e['rule'] for e in entries).items()))
    inputs = [{'path': p, 'sha256': sha_lf(ROOT / p)} for p in
              ('data/scene.js', 'data/road-graph-31.json', 'data/signature-registry-31.json')]
    data = {
        'schema': 'rtr.city-lab.bridge-corrections.v1', 'version': '31C',
        'generated': {'script': 'scripts/build_bridge_corrections_31.py', 'deterministic': True, 'inputs': inputs},
        'classification': 'runtime_correction_table',
        'policy': {'buildingBaseM': BUILDING_BASE_M, 'conflictMinOverlapM2': CONFLICT_MIN_OVERLAP_M2, 'rampMinLiftM': RAMP_MIN_LIFT_M, 'graphConflictMarginM': CORRIDOR_MARGIN_M,
                   'clearance': clear, 'deckThicknessM': deck, 'inRoadShare': IN_ROAD_SHARE,
                   'signature': 'công trình signature không bao giờ bị ẩn hay chỉnh'},
        'stats': {'entries': len(entries), 'byAction': by_action, 'byRule': by_rule,
                  'graphConflicts': len(G['bridges']['conflicts']), 'signatureSkipped': len(skipped_signature)},
        'buildings': entries,
        'signatureSkipped': skipped_signature,
        'nguyenHueReported': reported,
    }
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    OUT_JS.write_text(f'window.BRIDGE_CORRECTIONS_31={text};\n', encoding='utf-8', newline='\n')
    print(f'Mục sửa: {len(entries)} · theo action {by_action} · theo quy tắc {by_rule}')
    print(f'Signature bỏ qua: {skipped_signature}')
    for r in reported:
        print('Nguyễn Huệ được báo:', r)
    for e in entries:
        if e['rule'] != 'in-road-surface':
            print(f"  {e['id']} {e['action']} [{e['rule']}] {e['reason']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
