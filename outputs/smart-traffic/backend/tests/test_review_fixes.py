import base64
import io

from tests.test_station import officer_headers, station_headers, violation_body

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')


def commander_headers(client):
    login = client.post('/api/v1/auth/login', json={'username': 'commander1', 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {login['access_token']}"}


def make_violation(client, h, **over):
    return client.post('/api/v1/station/violations', headers=h, json=violation_body(**over)).json()['id']


# ---------- Item 1: vòng đời M1 ----------

def test_dismissed_is_final_and_confirmed_only_goes_notified(client):
    # M6a: dismissed vẫn là trạng thái cuối; confirmed KHÔNG còn cuối — chỉ đi tiếp sang notified.
    h, oh = station_headers(client), officer_headers(client)
    v1 = make_violation(client, h, vehicle_id='V-F001', cycle_id=101)
    assert client.post(f'/api/v1/officer/violations/{v1}/dismiss', headers=oh, json={'note': 'x'}).status_code == 200
    for act in ('confirm', 'dismiss', 'needs-review', 'notify'):
        assert client.post(f'/api/v1/officer/violations/{v1}/{act}', headers=oh, json={'note': 'x'}).status_code == 409, act
    v2 = make_violation(client, h, vehicle_id='V-F002', cycle_id=102)
    assert client.post(f'/api/v1/officer/violations/{v2}/confirm', headers=oh, json={'note': 'x'}).status_code == 200
    assert client.post(f'/api/v1/officer/violations/{v2}/needs-review', headers=oh, json={'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{v2}/dismiss', headers=oh, json={'note': 'x'}).status_code == 409
    # Không có tài khoản gắn biển 51K-123.45 → không thông báo được (409), trạng thái vẫn confirmed.
    assert client.post(f'/api/v1/officer/violations/{v2}/notify', headers=oh, json={'note': 'x'}).status_code == 409


def test_new_to_needs_review_and_needs_review_confirm(client):
    h, oh = station_headers(client), officer_headers(client)
    v = make_violation(client, h, vehicle_id='V-F003', cycle_id=103)
    r = client.post(f'/api/v1/officer/violations/{v}/needs-review', headers=oh, json={'note': 'thiếu ảnh'})
    assert r.status_code == 200 and r.json()['status'] == 'needs_review'
    assert client.post(f'/api/v1/officer/violations/{v}/confirm', headers=oh, json={'note': 'ok'}).status_code == 200


# ---------- Item 3: evidence trùng kind ----------

def test_evidence_duplicate_kind_409_then_new_post_ok(client):
    h = station_headers(client)
    vid = make_violation(client, h, vehicle_id='V-E001', cycle_id=201)
    f = lambda: {'file': ('f.png', io.BytesIO(PNG), 'image/png')}
    assert client.post(f'/api/v1/station/violations/{vid}/evidence', headers=h, files=f(), data={'kind': 'before'}).status_code == 200
    dup = client.post(f'/api/v1/station/violations/{vid}/evidence', headers=h, files=f(), data={'kind': 'before'})
    assert dup.status_code == 409, dup.text
    # Không còn khóa ghi: POST vi phạm mới vẫn phải 200.
    assert client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id='V-E002', cycle_id=202)).status_code == 200
    bad_kind = client.post(f'/api/v1/station/violations/{vid}/evidence', headers=h, files=f(), data={'kind': 'nope'})
    assert bad_kind.status_code == 422


def test_evidence_upload_413(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, 'UPLOAD_MAX_BYTES', 10)
    h = station_headers(client)
    vid = make_violation(client, h, vehicle_id='V-E003', cycle_id=203)
    r = client.post(f'/api/v1/station/violations/{vid}/evidence', headers=h,
                    files={'file': ('f.png', io.BytesIO(PNG), 'image/png')}, data={'kind': 'after'})
    assert r.status_code == 413


# ---------- Item 4: upload sniff / tên file / base64 ----------

def test_upload_sniff_rejects_fake_mime(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/media', headers=h,
                    files={'file': ('CAM-HX-001.jpg', io.BytesIO(b'<html>not an image</html>'), 'image/jpeg')})
    assert r.status_code == 422, r.text


def test_upload_media_names_file_by_media_id_and_sniffed_mime(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/media', headers=h,
                    files={'file': ('CAM-HX-001.jpg', io.BytesIO(PNG), 'image/jpeg')})
    assert r.status_code == 200, r.text
    mid = r.json()['media_id']
    from app.db import get_conn
    conn = get_conn()
    row = conn.execute('SELECT path, mime FROM media_assets WHERE id=?', (mid,)).fetchone()
    conn.close()
    assert row['mime'] == 'image/png'          # theo sniff, không theo content-type client
    assert row['path'].endswith(f'{mid}.png')  # tên theo media_id, không theo tên client


def test_frames_bad_base64_422(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/frames', headers=h, json={'camera_id': 'CAM-HX-001', 'jpeg_base64': '!!!not-base64!!!'})
    assert r.status_code == 422, r.text


def test_frames_oversize_413(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, 'UPLOAD_MAX_BYTES', 4)
    h = station_headers(client)
    big = base64.b64encode(b'x' * 100).decode()
    r = client.post('/api/v1/station/frames', headers=h, json={'camera_id': 'CAM-HX-001', 'jpeg_base64': big})
    assert r.status_code == 413


# ---------- Item 5: validate ----------

def test_violation_validation_422(client):
    h = station_headers(client)
    for over in ({'plate': None}, {'vehicle_id': None}, {'cycle_id': None, 'signal': {}}, {'confidence': 'abc'}, {'confidence': None}, {'confidence': 1.5}):
        r = client.post('/api/v1/station/violations', headers=h, json=violation_body(**over))
        assert r.status_code == 422, (over, r.status_code, r.text)
    assert client.post('/api/v1/station/violations', headers=h, json={}).status_code == 422


def test_signal_override_validation_422(client):
    ch = commander_headers(client)
    cases = [
        {'node_id': 'HX-01', 'group': 0, 'duration_s': 'abc'},
        {'node_id': 'HX-01', 'group': 0, 'duration_s': -5},
        {'node_id': 'HX-01', 'group': 0, 'duration_s': 700},
        {'node_id': 'HX-01', 'group': 7, 'duration_s': 60},
        {'node_id': 'NOPE-99', 'group': 0, 'duration_s': 60},
    ]
    for body in cases:
        r = client.post('/api/v1/officer/controls/signal-override', headers=ch, json=body)
        assert r.status_code == 422, (body, r.status_code, r.text)
    ok = client.post('/api/v1/officer/controls/signal-override', headers=ch, json={'node_id': 'HX-01', 'group': 1, 'duration_s': 60})
    assert ok.status_code == 200


def test_page_size_bounds(client):
    oh = officer_headers(client)
    assert client.get('/api/v1/officer/violations?page_size=-1', headers=oh).status_code == 422
    assert client.get('/api/v1/officer/violations?page_size=1000000', headers=oh).status_code == 422
    assert client.get('/api/v1/officer/violations?page_size=2', headers=oh).status_code == 200


# ---------- Item 2: audit + signal_state_log ----------

def test_audit_log_written_for_review_and_signals(client):
    h, oh, ch = station_headers(client), officer_headers(client), commander_headers(client)
    vid = make_violation(client, h, vehicle_id='V-A001', cycle_id=301)
    client.post(f'/api/v1/officer/violations/{vid}/needs-review', headers=oh, json={'note': 'a'})
    client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=oh, json={'note': 'b'})
    client.post('/api/v1/officer/controls/signal-mode', headers=ch, json={'mode': 'smart'})
    client.post('/api/v1/officer/controls/signal-override', headers=ch, json={'node_id': 'HX-01', 'group': 1, 'duration_s': 60, 'reason': 'ưu tiên'})
    # officer không đọc được audit, commander thì được.
    assert client.get('/api/v1/officer/audit', headers=oh).status_code == 403
    r = client.get('/api/v1/officer/audit', headers=ch)
    assert r.status_code == 200
    items = r.json()['items']
    actions = {i['action'] for i in items}
    assert {'review', 'signal-mode', 'signal-override'} <= actions
    reviews = [i for i in items if i['action'] == 'review']
    assert {i['to_state'] for i in reviews} == {'needs_review', 'confirmed'}   # giữ MỌI lần duyệt


def test_signal_state_log_written_from_station(client):
    h = station_headers(client)
    r = client.post('/api/v1/station/metrics', headers=h, json={
        'station_id': 'STATION-3D-01', 't': '2026-10-14T09:30:05Z', 'signal_mode': 'smart',
        'kpi': {'wait_avg_s': 1, 'queue_max': 1, 'flow_per_min': 1},
        'signal_states': [{'node_id': 'HX-01', 'cluster_id': 'HX-C1', 't_sim': 12.0, 'phase': 'red', 'group': 1, 'mode': 'smart'}]})
    assert r.status_code == 200
    from app.db import get_conn
    conn = get_conn()
    n = conn.execute('SELECT COUNT(*) AS n FROM signal_state_log WHERE node_id=?', ('HX-01',)).fetchone()['n']
    conn.close()
    assert n >= 1


# ---------- Item 7: rate-limit trạm / login ----------

def test_station_rate_limit_429(client):
    # STATION-a: hạn mức trạm tách theo nhóm; nhóm vi phạm (heartbeat thuộc đây) = 300/phút.
    h = station_headers(client)
    last = None
    for _ in range(301):
        last = client.post('/api/v1/station/heartbeat', headers=h, json={'station_id': 'STATION-3D-01'})
    assert last.status_code == 429, last.text
    assert last.headers.get('retry-after') is not None


def test_login_lock_persists(client):
    for _ in range(5):
        assert client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'sai'}).status_code == 401
    assert client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'sai'}).status_code == 429
    assert client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).status_code == 429


def test_login_error_shape_is_error_key(client):
    r = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'sai'})
    assert r.status_code == 401
    body = r.json()
    assert 'error' in body and body['error']['code'] == 'UNAUTHORIZED'


# ---------- Item 9: CORS, RBAC ----------

def test_cors_foreign_origin_no_acao(client):
    allowed = client.options('/api/v1/auth/login', headers={
        'Origin': 'http://127.0.0.1:8821', 'Access-Control-Request-Method': 'POST'})
    assert allowed.headers.get('access-control-allow-origin') == 'http://127.0.0.1:8821'
    foreign = client.options('/api/v1/auth/login', headers={
        'Origin': 'http://evil.example', 'Access-Control-Request-Method': 'POST'})
    assert 'access-control-allow-origin' not in foreign.headers


def test_station_cannot_call_officer_403(client):
    h = station_headers(client)
    r = client.post('/api/v1/officer/violations/VP-x/confirm', headers=h, json={'note': 'x'})
    assert r.status_code == 403
