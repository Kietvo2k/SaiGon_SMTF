"""M6a — quản trị tài khoản cán bộ (không tự nâng quyền), thống kê, lọc theo khoảng thời gian."""
from datetime import datetime, timedelta, timezone

from tests.m6_helpers import NEW_PW, db, hdr, new_violation, confirm

LOCAL = timezone(timedelta(hours=7))


def _staff(username, role='officer'):
    return {'username': username, 'password': NEW_PW, 'display_name': 'Cán bộ thử nghiệm', 'role': role}


def _user_id(username):
    conn = db()
    try:
        return conn.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()['id']
    finally:
        conn.close()


def test_admin_creates_officer_then_lock_revokes_token_at_once(client):
    ah = hdr(client, 'admin1')
    r = client.post('/api/v1/admin/users', headers=ah, json=_staff('officer2'))
    assert r.status_code == 200, r.text
    uid = r.json()['id']
    assert 'password' not in r.text and 'password_hash' not in r.text
    oh = {'Authorization': 'Bearer ' + client.post('/api/v1/auth/login', json={'username': 'officer2', 'password': NEW_PW}).json()['access_token']}
    assert client.get('/api/v1/officer/violations', headers=oh).status_code == 200
    assert client.post(f'/api/v1/admin/users/{uid}/active', headers=ah, json={'active': False}).status_code == 200
    assert client.get('/api/v1/auth/me', headers=oh).status_code == 401          # token còn hạn nhưng đã bị khóa
    assert client.post('/api/v1/auth/login', json={'username': 'officer2', 'password': NEW_PW}).status_code == 401
    assert client.post(f'/api/v1/admin/users/{uid}/active', headers=ah, json={'active': True}).status_code == 200
    assert client.post('/api/v1/auth/login', json={'username': 'officer2', 'password': NEW_PW}).status_code == 200


def test_only_admin_manages_accounts_and_cannot_create_privileged_roles(client):
    body = _staff('officer3')
    assert client.post('/api/v1/admin/users', headers=hdr(client, 'commander1'), json=body).status_code == 403
    assert client.post('/api/v1/admin/users', headers=hdr(client, 'officer1'), json=body).status_code == 403
    assert client.get('/api/v1/admin/users', headers=hdr(client, 'citizen1')).status_code == 403
    ah = hdr(client, 'admin1')
    for role in ('admin', 'citizen', 'station'):
        assert client.post('/api/v1/admin/users', headers=ah, json=_staff('officer4', role=role)).status_code == 422, role
    listing = client.get('/api/v1/admin/users?role=officer', headers=ah).json()
    assert listing['total'] >= 1 and all('password_hash' not in i for i in listing['items'])
    assert all(i['role'] == 'officer' for i in listing['items'])


def test_no_self_escalation_or_self_lock_and_no_touch_of_non_staff(client):
    ah = hdr(client, 'admin1')
    me = _user_id('admin1')
    assert client.put(f'/api/v1/admin/users/{me}/role', headers=ah, json={'role': 'commander'}).status_code == 403
    assert client.post(f'/api/v1/admin/users/{me}/active', headers=ah, json={'active': False}).status_code == 403
    station = _user_id('station-3d')
    assert client.put(f'/api/v1/admin/users/{station}/role', headers=ah, json={'role': 'officer'}).status_code == 403
    assert client.post(f'/api/v1/admin/users/{station}/active', headers=ah, json={'active': False}).status_code == 403
    assert client.put(f'/api/v1/admin/users/{_user_id("citizen1")}/role', headers=ah, json={'role': 'officer'}).status_code == 403
    assert client.put(f'/api/v1/admin/users/{_user_id("officer1")}/role', headers=ah, json={'role': 'admin'}).status_code == 422


def test_role_change_invalidates_old_token_and_is_audited(client):
    ah = hdr(client, 'admin1')
    old = hdr(client, 'commander1')
    uid = _user_id('commander1')
    r = client.put(f'/api/v1/admin/users/{uid}/role', headers=ah, json={'role': 'officer'})
    assert r.status_code == 200 and r.json()['role'] == 'officer'
    assert client.get('/api/v1/officer/audit', headers=old).status_code == 401          # token commander cũ bị từ chối
    fresh = client.post('/api/v1/auth/login', json={'username': 'commander1', 'password': 'SaiGon@2026'}).json()
    assert fresh['role'] == 'officer'
    assert client.get('/api/v1/officer/audit', headers={'Authorization': 'Bearer ' + fresh['access_token']}).status_code == 403
    actions = {i['action'] for i in client.get('/api/v1/officer/audit', headers=ah).json()['items']}
    assert 'staff-role' in actions


def test_stats_by_node_code_status_hour_and_range(client):
    a = new_violation(client, '51K-123.45', node_id='HX-01')
    new_violation(client, '51K-123.45', node_id='HX-02')
    confirm(client, a)
    oh = hdr(client, 'officer1')
    listing = client.get('/api/v1/officer/violations?page_size=200', headers=oh).json()['items']
    s = client.get('/api/v1/officer/stats', headers=oh)
    assert s.status_code == 200, s.text
    st = s.json()
    assert st['total'] == 2
    by_node = {r['node_id']: r['count'] for r in st['by_node']}
    assert by_node == {'HX-01': 1, 'HX-02': 1}
    assert {r['violation_code']: r['count'] for r in st['by_code']} == {'RED-LIGHT': 2}
    assert {r['status']: r['count'] for r in st['by_status']} == {'confirmed': 1, 'new': 1}
    assert [b['hour'] for b in st['by_hour']] == list(range(24)) and sum(b['count'] for b in st['by_hour']) == 2
    expected = {h: 0 for h in range(24)}
    for item in listing:
        local = datetime.fromisoformat(item['occurred_at'].replace('Z', '+00:00')).astimezone(LOCAL)
        expected[local.hour] += 1
    assert {b['hour']: b['count'] for b in st['by_hour']} == expected
    today = datetime.now(LOCAL).strftime('%Y-%m-%d')
    assert client.get(f'/api/v1/officer/stats?from={today}', headers=oh).json()['total'] == 2
    assert client.get('/api/v1/officer/stats?from=2999-01-01', headers=oh).json()['total'] == 0
    assert client.get(f'/api/v1/officer/stats?to=2000-01-01', headers=oh).json()['total'] == 0
    assert client.get('/api/v1/officer/stats?from=khong-phai-ngay', headers=oh).status_code == 422
    assert client.get(f'/api/v1/officer/violations?from=2999-01-01', headers=oh).json()['total'] == 0
    assert client.get(f'/api/v1/officer/violations?from={today}&to={today}', headers=oh).json()['total'] == 2


def test_stats_forbidden_for_citizen_and_station(client):
    assert client.get('/api/v1/officer/stats', headers=hdr(client, 'citizen1')).status_code == 403
    assert client.get('/api/v1/officer/stats', headers=hdr(client, 'station-3d')).status_code == 403
    assert client.get('/api/v1/officer/stats', headers=hdr(client, 'commander1')).status_code == 200
