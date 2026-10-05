"""Khảo sát 31A: đếm tag OSM bị prepare_scene.py bỏ, liệt kê cầu và giao cắt với footprint.

Chạy từ gốc repo: python research/baseline-30b/tools/analyze_osm_31.py
Đầu ra: research/baseline-30b/osm-bridges-30b.json (chỉ đọc dữ liệu, không sửa app).
"""
import json, math, pathlib, collections

# Không dùng shapely (chưa cài trong môi trường); hình học đọc từ scene.json đã cắt bbox.
ROOT = pathlib.Path(__file__).resolve().parents[3]
APP = ROOT / 'outputs/hcmc-poc'
OUT = ROOT / 'research/baseline-30b/osm-bridges-30b.json'
raw = json.loads((APP / 'data/osm-raw.json').read_text(encoding='utf-8'))
scene = json.loads((APP / 'data/scene.json').read_text(encoding='utf-8'))
ways = [e for e in raw['elements'] if e['type'] == 'way' and 'highway' in e.get('tags', {})]
way_by_id = {w['id']: w for w in ways}
rendered = [w for w in ways if w['tags']['highway'] not in ('steps', 'construction', 'proposed')]
tag_counts = {}
for key in ['oneway', 'layer', 'junction', 'maxspeed', 'bridge', 'tunnel', 'lanes', 'covered', 'indoor',
            'level', 'turn:lanes', 'footway', 'crossing', 'sidewalk']:
    c = collections.Counter(str(w['tags'][key]) for w in ways if key in w['tags'])
    tag_counts[key] = {'ways': sum(c.values()), 'values': dict(c.most_common())}
node_use = collections.Counter(n for w in rendered for n in w.get('nodes', []))
tag_counts['nodes'] = {'ways': sum(1 for w in ways if w.get('nodes')),
                       'sharedNodeIds': sum(1 for k in node_use.values() if k > 1)}

CELL = 100
grid = collections.defaultdict(list)
for b in scene['buildings']:
    ring = b['r'][0]
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    item = (b, min(xs), max(xs), min(zs), max(zs))
    for gx in range(math.floor(item[1] / CELL), math.floor(item[2] / CELL) + 1):
        for gz in range(math.floor(item[3] / CELL), math.floor(item[4] / CELL) + 1):
            grid[(gx, gz)].append(item)


def inside(pt, ring):
    x, z = pt; res = False; j = len(ring) - 1
    for i in range(len(ring)):
        a, c = ring[i], ring[j]
        if (a[1] > z) != (c[1] > z) and x < (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1]) + a[0]:
            res = not res
        j = i
    return res


def building_at(pt):
    for b, x0, x1, z0, z1 in grid.get((math.floor(pt[0] / CELL), math.floor(pt[1] / CELL)), []):
        if x0 <= pt[0] <= x1 and z0 <= pt[1] <= z1 and inside(pt, b['r'][0]) and not any(inside(pt, h) for h in b['r'][1:]):
            return b
    return None


def line_hits(coords, step=1.0):
    hits = collections.Counter(); meta = {}; length = 0.0
    for a, c in zip(coords, coords[1:]):
        seg = math.dist(a, c); length += seg
        n = max(1, int(seg / step))
        for k in range(n):
            t = (k + .5) / n
            b = building_at((a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t))
            if b:
                key = (b['id'], b.get('partIndex')); hits[key] += seg / n; meta[key] = b['h']
    return length, [{'buildingId': k[0], 'heightM': meta[k], 'insideLengthM': round(v, 1)} for k, v in hits.most_common() if v > .5]


# Bề rộng ribbon giống webgpu-materials-24.js dòng 389–402 (edge = width + 1.8).
WIDTHS = {'motorway': 16, 'trunk': 15, 'primary': 14, 'secondary': 11, 'tertiary': 8, 'residential': 5, 'living_street': 4,
          'service': 3.5, 'unclassified': 5, 'footway': 2.5, 'pedestrian': 12, 'cycleway': 2, 'path': 1.5}


def deck_half_width(road):
    w = WIDTHS.get(road['type'], 4)
    if road.get('lanes'):
        w = max(w, road['lanes'] * 3.1)
    return (w + 1.8) / 2


def deck_hits(coords, half, step=1.0):
    # Lấy mẫu cả bề ngang mặt cầu (5 vệt), vì nhà Overture nhỏ có thể nằm lệch tim đường.
    hits = {}
    for a, c in zip(coords, coords[1:]):
        seg = math.dist(a, c)
        if seg < .1:
            continue
        nx, nz = -(c[1] - a[1]) / seg, (c[0] - a[0]) / seg
        n = max(1, int(seg / step))
        for k in range(n):
            t = (k + .5) / n
            for off in (-half, -half / 2, 0, half / 2, half):
                b = building_at((a[0] + (c[0] - a[0]) * t + nx * off, a[1] + (c[1] - a[1]) * t + nz * off))
                if b:
                    hits[(b['id'], b.get('partIndex'))] = b
    return [{'buildingId': b['id'], 'heightM': b['h'], 'origin': b.get('origin', 'OSM'), 'heightQuality': b.get('q')}
            for b in hits.values()]


