# Sinh 10 camera giao lộ trong khu Bắc từ node_map.json (1-2 camera mỗi nút, hướng về tâm nút).
# Chạy 1 lần, không commit file này.
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
seed = ROOT / 'outputs/smart-traffic/backend/app/seed'
nodes = {n['node_id']: n for n in json.loads((seed / 'node_map.json').read_text(encoding='utf-8'))}
cams = json.loads((seed / 'cameras.json').read_text(encoding='utf-8'))

KEEP = {'CAM-HX-001', 'CAM-HX-002'}
base = [c for c in cams if c['camera_id'] in KEEP]

def face_node(node, px, pz):
    """yaw (độ) để nhìn từ (px,pz) về tâm nút: 0 = bắc (-z), 90 = đông (+x)."""
    dx = node['x'] - px
    dz = node['z'] - pz
    return round(math.degrees(math.atan2(dx, -dz)) % 360, 1)

# (camera_id, node_id, offset x, offset z, nhãn hướng nhìn)
PLAN = [
    ('CAM-HX-003', 'HX-01', -46, 34, 'hướng về cầu Thủ Thiêm'),
    ('CAM-HX-004', 'HX-06', 34, 30, 'hướng ra phía Nam đường Hàng Xanh'),
    ('CAM-HX-005', 'HX-02', 40, -26, 'hướng về ngã ba Nguyễn Gia Trí'),
    ('CAM-HX-006', 'HX-02', -38, 28, 'hướng về phía cầu Sài Gòn'),
    ('CAM-HX-007', 'HX-03', 34, -30, 'hướng về Bạch Đằng phía Bắc'),
    ('CAM-HX-008', 'HX-03', -32, 30, 'hướng về Đinh Bộ Lĩnh'),
    ('CAM-HX-009', 'HX-04', 30, -28, 'hướng về Xô Viết Nghệ Tĩnh'),
    ('CAM-HX-010', 'HX-05', -30, -26, 'hướng về Điện Biên Phủ phía Nam'),
]

for cid, nid, dx, dz, extra in PLAN:
    n = nodes[nid]
    px, pz = round(n['x'] + dx, 1), round(n['z'] + dz, 1)
    base.append({
        'camera_id': cid, 'node_id': nid, 'x': px, 'z': pz,
        'height_m': 7, 'yaw_deg': face_node(n, px, pz), 'pitch_deg': -20,
        'fov_deg': 60, 'range_m': 60,
        'label': f"{n['label']} · {extra}",
    })

order = {'CAM-HX-001': 1, 'CAM-HX-002': 2}
base.sort(key=lambda c: (c['camera_id'] in KEEP, order.get(c['camera_id'], 99), c['camera_id']))
(seed / 'cameras.json').write_text(json.dumps(base, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(base)} camera')
for c in base:
    print(c['camera_id'], c['node_id'], c['x'], c['z'], c['yaw_deg'], c['label'])