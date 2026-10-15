"""M6a — tài khoản người dân, gắn biển bằng mã đăng ký, thông báo, quyền sở hữu, WS theo người nhận."""
import asyncio
from urllib.parse import quote

from tests.m6_helpers import NEW_PW, code_of, confirm, hdr, new_violation, register, seed_plates


def _register_body(username, **over):
    body = {'username': username, 'password': NEW_PW, 'full_name': 'Nguyễn Văn B', 'email': f'{username}@example.test'}
    body.update(over)
    return body


def _bind(client, headers, p, **over):
    body = {'plate': p['plate'], 'vehicle_class': p['vehicle_class'], 'registration_code': p['registration_code']}
    body.update(over)
    return client.post('/api/v1/citizen/account/plates', headers=headers, json=body)


def test_register_creates_citizen_without_mail_and_stores_bcrypt(client):
    r = client.post('/api/v1/citizen/account/register', json=_register_body('nguyenvanb', phone='0912345678'))
    assert r.status_code == 200 and r.json() == {'ok': True}
    login = client.post('/api/v1/auth/login', json={'username': 'nguyenvanb', 'password': NEW_PW})
    assert login.status_code == 200 and login.json()['role'] == 'citizen'
    me = client.get('/api/v1/auth/me', headers={'Authorization': 'Bearer ' + login.json()['access_token']}).json()
    assert me['role'] == 'citizen' and me['plates'] == []
    from tests.m6_helpers import db
    conn = db()
    try:
        row = conn.execute('SELECT password_hash FROM users WHERE username=?', ('nguyenvanb',)).fetchone()
    finally:
        conn.close()
    assert row['password_hash'].startswith('$2b$12$') and NEW_PW not in row['password_hash']


def test_register_rejects_role_escalation_and_bad_input(client):
    url = '/api/v1/citizen/account/register'
    assert client.post(url, json=_register_body('tryadmin', role='admin')).status_code == 422
    assert client.post(url, json=_register_body('tryadmin', password='ngan')).status_code == 422
    assert client.post(url, json=_register_body('tryadmin', password='x' * 73)).status_code == 422
    assert client.post(url, json=_register_body('a b')).status_code == 422
    assert client.post(url, json=_register_body('tryadmin', email='khong-phai-email')).status_code == 422
    assert client.post(url, json=_register_body('officer1')).status_code == 409   # trùng tài khoản cán bộ
    assert client.post(url, json=_register_body('tryadmin')).status_code == 200
    assert client.post(url, json=_register_body('tryadmin')).status_code == 409


def test_register_rate_limit_5_per_minute_like_login(client):
    for i in range(5):
        assert client.post('/api/v1/citizen/account/register', json=_register_body(f'user{i:03d}')).status_code == 200
    r = client.post('/api/v1/citizen/account/register', json=_register_body('user999'))
    assert r.status_code == 429, r.text


def test_bind_plate_needs_correct_code_and_vehicle_class(client):
    h = register(client, 'binhtran')
    p = seed_plates(2)
    wrong_code = '00000000' if code_of(p[0]['plate']) != '00000000' else '11111111'
    assert _bind(client, h, p[0], registration_code=wrong_code).status_code == 422
    other_class = 'motorbike' if p[0]['vehicle_class'] == 'car' else 'car'
    assert _bind(client, h, p[0], vehicle_class=other_class).status_code == 422
    assert _bind(client, h, p[1], registration_code=p[0]['registration_code']).status_code == 422
    ok = _bind(client, h, p[0])
    assert ok.status_code == 200, ok.text
    assert ok.json()['plates'] == [p[0]['plate']]
    acc = client.get('/api/v1/citizen/account', headers=h).json()
    assert acc['plates'][0]['plate'] == p[0]['plate'] and acc['plates'][0]['vehicle_class'] == p[0]['vehicle_class']
    assert acc['max_plates'] == 5
    assert 'registration_code' not in acc['plates'][0]
    me = client.get('/api/v1/auth/me', headers=h).json()
    assert me['plates'] == [p[0]['plate']]


def test_bind_max_5_no_duplicate_and_no_hijack(client):
    h = register(client, 'binhtran')
    plates = seed_plates(7)
    for p in plates[:5]:
        assert _bind(client, h, p).status_code == 200
    assert _bind(client, h, plates[5]).status_code == 409          # tối đa 5 biển
    assert _bind(client, h, plates[0]).status_code == 409          # đã gắn rồi
    other = register(client, 'binhtran2')
    assert _bind(client, other, plates[0]).status_code == 409      # đã thuộc tài khoản khác


