"""Tiện ích dùng chung cho test M6a.

Đăng nhập bị giới hạn 5 lần/phút/IP (§11), nên token được cache theo từng `client` (mỗi test có
một client mới) để một test không đốt hết hạn mức đăng nhập.
"""
import itertools

from tests.test_station import violation_body

PW = 'SaiGon@2026'
NEW_PW = 'Matkhau@2026'
_SEQ = itertools.count(1)


def tok(client, user, pw=PW):
    cache = client.__dict__.setdefault('_m6_tokens', {})
    if user not in cache:
        r = client.post('/api/v1/auth/login', json={'username': user, 'password': pw})
        assert r.status_code == 200, r.text
        cache[user] = r.json()['access_token']
    return cache[user]


def hdr(client, user, pw=PW):
    return {'Authorization': 'Bearer ' + tok(client, user, pw)}


def register(client, username, pw=NEW_PW):
    r = client.post('/api/v1/citizen/account/register', json={
        'username': username, 'password': pw, 'full_name': 'Công dân thử nghiệm',
        'email': f'{username}@example.test'})
    assert r.status_code == 200, r.text
    return hdr(client, username, pw)


def db():
    from app.db import get_conn
    return get_conn()


def code_of(plate):
    conn = db()
    try:
        return conn.execute('SELECT registration_code FROM plates_seed WHERE plate=?', (plate,)).fetchone()['registration_code']
    finally:
        conn.close()


def seed_plates(n, offset=0):
    """Biển không phải kịch bản, kèm loại xe và mã đăng ký thật từ seed."""
    conn = db()
    try:
        rows = conn.execute('SELECT plate, vehicle_class, registration_code FROM plates_seed WHERE is_scenario=0 '
                            'ORDER BY slot, gen, vehicle_class LIMIT ? OFFSET ?', (n, offset)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def new_violation(client, plate, **over):
    k = next(_SEQ)
    body = violation_body(plate=plate, vehicle_id=f'V-M6-{k:05d}', cycle_id=5000 + k)
    body.update(over)
    r = client.post('/api/v1/station/violations', headers=hdr(client, 'station-3d'), json=body)
    assert r.status_code == 200, r.text
    return r.json()['id']


def confirm(client, vid, note='xác nhận'):
    return client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=hdr(client, 'officer1'), json={'note': note})
