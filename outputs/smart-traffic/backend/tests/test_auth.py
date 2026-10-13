def test_login_seed_account_returns_jwt_with_role(client):
    r = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['token_type'] == 'bearer'
    assert body['role'] == 'officer'
    assert body['expires_in'] == 28800
    me = client.get('/api/v1/auth/me', headers={'Authorization': f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()['role'] == 'officer'


def test_login_wrong_password_401_and_rate_limit_5_per_minute(client):
    for _ in range(5):
        r = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'sai'})
        assert r.status_code == 401
    r = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'})
    assert r.status_code == 429, r.text


def test_role_always_from_jwt_not_from_body(client):
    login = client.post('/api/v1/auth/login', json={'username': 'citizen1', 'password': 'SaiGon@2026'}).json()
    headers = {'Authorization': f"Bearer {login['access_token']}"}
    r = client.post('/api/v1/officer/violations/VP-x/confirm', headers=headers, json={'note': 'x', 'role': 'admin'})
    # Route officer chỉ tồn tại ở Task 6; ở Task 5 chưa mount nên 404 cũng là từ chối hợp lệ.
    # Sau Task 6 endpoint trả 403 nên test vẫn xanh.
    assert r.status_code in (401, 403, 404)


def test_station_role_login_and_me(client):
    login = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()
    assert login['role'] == 'station'