def test_unbind_plate_then_not_found(client):
    h = register(client, 'binhtran')
    p = seed_plates(1)[0]
    assert _bind(client, h, p).status_code == 200
    r = client.delete('/api/v1/citizen/account/plates/' + quote(p['plate']), headers=h)
    assert r.status_code == 200 and r.json()['plates'] == []
    assert client.delete('/api/v1/citizen/account/plates/' + quote(p['plate']), headers=h).status_code == 404


def test_bind_failures_are_rate_limited_per_account(client):
    h = register(client, 'binhtran')
    p = seed_plates(1)[0]
    for _ in range(5):
        assert _bind(client, h, p, registration_code='99999999').status_code == 422
    assert _bind(client, h, p, registration_code='99999999').status_code == 429
    assert _bind(client, h, p).status_code == 429   # đúng mã cũng bị khóa tạm


def test_citizen_list_only_bound_plates_and_visible_statuses(client):
    ch = hdr(client, 'citizen1')
    v_new = new_violation(client, '51K-888.88')                     # chưa xác nhận → ẩn
    v_ok = new_violation(client, '51K-888.88')
    confirm(client, v_ok)                                           # auto notified → hiện
    v_other = new_violation(client, '51K-123.45')                   # biển không thuộc citizen1
    confirm(client, v_other)
    r = client.get('/api/v1/citizen/violations', headers=ch)
    assert r.status_code == 200
    body = r.json()
    assert {i['id'] for i in body['items']} == {v_ok} and body['total'] == 1
    assert body['items'][0]['status'] == 'notified'
    assert v_new not in {i['id'] for i in body['items']}
    assert client.get('/api/v1/citizen/violations?status=new', headers=ch).status_code == 422
    assert client.get('/api/v1/citizen/violations?status=notified', headers=ch).json()['total'] == 1


def test_citizen_detail_owner_only_and_no_sensitive_fields(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    d = client.get(f'/api/v1/citizen/violations/{vid}', headers=hdr(client, 'citizen1'))
    assert d.status_code == 200, d.text
    detail = d.json()
    for banned in ('owner_phone', 'owner_name', 'is_scenario_plate', 'sim', 'review', 'signal', 'detection'):
        assert banned not in detail, banned
    assert detail['penalty']['verified'] is True and detail['penalty']['vnd_min'] == 18000000
    stranger = register(client, 'nguoila01')
    assert client.get(f'/api/v1/citizen/violations/{vid}', headers=stranger).status_code == 404
    assert client.get(f'/api/v1/citizen/violations/{vid}').status_code == 401
    assert client.get('/api/v1/citizen/account', headers=hdr(client, 'officer1')).status_code == 403


def test_notifications_owner_only_list_and_mark_read(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    ch = hdr(client, 'citizen1')
    unread = client.get('/api/v1/citizen/notifications?unread=true', headers=ch).json()
    assert unread['total'] == 1 and unread['unread'] == 1
    item = unread['items'][0]
    assert item['violation_id'] == vid and item['read_at'] is None
    stranger = register(client, 'nguoilb01')
    assert client.get('/api/v1/citizen/notifications', headers=stranger).json()['total'] == 0
    assert client.post('/api/v1/citizen/notifications/read', headers=stranger, json={'ids': [item['id']]}).json()['updated'] == 0
    assert client.post('/api/v1/citizen/notifications/read', headers=ch, json={'ids': [item['id']]}).json()['updated'] == 1
    assert client.post('/api/v1/citizen/notifications/read', headers=ch, json={'ids': [item['id']]}).json()['updated'] == 0
    assert client.get('/api/v1/citizen/notifications?unread=true', headers=ch).json()['total'] == 0


def test_notification_ws_event_goes_only_to_recipient(monkeypatch, client):
    from app import ws

    class FakeSocket:
        def __init__(self):
            self.msgs = []

        async def send_text(self, text):
            self.msgs.append(text)

    owner, other, officer = FakeSocket(), FakeSocket(), FakeSocket()
    clients = [{'ws': owner, 'role': 'citizen', 'username': 'citizen1'},
               {'ws': other, 'role': 'citizen', 'username': 'citizen2'},
               {'ws': officer, 'role': 'officer', 'username': 'officer1'}]
    monkeypatch.setattr(ws, 'CLIENTS', clients)
    asyncio.run(ws.broadcast('notification.new', {'id': 'NT-1', 'violation_id': 'VP-1'}, to_users=['citizen1']))
    assert len(owner.msgs) == 1 and '"notification.new"' in owner.msgs[0]
    assert other.msgs == [] and officer.msgs == []
    asyncio.run(ws.broadcast('violation.updated', {'id': 'VP-1'}, to_roles=['officer', 'commander', 'admin']))
    assert len(officer.msgs) == 1 and other.msgs == []
