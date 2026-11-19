"""Backend giữ quyền xác định mức phạt theo policy nội bộ của dự án."""
import json

import pytest

from app.db import connect
from app.penalties import penalty_for, public_penalty
from tests.m6_helpers import hdr
from tests.test_station import officer_headers, station_headers, violation_body
from tests.public_demo_helpers import apply_command, claim_station


def _create_and_read(client, **over):
    response = client.post('/api/v1/station/violations', headers=station_headers(client),
                           json=violation_body(**over))
    assert response.status_code == 200, response.text
    vid = response.json()['id']
    detail = client.get(f'/api/v1/officer/violations/{vid}', headers=officer_headers(client))
    assert detail.status_code == 200, detail.text
    return vid, detail.json()['penalty']


@pytest.mark.parametrize('client_verified', [True, False])
def test_station_cannot_choose_amount_source_or_verification(client, client_verified):
    vid, penalty = _create_and_read(client, penalty={
        'vnd_min': 1, 'vnd_max': 1, 'license_deduction_points': 0,
        'verified': client_verified, 'source': 'Nguồn giả', 'owner_phone': 'không công khai'})
    assert penalty == {'vnd_min': 18000000, 'vnd_max': 20000000,
                       'license_deduction_points': 4, 'verified': True,
                       'source': 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b'}
    with connect() as conn:
        assert json.loads(conn.execute('SELECT penalty_json FROM violations WHERE id=?',
                                       (vid,)).fetchone()['penalty_json']) == penalty
    client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=officer_headers(client), json={'note': 'Đã kiểm tra'})
    public = client.get('/api/v1/public/lookup', params={'plate': '51K-123.45'}).json()['items'][0]
    assert public['penalty'] == penalty
    assert 'owner_phone' not in public and 'owner_name' not in public


@pytest.mark.parametrize('over', [
    {'vehicle_class': 'bicycle'},
    {'violation_code': 'UNKNOWN'},
    {'violation_code': 'LANE'},
    {'violation_code': 'OVERLOAD'},
    {'violation_code': 'NO-HELMET', 'vehicle_class': 'car'},
    {'violation_code': 'NO-SEATBELT', 'vehicle_class': 'motorbike'},
    {'violation_code': 'SPEED', 'signal': {'cycle_id': 12}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': 90}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': '90', 'speed_limit_kmh': 50}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': True, 'speed_limit_kmh': 50}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': -90, 'speed_limit_kmh': 50}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': 90, 'speed_limit_kmh': 0}},
    {'violation_code': 'SPEED', 'signal': {'speed_kmh': 55, 'speed_limit_kmh': 50}},
    {'violation_code': 'SPEED', 'vehicle_class': 'motorbike',
     'signal': {'speed_kmh': 90, 'speed_limit_kmh': 50}},
    {'violation_code': 'PARK', 'vehicle_class': 'motorbike'},
])
def test_incomplete_or_unverified_policy_cannot_be_overridden(client, over):
    _, penalty = _create_and_read(client, penalty={'vnd_min': 1, 'vnd_max': 1, 'verified': True,
                                                  'license_deduction_points': 99, 'source': 'Nguồn giả'}, **over)
    assert penalty['verified'] is False
    assert penalty['source'] != 'Nguồn giả'
    assert penalty['vnd_min'] != 1 and penalty['license_deduction_points'] != 99


@pytest.mark.parametrize('speed,expected,points', [
    (55.1, (800000, 1000000), 0),
    (60, (4000000, 6000000), 2),
    (70, (4000000, 6000000), 2),
    (70.1, (6000000, 8000000), 4),
    (85, (6000000, 8000000), 4),
    (85.1, (12000000, 14000000), 6),
])
def test_speed_policy_uses_measured_speed_and_limit(client, speed, expected, points):
    _, penalty = _create_and_read(client, violation_code='SPEED', penalty={},
                                  signal={'speed_kmh': speed, 'speed_limit_kmh': 50})
    assert penalty['verified'] is True
    assert (penalty['vnd_min'], penalty['vnd_max']) == expected
    assert penalty['license_deduction_points'] == points


