import pytest

from tests.test_station import officer_headers, station_headers, violation_body


@pytest.mark.parametrize('plate,query', [
    ('51K-123.45', '51k12345'),
    ('51K1-123.45', '51k112345'),
    ('59-X1 234.56', '59x123456'),
    ('59-X1 234.56', ' 59-x1 234.56 '),
])
def test_public_lookup_accepts_lowercase_and_compact_plate(client, plate, query):
    response = client.post('/api/v1/station/violations', headers=station_headers(client),
                           json=violation_body(plate=plate))
    assert response.status_code == 200
    vid = response.json()['id']
    # Cùng chuẩn hóa nhưng vẫn giấu bản ghi chưa được cán bộ xác nhận.
    assert client.get('/api/v1/public/lookup', params={'plate': query}).json()['items'] == []
    assert client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=officer_headers(client),
                       json={'note': 'Đã kiểm tra'}).status_code == 200
    found = client.get('/api/v1/public/lookup', params={'plate': query})
    assert found.status_code == 200, found.text
    assert [row['id'] for row in found.json()['items']] == [vid]


@pytest.mark.parametrize('plate', ['', 'ABC', '51K1234', '51K1234567', "51K12345'", '５１K12345'])
def test_public_lookup_rejects_malformed_plate(client, plate):
    response = client.get('/api/v1/public/lookup', params={'plate': plate})
    assert response.status_code == 422, response.text
    assert 'Biển số không hợp lệ' in response.json()['error']['message']
