from tests.test_station import officer_headers, station_headers, violation_body


def test_lifecycle_m1_only_4_states(client):
    h = station_headers(client)
    oh = officer_headers(client)
    # new → confirmed; confirmed KHÔNG có cạnh ra trong M1 (notified/paid/disputed thuộc M6).
    vid = client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id='V-000010', cycle_id=20)).json()['id']
    r = client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=oh, json={'note': 'đúng'})
    assert r.status_code == 200 and r.json()['status'] == 'confirmed'
    assert client.post(f'/api/v1/officer/violations/{vid}/needs-review', headers=oh, json={'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{vid}/dismiss', headers=oh, json={'note': 'nhầm'}).status_code == 409
    # Cạnh new → dismissed và needs_review → confirmed vẫn hợp lệ.
    vid2 = client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id='V-000011', cycle_id=21)).json()['id']
    d = client.post(f'/api/v1/officer/violations/{vid2}/dismiss', headers=oh, json={'note': 'nhầm'})
    assert d.status_code == 200 and d.json()['status'] == 'dismissed'
    vid3 = client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id='V-000012', cycle_id=22, confidence=0.5)).json()['id']
    assert client.post(f'/api/v1/officer/violations/{vid3}/confirm', headers=oh, json={'note': 'ok'}).status_code == 200


def test_officer_list_and_get_detail(client):
    h = station_headers(client)
    for k in range(3):
        client.post('/api/v1/station/violations', headers=h, json=violation_body(vehicle_id=f'V-0001{k}', cycle_id=30 + k))
    oh = officer_headers(client)
    r = client.get('/api/v1/officer/violations?status=new&page=1&page_size=2', headers=oh)
    assert r.status_code == 200
    body = r.json()
    assert body['total'] >= 3 and len(body['items']) == 2
    vid = body['items'][0]['id']
    detail = client.get(f'/api/v1/officer/violations/{vid}', headers=oh).json()
    assert detail['signal']['mode'] in ('fixed', 'smart')
    assert 'evidence' in detail


def test_controls_require_commander(client):
    oh = officer_headers(client)
    r = client.post('/api/v1/officer/controls/signal-mode', headers=oh, json={'mode': 'smart'})
    assert r.status_code == 403
    ch = {'Authorization': 'Bearer ' + client.post('/api/v1/auth/login', json={'username': 'commander1', 'password': 'SaiGon@2026'}).json()['access_token']}
    r2 = client.post('/api/v1/officer/controls/signal-mode', headers=ch, json={'mode': 'smart'})
    assert r2.status_code == 200 and r2.json()['mode'] == 'smart'
    ov = client.post('/api/v1/officer/controls/signal-override', headers=ch,
                     json={'node_id': 'HX-01', 'group': 0, 'duration_s': 60, 'reason': 'ưu tiên'})
    assert ov.status_code == 200
    assert 'until_t_sim' in ov.json() and ov.json()['until_at'].endswith('Z')
