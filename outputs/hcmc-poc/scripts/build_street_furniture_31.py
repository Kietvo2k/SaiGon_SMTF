"""Batch 31A · Bước E2 — dữ liệu vạch qua đường và footway trùng lòng đường, suy ra từ data/osm-raw.json.

Chạy:   python scripts/build_street_furniture_31.py   (shapely theo requirements.txt; không gọi mạng)
Kiểm:   node scripts/qa-street-furniture-31.cjs        (kiểm hash nguồn + hình học trong trình duyệt)
Ra:     data/street-furniture-31.json và data/street-furniture-31.js (`window.STREET_FURNITURE_31=`).

File riêng (không sửa road-graph-31) để không đụng builder bước A. Chỉ số `road` song song D.roads (scene.js).
  crossings[]       mọi way highway=footway + footway=crossing có trong D.roads: road, way, crossing, markings,
                    zebra (false khi crossing=unmarked hoặc crossing:markings=no), reason.
  hiddenFootways[]  footway không vẽ ribbon be nữa: mọi crossing (thay bằng zebra trên asphalt) và footway mặt đất
                    có ≥ OVERLAP_HIDE diện tích ribbon nằm trong mặt asphalt suy luận (vẽ trùng lòng đường).
Mặt asphalt dựng lại đúng quy tắc city-road-network-31.js: mọi loại trừ pedestrian/footway, bề rộng
roadWidth31 (lanes·3,1 hoặc bảng widths), bỏ hầm; chỉ so footway mặt đất với asphalt mặt đất (bridge=False).
Không có ngẫu nhiên; SEED ghi để thống nhất với các builder 31A khác.
"""
import collections, hashlib, json, pathlib, sys

sys.dont_write_bytecode = True
from shapely.geometry import LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / 'data' / 'street-furniture-31.json'
OUT_JS = ROOT / 'data' / 'street-furniture-31.js'
INPUTS = ['data/osm-raw.json', 'data/scene.js']
VERSION = '31A'
SEED = 31
OVERLAP_HIDE = 0.3          # tỉ lệ diện tích ribbon footway nằm trong asphalt để coi là "vẽ trùng lòng đường"
PEDESTRIAN_TYPES = {'pedestrian', 'footway'}
WIDTHS = {'motorway': 16, 'trunk': 15, 'primary': 14, 'secondary': 11, 'tertiary': 8, 'residential': 5,
          'living_street': 4, 'service': 3.5, 'unclassified': 5, 'footway': 2.5, 'pedestrian': 12,
          'cycleway': 2, 'path': 1.5}   # webgpu-materials-24.js


def road_width(road):
    base = WIDTHS.get(road['type'], 4)
    return max(base, road['lanes'] * 3.1) if road.get('lanes') else base


def ribbon(road):
    line = LineString(road['c'])
    return line.buffer(road_width(road) / 2, cap_style=2, join_style=2, mitre_limit=2) if line.length > 0.05 else None


def sha256(rel):
    return hashlib.sha256((ROOT / rel).read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def main():
    osm = json.loads((ROOT / 'data/osm-raw.json').read_text(encoding='utf-8'))
    tags = {e['id']: e.get('tags', {}) for e in osm['elements'] if e['type'] == 'way'}
    text = (ROOT / 'data/scene.js').read_text(encoding='utf-8')
    roads = json.loads(text[text.index('=') + 1:].strip().rstrip(';'))['roads']

    asphalt = [(i, ribbon(r)) for i, r in enumerate(roads)
               if r['type'] not in PEDESTRIAN_TYPES and not r.get('tunnel') and not r.get('bridge')]
    asphalt = [(i, g) for i, g in asphalt if g is not None and not g.is_empty]
    tree = STRtree([g for _, g in asphalt])

    crossings, hidden = [], []
    for index, road in enumerate(roads):
        if road['type'] != 'footway':
            continue
        t = tags.get(road['id'], {})
        footway = t.get('footway')
        if footway == 'crossing':
            crossing, markings = t.get('crossing'), t.get('crossing:markings')
            zebra = crossing != 'unmarked' and markings != 'no'
            crossings.append({'road': index, 'way': road['id'], 'crossing': crossing, 'markings': markings, 'zebra': zebra,
                              'reason': 'footway=crossing có vạch (mặc định có vạch khi không ghi tag)' if zebra
                              else 'crossing=unmarked hoặc crossing:markings=no: không vẽ zebra'})
            hidden.append({'road': index, 'way': road['id'], 'footway': 'crossing', 'overlap': None,
                           'reason': 'crossing: thay ribbon be bằng zebra trên asphalt'})
            continue
        if road.get('bridge') or road.get('tunnel'):
            continue
        geom = ribbon(road)
        if geom is None or geom.area <= 0:
            continue
        near = [tree.geometries[k] for k in tree.query(geom)]
        if not near:
            continue
        share = geom.intersection(unary_union(near)).area / geom.area
        if share >= OVERLAP_HIDE:
            hidden.append({'road': index, 'way': road['id'], 'footway': footway, 'overlap': round(share, 3),
                           'reason': f'ribbon footway nằm {share:.0%} trong mặt asphalt (vẽ trùng lòng đường)'})

    data = {
        'schema': 'street-furniture-31', 'version': VERSION, 'seed': SEED,
        'attribution': '© OpenStreetMap contributors, ODbL 1.0. Mặt asphalt dùng để so trùng là suy luận từ tim đường và bề rộng theo loại/làn, không khảo sát.',
        'generated': {
            'script': 'scripts/build_street_furniture_31.py',
            'hash': 'sha256 nội dung đã chuẩn hóa CRLF→LF',
            'inputs': [{'path': rel, 'sha256': sha256(rel)} for rel in INPUTS],
        },
        'params': {'overlapHide': OVERLAP_HIDE, 'widths': WIDTHS, 'asphaltRule': 'mọi loại trừ pedestrian/footway, bỏ hầm và cầu'},
        'policy': 'Chỉ số road song song CITY_DATA.roads; runtime phải kiểm D.roads[road].id === way trước khi dùng.',
        'crossings': crossings,
        'hiddenFootways': hidden,
        'stats': {
            'crossings': len(crossings), 'zebraCrossings': sum(c['zebra'] for c in crossings),
            'crossingTags': dict(collections.Counter(str(c['crossing']) for c in crossings).most_common()),
            'hiddenFootways': len(hidden),
            'hiddenByFootwayTag': dict(collections.Counter(str(h['footway']) for h in hidden).most_common()),
        },
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    OUT_JS.write_text('window.STREET_FURNITURE_31=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8', newline='\n')
    print(json.dumps(data['stats'], ensure_ascii=False))


if __name__ == '__main__':
    main()