def mid_of(coords):
    total = sum(math.dist(a, c) for a, c in zip(coords, coords[1:])); acc = 0
    for a, c in zip(coords, coords[1:]):
        seg = math.dist(a, c)
        if acc + seg >= total / 2 and seg:
            t = (total / 2 - acc) / seg
            return [round(a[0] + (c[0] - a[0]) * t, 1), round(a[1] + (c[1] - a[1]) * t, 1)]
        acc += seg
    return [round(coords[0][0], 1), round(coords[0][1], 1)]


bridges = []
for road in scene['roads']:
    if not road.get('bridge'):
        continue
    t = way_by_id[road['id']]['tags']
    length, hits = line_hits(road['c'])
    dhits = deck_hits(road['c'], deck_half_width(road))
    bridges.append({
        'wayId': road['id'], 'name': t.get('name', ''), 'highway': t['highway'], 'layer': t.get('layer'),
        'oneway': t.get('oneway'), 'lanes': t.get('lanes'), 'covered': t.get('covered'), 'indoor': t.get('indoor'),
        'footway': t.get('footway'), 'lengthM': round(length, 1), 'mid': mid_of(road['c']),
        'buildingHits': len(hits), 'buildingInsideM': round(sum(h['insideLengthM'] for h in hits), 1),
        'hitsTallerThan13m': sum(1 for h in hits if h['heightM'] > 13), 'hits': hits[:8],
        'deckHalfWidthM': round(deck_half_width(road), 2), 'deckBuildingHits': len(dhits), 'deckHits': dhits[:12],
    })
bridges.sort(key=lambda b: (-b['buildingInsideM'], -b['lengthM']))
by_name = {}
for b in bridges:
    g = by_name.setdefault(b['name'] or '(không tên)', {'ways': 0, 'lengthM': 0.0, 'types': collections.Counter(),
                                                       'layers': collections.Counter(), 'buildingInsideM': 0.0})
    g['ways'] += 1; g['lengthM'] += b['lengthM']; g['types'][b['highway']] += 1
    g['layers'][str(b['layer'])] += 1; g['buildingInsideM'] += b['buildingInsideM']
summary = sorted(({'name': k, 'ways': v['ways'], 'lengthM': round(v['lengthM'], 1), 'types': dict(v['types']),
                   'layers': dict(v['layers']), 'buildingInsideM': round(v['buildingInsideM'], 1)} for k, v in by_name.items()),
                 key=lambda r: -r['lengthM'])

# Roundabout gần cầu (ứng viên ảnh 01/02).
rb = []
for road in scene['roads']:
    w = way_by_id[road['id']]
    if w['tags'].get('junction') != 'roundabout':
        continue
    cx = sum(p[0] for p in road['c']) / len(road['c']); cz = sum(p[1] for p in road['c']) / len(road['c'])
    near = [b for b in bridges if math.dist(b['mid'], (cx, cz)) < 260 and b['highway'] not in ('footway', 'path', 'cycleway', 'pedestrian')]
    rb.append({'wayId': road['id'], 'name': w['tags'].get('name', ''), 'center': [round(cx, 1), round(cz, 1)],
               'nearBridgeWays': len(near), 'nearBridgeNames': sorted({b['name'] for b in near})})
rb.sort(key=lambda r: -r['nearBridgeWays'])

result = {'source': 'outputs/hcmc-poc/data/osm-raw.json', 'highwayWays': len(ways), 'renderedHighwayWays': len(rendered),
          'sceneRoads': len(scene['roads']), 'sceneRoadKeys': sorted({k for r in scene['roads'] for k in r}),
          'tagCounts': tag_counts, 'bridgeWays': len(bridges), 'bridgeTypes': dict(collections.Counter(b['highway'] for b in bridges)),
          'bridgesWithBuildingHits': sum(1 for b in bridges if b['buildingHits']),
          'bridgesWithDeckBuildingHits': sum(1 for b in bridges if b['deckBuildingHits']),
          'deckHitBuildingsByOrigin': dict(collections.Counter(h['origin'] for b in bridges for h in b['deckHits'])),
          'bridgeSummaryByName': summary, 'bridges': bridges, 'roundaboutsNearBridges': rb[:12]}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
print(json.dumps({k: result[k] for k in ['highwayWays', 'renderedHighwayWays', 'sceneRoads', 'sceneRoadKeys', 'bridgeWays',
                                         'bridgeTypes', 'bridgesWithBuildingHits', 'bridgesWithDeckBuildingHits',
                                         'deckHitBuildingsByOrigin']}, ensure_ascii=False))
print('tag', json.dumps({k: v['ways'] for k, v in tag_counts.items()}))
for r in summary[:40]:
    print(r)
print('--- top building hits')
for b in bridges[:30]:
    print(b['wayId'], b['name'], b['highway'], 'layer', b['layer'], 'len', b['lengthM'], 'inside', b['buildingInsideM'],
          'hits', b['buildingHits'], '>13m', b['hitsTallerThan13m'], 'cov', b['covered'], 'fw', b['footway'], 'mid', b['mid'])
print('--- deck hits (bề rộng mặt cầu)')
for b in sorted(bridges, key=lambda b: -b['deckBuildingHits'])[:25]:
    if b['deckBuildingHits']:
        print(b['wayId'], b['name'], b['highway'], 'layer', b['layer'], 'half', b['deckHalfWidthM'], 'mid', b['mid'],
              [(h['buildingId'], h['heightM'], h['origin']) for h in b['deckHits'][:6]])
print('--- roundabouts')
for r in rb[:8]:
    print(r)
