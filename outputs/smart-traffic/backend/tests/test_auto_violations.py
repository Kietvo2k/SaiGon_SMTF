"""Chế độ tự động xử lý vi phạm: xác nhận/báo về ngay, 1% tự sinh khiếu nại."""
from app import config
from app.db import connect
from app.lifecycle import auto_complaint_sample, auto_process_pending


def station_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def officer_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def citizen_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'citizen1', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def violation_body(**over):
    body = {
        'violation_code': 'RED-LIGHT', 'plate': '51K-888.88', 'plate_format': 'car', 'vehicle_class': 'car',
        'vehicle_color': 'đỏ', 'vehicle_id': 'V-AUTO-001', 'owner_name': 'Nguyễn Văn A', 'owner_phone': '0901234567',
        'is_scenario_plate': True, 'node_id': 'HX-01', 'node_osm_id': 366390689, 'node_label': 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ',
        'camera_id': 'CAM-HX-001', 'road_index': 1287, 'lane_index': 4, 'cycle_id': 1201,
        'signal': {'mode': 'smart', 'cluster_id': 'HX-C1', 'cycle_id': 1201, 'phase_for_vehicle': 'red', 'group': 1,
                   'elapsed_in_phase_s': 2.4, 'cycle_s': 48.0, 'speed_kmh': 38.5, 'speed_limit_kmh': 50},
        'confidence': 0.9, 'ocr_confidence': 0.91,
        'detection': {'in_fov_s': 3.2, 'distance_m': 41.0, 'grace_s': 0.8, 'crossed_stop_line_at_s': 102.4},
        'evidence': [],
        'penalty': {'vnd_min': 18000000, 'vnd_max': 20000000, 'license_deduction_points': 4,
                    'source': 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', 'verified': True},
        'sim': {'t_sim': 102.4, 'seed': 31031, 'scenario': 'peak-hang-xanh', 'station_id': 'STATION-3D-01',
                'station_time': '2026-10-14T09:29:58.2Z'},
    }
    body.update(over)
    return body


def test_auto_mode_confirms_and_notifies_without_manual_click(client, monkeypatch):
    monkeypatch.setattr(config, 'AUTO_VIOLATIONS', True)
    monkeypatch.setattr(config, 'AUTO_COMPLAINT_PCT', 0)
    r = client.post('/api/v1/station/violations', headers=station_headers(client), json=violation_body())
    assert r.status_code == 200, r.text
    vid = r.json()['id']
    assert r.json()['status'] == 'notified'

    oh = officer_headers(client)
    items = client.get('/api/v1/officer/violations?status=notified', headers=oh).json()['items']
    row = next(i for i in items if i['id'] == vid)
    assert row['auto'] is True
    # Biển đã gắn citizen1 → có thông báo cho công dân, không cần bấm "Gửi thông báo".
    ch = citizen_headers(client)
    assert client.get('/api/v1/citizen/violations?status=notified', headers=ch).json()['total'] >= 1


def test_forced_auto_complaint_creates_open_complaint(client, monkeypatch):
    monkeypatch.setattr(config, 'AUTO_VIOLATIONS', True)
    monkeypatch.setattr(config, 'AUTO_COMPLAINT_PCT', 100)
    body = violation_body(vehicle_id='V-AUTO-002', cycle_id=1202)
    r = client.post('/api/v1/station/violations', headers=station_headers(client), json=body)
    assert r.status_code == 200, r.text
    vid = r.json()['id']
    assert r.json()['status'] == 'disputed'

    oh = officer_headers(client)
    complaints = client.get('/api/v1/officer/complaints?status=open', headers=oh).json()['items']
    hit = next(c for c in complaints if c['violation_id'] == vid)
    assert hit['kind'] == 'auto_1pct'
    assert hit['status'] == 'open'

    detail = client.get(f'/api/v1/officer/violations/{vid}', headers=oh).json()
    assert detail['status'] == 'disputed'
    assert any(c['kind'] == 'auto_1pct' for c in detail['complaints'])


def test_auto_complaint_sample_is_deterministic_and_about_one_percent():
    row = {'vehicle_id': 'V-RATE', 'cycle_id': 7, 'violation_code': 'RED-LIGHT'}
    hits = sum(auto_complaint_sample(f'VP-20261022-{i:06d}', row, 1.0) for i in range(10000))
    assert 70 <= hits <= 130, f'tỷ lệ 1% thực tế {hits}/10000'
    assert auto_complaint_sample('VP-X', row, 0) is False
    assert auto_complaint_sample('VP-X', row, 100) is True


def test_backfill_moves_old_pending_violations_to_auto_state(client, monkeypatch):
    monkeypatch.setattr(config, 'AUTO_VIOLATIONS', False)
    body = violation_body(vehicle_id='V-AUTO-003', cycle_id=1203)
    r = client.post('/api/v1/station/violations', headers=station_headers(client), json=body)
    vid = r.json()['id']
    assert r.json()['status'] == 'new'

    monkeypatch.setattr(config, 'AUTO_VIOLATIONS', True)
    monkeypatch.setattr(config, 'AUTO_COMPLAINT_PCT', 0)
    with connect() as conn:
        out = auto_process_pending(conn, complaint_pct=0)
    assert out['processed'] >= 1

    oh = officer_headers(client)
    row = client.get(f'/api/v1/officer/violations/{vid}', headers=oh).json()
    assert row['status'] == 'notified'
