import base64
import io


def station_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def officer_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def violation_body(**over):
    body = {
        'violation_code': 'RED-LIGHT', 'plate': '51K-123.45', 'plate_format': 'car', 'vehicle_class': 'car',
        'vehicle_color': 'trắng', 'vehicle_id': 'V-004231', 'owner_name': 'Nguyễn Văn A', 'owner_phone': '0901234567',
        'is_scenario_plate': False, 'node_id': 'HX-01', 'node_osm_id': 366390689, 'node_label': 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ',
        'camera_id': 'CAM-HX-001', 'road_index': 1287, 'lane_index': 4, 'cycle_id': 12,
        'signal': {'mode': 'smart', 'cluster_id': 'HX-C1', 'cycle_id': 12, 'phase_for_vehicle': 'red', 'group': 1,
                   'elapsed_in_phase_s': 2.4, 'cycle_s': 48.0, 'speed_kmh': 38.5, 'speed_limit_kmh': 50},
        'confidence': 0.9, 'ocr_confidence': 0.91,
        'detection': {'in_fov_s': 3.2, 'distance_m': 41.0, 'grace_s': 0.8, 'crossed_stop_line_at_s': 102.4},
        'evidence': [],
        'penalty': {'vnd_min': 18000000, 'vnd_max': 20000000, 'license_deduction_points': 4,
                    'source': 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', 'verified': True},
        'sim': {'t_sim': 102.4, 'seed': 31031, 'scenario': 'peak-hang-xanh', 'station_id': 'STATION-3D-01', 'station_time': '2026-10-14T09:29:58.2Z'},
    }
    body.update(over)
    return body


def test_create_violation_and_dedup(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/violations', headers=h, json=violation_body())
    assert r.status_code == 200, r.text
    vid = r.json()['id']
    assert vid.startswith('VP-')
    assert r.json()['status'] == 'new'
    again = client.post('/api/v1/station/violations', headers=h, json=violation_body())
    assert again.status_code == 409


def test_low_confidence_goes_needs_review(client):
    h = station_headers(client)
    body = violation_body(confidence=0.5, vehicle_id='V-000002', cycle_id=3)
    r = client.post('/api/v1/station/violations', headers=h, json=body)
    assert r.json()['status'] == 'needs_review'


def test_evidence_upload_and_media_name_validation(client):
    h = station_headers(client)
    vid = client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id='V-000003', cycle_id=4)).json()['id']
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    r = client.post(f'/api/v1/station/violations/{vid}/evidence', headers=h,
                    files={'file': ('frame.png', io.BytesIO(png), 'image/png')}, data={'kind': 'before'})
    assert r.status_code == 200, r.text
    assert r.json()['media_id'].startswith('MD-')
    bad = client.post('/api/v1/station/media', headers=h,
                      files={'file': ('../../evil.jpg', io.BytesIO(png), 'image/jpeg')})
    assert bad.status_code == 422
    good = client.post('/api/v1/station/media', headers=h,
                       files={'file': ('CAM-HX-001.jpg', io.BytesIO(png), 'image/jpeg')})
    assert good.status_code == 200
    assert good.json()['camera_id'] == 'CAM-HX-001'


def test_heartbeat_and_metrics(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/heartbeat', headers=h, json={
        'station_id': 'STATION-3D-01', 'app_version': '32a', 't': '2026-10-14T09:30:00Z',
        'uptime_s': 1200, 'fps': 58.2, 'webgpu': True})
    assert r.status_code == 200
    assert 'server_time' in r.json() and 'commands' in r.json()
    m = client.post('/api/v1/station/metrics', headers=h, json={
        'station_id': 'STATION-3D-01', 't': '2026-10-14T09:30:05Z', 'fps': 58.0, 'draw_calls': 220,
        'traffic': {'active': 800, 'waiting_now': 40, 'edge_transitions': 1200},
        'kpi': {'wait_avg_s': 12.5, 'queue_max': 18, 'flow_per_min': 96.0}, 'signal_mode': 'smart'})
    assert m.status_code == 200
