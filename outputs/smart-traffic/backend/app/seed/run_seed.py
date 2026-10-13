# Nạp seed dev vào SQLite: tài khoản, biển số (seed_plates), node_map, cameras.
import json
import sys
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SEED_DIR.parent.parent))   # outputs/smart-traffic/backend


def run_seed():
    from app.db import get_conn
    from app.auth import hash_password
    from app.seed.seed_plates import generate_all
    conn = get_conn()
    # Thứ tự ghi TÔN TRỌNG khoá ngoại (PRAGMA foreign_keys=ON): bảng được tham chiếu trước.
    accounts = json.loads((SEED_DIR / 'accounts.json').read_text(encoding='utf-8'))
    for a in accounts:
        conn.execute(
            'INSERT OR IGNORE INTO users (username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,datetime("now"))',
            (a['username'], hash_password(a['password']), a['role'], a['display_name']))
    # 1) plates_seed (được vehicle_ownerships tham chiếu).
    owners = json.loads((SEED_DIR / 'owners.json').read_text(encoding='utf-8'))
    rows = generate_all(3600, (0, 1, 2), owners)
    conn.executemany(
        'INSERT OR IGNORE INTO plates_seed (slot, gen, vehicle_class, plate, color, owner_name, owner_phone, is_scenario) VALUES (:slot,:gen,:vehicle_class,:plate,:color,:owner_name,:owner_phone,:is_scenario)',
        [{**r, 'is_scenario': int(r['is_scenario'])} for r in rows])
    # 2) signal_nodes: ghi camera_id = NULL trước (quan hệ vòng cameras.node_id ↔ signal_nodes.camera_id;
    #    FK biên ngay nên phải chèn signal_nodes trước cameras, rồi UPDATE camera_id sau).
    node_map = json.loads((SEED_DIR / 'node_map.json').read_text(encoding='utf-8'))
    cameras = json.loads((SEED_DIR / 'cameras.json').read_text(encoding='utf-8'))
    conn.executemany(
        'INSERT OR IGNORE INTO signal_nodes (node_id, osm_id, label, cluster_id, x, z, camera_id, has_vms, prefix) VALUES (:node_id,:osm_id,:label,:cluster_id,:x,:z,NULL,:has_vms,:prefix)',
        [{**n, 'has_vms': int(n['has_vms'])} for n in node_map])
    # 3) cameras (node_id đã có trong signal_nodes).
    conn.executemany(
        'INSERT OR IGNORE INTO cameras (camera_id, node_id, x, z, height_m, yaw_deg, pitch_deg, fov_deg, range_m, label) VALUES (:camera_id,:node_id,:x,:z,:height_m,:yaw_deg,:pitch_deg,:fov_deg,:range_m,:label)',
        cameras)
    for n in node_map:
        if n.get('camera_id'):
            conn.execute('UPDATE signal_nodes SET camera_id=? WHERE node_id=?', (n['camera_id'], n['node_id']))
    # 4) vehicle_ownerships SAU khi có plates_seed.
    for a in accounts:
        if a.get('plates'):
            row = conn.execute('SELECT id FROM users WHERE username=?', (a['username'],)).fetchone()
            for plate in a['plates']:
                conn.execute('INSERT OR IGNORE INTO vehicle_ownerships (user_id, plate, created_at) VALUES (?,?,datetime("now"))', (row['id'], plate))
    conn.commit()
    conn.close()


if __name__ == '__main__':
    run_seed()
    print(json.dumps({'ok': True}))
