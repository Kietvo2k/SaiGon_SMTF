# Sinh lại pose 10 camera giao lộ khu Bắc cho GÓC TOÀN CẢNH.
# Quy ước yaw thực tế (camera-capture-32.js): yaw 0° = trục +x, 90° = trục +z; pitch âm = cúi.
# Cao 14 m, pitch -30°, FOV 75° để thấy trọn giao lộ, không chỉ mặt đường.
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
seed = ROOT / 'outputs/smart-traffic/backend/app/seed'
nodes = {n['node_id']: n for n in json.loads((seed / 'node_map.json').read_text(encoding='utf-8'))}

# (camera_id, node_id, offset x, offset z, nhãn hướng) — khoảng cách ~30–36 m để thấy trọn nút giao mà xe vẫn đủ lớn trong khung.
PLAN = [
    ('CAM-HX-001', 'HX-01',  28, -21, 'hướng Điện Biên Phủ'),
    ('CAM-HX-002', 'HX-06',  -7,  24, 'hướng Xô Viết Nghệ Tĩnh'),
    ('CAM-HX-003', 'HX-01', -29,  21, 'hướng về cầu Thủ Thiêm'),
    ('CAM-HX-004', 'HX-06', -21, -19, 'hướng ra phía Nam đường Hàng Xanh'),
    ('CAM-HX-005', 'HX-02',  25, -16, 'hướng về ngã ba Nguyễn Gia Trí'),
    ('CAM-HX-006', 'HX-02', -24,  18, 'hướng về phía cầu Sài Gòn'),
    ('CAM-HX-007', 'HX-03',  21, -19, 'hướng về Bạch Đằng phía Bắc'),
    ('CAM-HX-008', 'HX-03', -20,  19, 'hướng về Đinh Bộ Lĩnh'),
    ('CAM-HX-009', 'HX-04',  19, -17, 'hướng về Xô Viết Nghệ Tĩnh'),
    ('CAM-HX-010', 'HX-05', -19, -16, 'hướng về Điện Biên Phủ phía Nam'),
]

HEIGHT, PITCH, FOV, RNG = 11, -26, 68, 80
cams = []
for cid, nid, dx, dz, extra in PLAN:
    n = nodes[nid]
    px, pz = round(n['x'] + dx, 1), round(n['z'] + dz, 1)
    # yaw để nhìn từ (px,pz) về tâm nút: hướng nhìn = (cos yaw, sin yaw).
    yaw = round(math.degrees(math.atan2(n['z'] - pz, n['x'] - px)) % 360, 1)
    cams.append({
        'camera_id': cid, 'node_id': nid, 'x': px, 'z': pz,
        'height_m': HEIGHT, 'yaw_deg': yaw, 'pitch_deg': PITCH,
        'fov_deg': FOV, 'range_m': RNG,
        'label': f"{n['label']} · {extra}",
    })

(seed / 'cameras.json').write_text(json.dumps(cams, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(cams)} camera')