def test_invalid_emergency_kind_rejected_without_mutation_or_broadcast(client, monkeypatch):
    ch = hdr(client, 'commander1')
    lease = claim_station(client)
    broadcasts = []

    async def record_broadcast(*args, **kwargs):
        broadcasts.append((args, kwargs))

    monkeypatch.setattr('app.ws.broadcast', record_broadcast)
    first_response = client.post('/api/v1/officer/controls/scenario', headers=ch,
                                 json={'scenario': 'flood-nhc'})
    apply_command(client, first_response, lease)
    first = first_response.json()
    assert any(args[0] == 'cmd.scenario' and args[1]['key'] == 'flood-nhc'
               and kwargs['to_roles'] == ['station'] for args, kwargs in broadcasts)
    broadcasts.clear()
    with connect() as conn:
        count = conn.execute('SELECT COUNT(*) FROM audit_log').fetchone()[0]
    rejected = client.post('/api/v1/officer/controls/scenario', headers=ch,
                           json={'scenario': 'priority-run', 'params': {'kind': 'ufo'}})
    assert rejected.status_code == 422, rejected.text
    with connect() as conn:
        assert conn.execute('SELECT COUNT(*) FROM scenario_runs').fetchone()[0] == 1
        assert conn.execute('SELECT id FROM scenario_runs WHERE finished_at IS NULL').fetchone()['id'] == first['scenario_id']
        assert conn.execute('SELECT COUNT(*) FROM audit_log').fetchone()[0] == count
    assert broadcasts == []


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf'), None, {}, 10 ** 1000])
def test_nonfinite_or_unusable_measurements_stay_unverified(value):
    assert penalty_for('SPEED', 'car', {'speed_kmh': value, 'speed_limit_kmh': 50})['verified'] is False
    assert penalty_for('SPEED', 'car', {'speed_kmh': 90, 'speed_limit_kmh': value})['verified'] is False


def test_public_penalty_whitelist_hides_unverified_amounts_and_points():
    public = public_penalty({'vnd_min': 1, 'vnd_max': 2, 'license_deduction_points': 99,
                             'verified': False, 'source': 'Cần đối chiếu', 'owner_phone': 'private'})
    assert public == {'vnd_min': None, 'vnd_max': None, 'license_deduction_points': None,
                      'verified': False, 'source': 'Cần đối chiếu'}


@pytest.mark.parametrize('code,vehicle,low,high,points', [
    ('RED-LIGHT', 'motorbike', 4000000, 6000000, 4),
    ('WRONG-WAY', 'car', 18000000, 20000000, 4),
    ('WRONG-WAY', 'motorbike', 4000000, 6000000, 2),
    ('LANE', 'motorbike', 600000, 800000, 0),
    ('PARK', 'car', 4000000, 6000000, 2),
    ('WRONG-TURN', 'car', 2000000, 3000000, 2),
    ('WRONG-TURN', 'motorbike', 200000, 400000, 0),
    ('NO-HELMET', 'motorbike', 400000, 600000, 0),
    ('PHONE', 'car', 4000000, 6000000, 4),
    ('PHONE', 'motorbike', 800000, 1000000, 4),
    ('NO-SEATBELT', 'car', 800000, 1000000, 0),
    ('RED-LIGHT', 'bus', 18000000, 20000000, 4),
    ('RED-LIGHT', 'truck', 18000000, 20000000, 4),
])
def test_existing_policy_for_supported_code_vehicle_pairs(code, vehicle, low, high, points):
    result = penalty_for(code, vehicle, {})
    assert result['verified'] is True
    assert (result['vnd_min'], result['vnd_max'], result['license_deduction_points']) == (low, high, points)
    assert result['source'].startswith('NĐ 168/2024 · Điều ')
