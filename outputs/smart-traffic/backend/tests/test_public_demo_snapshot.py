"""Snapshot được quan sát qua HTTP; fixture chỉ cấp shape, không làm runtime."""
import pytest

from tests.public_demo_helpers import capability_headers, claim_station, snapshot_body
from tests.test_public_demo_commands import _fresh_request, _headers


def test_data_t1_snapshot_reports_missing_station_with_contract_shape(client):
    login = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'})
    assert login.status_code == 200, login.text
    result = client.get('/api/v1/officer/snapshot', headers={'Authorization': 'Bearer ' + login.json()['access_token']})
    assert result.status_code == 200, 'Thiếu GET /officer/snapshot của hợp đồng v1'
    snapshot = result.json()
    assert snapshot['snapshot_version'] == 'public-demo-v1'
    assert set(snapshot) >= {'revision', 'build_id', 'station', 'simulation', 'junctions', 'kpi', 'routes', 'cameras'}
    assert snapshot['station'] == {'status': 'missing', 'id': None, 'last_seen_at': None}


def test_data_t1_snapshot_publish_uses_capability_and_revision_persists(client):
    user = _headers(client, 'officer1')
    lease = claim_station(client, _headers(client, 'station-3d'))
    route = '/api/v1/officer/snapshot'
    before = client.get(route, headers=user).json()
    sent = snapshot_body()
    write = client.post('/api/v1/station/snapshot', headers=capability_headers(lease), json={'snapshot': sent})
    assert write.status_code == 200, write.text
    actual = client.get(route, headers=user).json()
    assert actual['snapshot_version'] == 'public-demo-v1'
    assert actual['revision'] > before['revision']
    assert actual['simulation'] == sent['simulation'] and actual['kpi'] == sent['kpi']
    assert actual['station']['status'] == 'active' and actual['station']['id'] == lease['station_id']
    assert actual['cameras'][0]['frame_id'] is None and actual['cameras'][0]['status'] == 'missing'
    reopened = _fresh_request(route, token=user['Authorization'][7:])
    assert reopened['status'] == 200
    assert reopened['body']['revision'] == actual['revision']
    assert reopened['body']['simulation']['t_sim'] == 73.4


@pytest.mark.parametrize('username', ['citizen1', 'station-3d'])
def test_data_t1_snapshot_read_keeps_officer_role_matrix(client, username):
    result = client.get('/api/v1/officer/snapshot', headers=_headers(client, username))
    assert result.status_code == 403, result.text


def test_data_t1_station_jwt_is_not_snapshot_or_ack_capability(client):
    station = _headers(client, 'station-3d')
    write = client.post('/api/v1/station/snapshot', headers=station, json={'snapshot': snapshot_body()})
    assert write.status_code in (401, 403, 409), write.text
    ack = client.post('/api/v1/station/commands/unknown/ack', headers=station,
                      json={'status': 'applied', 'applied_t_sim': 1.0})
    assert ack.status_code in (401, 403, 409), ack.text


def test_data_t1_stale_capability_cannot_write_snapshot_metrics_frames_heat_or_violation(client):
    station = _headers(client, 'station-3d')
    user = _headers(client)
    old = claim_station(client, station)
    assert client.request('DELETE', '/api/v1/station/lease', headers=capability_headers(old),
                          json={'station_id': old['station_id'], 'owner_id': old['owner_id']}).status_code == 200
    current = claim_station(client, station, owner_id='next-owner')
    before = client.get('/api/v1/officer/snapshot', headers=user).json()
    heat_before = client.get('/api/v1/officer/heat', headers=user).json()
    paths = [
        ('snapshot', {'snapshot': snapshot_body(999)}),
        ('metrics', {'station_id': old['station_id'], 't_sim': 999, 'kpi': {'wait_avg_s': 999}, 'signal_mode': 'smart'}),
        ('frames', {'camera_id': 'CAM-HX-001', 'jpeg_base64': 'eA==', 'w': 1, 'h': 1}),
        ('heat', {'t_sim': 0.1, 'levels': [[19, 0.95]], 'alerts': []}),
        ('violations', {'plate': '51K-123.45', 'plate_format': 'car', 'vehicle_class': 'car', 'vehicle_id': 'old-owner', 'cycle_id': 814, 'node_id': 'HX-01', 'camera_id': 'CAM-HX-001', 'violation_code': 'RED-LIGHT', 'confidence': 0.9, 'signal': {'phase_for_vehicle': 'red', 'cycle_id': 814}, 'evidence': [], 'sim': {'t_sim': 73.4}}),
    ]
    for path, body in paths:
        result = client.post('/api/v1/station/' + path, headers=capability_headers(old), json=body)
        assert result.status_code in (401, 403, 409), (path, result.status_code, result.text)
    after = client.get('/api/v1/officer/snapshot', headers=user).json()
    assert after['revision'] == before['revision']
    assert after['simulation'] == before['simulation']
    assert client.get('/api/v1/officer/heat', headers=user).json() == heat_before
    assert current['generation'] > old['generation']
