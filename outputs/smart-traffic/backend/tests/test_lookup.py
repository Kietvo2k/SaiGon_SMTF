from tests.test_station import officer_headers, station_headers, violation_body


def test_public_lookup_no_owner_leak(client):
    h = station_headers(client)
    vid = client.post('/api/v1/station/violations', headers=h,
                      json=violation_body(vehicle_id='V-000050', cycle_id=60, plate='51K-888.88', is_scenario_plate=True)).json()['id']
    # Công dân chỉ thấy vi phạm đã `confirmed+` → xác nhận trước khi tra cứu.
    oh = officer_headers(client)
    client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=oh, json={'note': 'ok'})
    r = client.get('/api/v1/public/lookup?plate=51K-888.88&vehicle_class=car')
    assert r.status_code == 200
    body = r.json()
    assert body['total'] == 1
    item = body['items'][0]
    assert item['violation_code'] == 'RED-LIGHT'
    for banned in ('owner_phone', 'is_scenario_plate', 'sim', 'owner_name'):
        assert banned not in item, banned
    assert item['penalty']['verified'] is True
    assert item['evidence'] == [] or all('url' in e for e in item['evidence'])


def test_lookup_hides_unconfirmed(client):
    h = station_headers(client)
    client.post('/api/v1/station/violations', headers=h,
                json=violation_body(vehicle_id='V-000051', cycle_id=61, plate='51K-999.99'))
    # Chưa xác nhận → không xuất hiện với công dân.
    assert client.get('/api/v1/public/lookup?plate=51K-999.99').json()['total'] == 0


def test_lookup_requires_plate(client):
    r = client.get('/api/v1/public/lookup')
    assert r.status_code == 422
