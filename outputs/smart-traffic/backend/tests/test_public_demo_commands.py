"""Oracle độc lập ở HTTP: pending chỉ kết thúc sau ACK trạm có lease."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from tests.public_demo_helpers import apply_command, capability_headers, claim_station


def _headers(client, username='commander1'):
    cache = client.__dict__.setdefault('_data_t1_tokens', {})
    if username in cache:
        return cache[username]
    result = client.post('/api/v1/auth/login', json={'username': username, 'password': 'SaiGon@2026'})
    assert result.status_code == 200, result.text
    cache[username] = {'Authorization': 'Bearer ' + result.json()['access_token']}
    return cache[username]


def _send(client, headers, command_id='local-test-command'):
    return client.post('/api/v1/officer/controls/signal-mode', headers=headers,
                       json={'mode': 'smart', 'command_id': command_id})


def _fresh_request(path, method='GET', token=None, body=None):
    # Tiến trình mới không thể đọc queue/trạng thái Python của tiến trình test.
    script = """
import json, sys
from fastapi.testclient import TestClient
from app.main import app
item = json.loads(sys.stdin.read())
client = TestClient(app)
headers = {'Authorization': 'Bearer ' + item['token']} if item['token'] else {}
response = client.request(item['method'], item['path'], headers=headers, json=item['body'])
print(json.dumps({'status': response.status_code, 'body': response.json()}))
"""
    result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).resolve().parents[1],
                            input=json.dumps({'path': path, 'method': method, 'token': token, 'body': body}),
                            capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONUTF8': '1'}, timeout=20)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_data_t1_missing_station_rejects_without_pending_or_audit(client):
    headers = _headers(client)
    before = client.get('/api/v1/officer/audit', headers=headers).json()['total']
    result = client.post('/api/v1/officer/controls/signal-mode', headers=headers, json={'mode': 'smart'})
    assert result.status_code == 409, 'Thiếu trạm phải là 409 STATION_UNAVAILABLE, không được báo đã áp dụng'
    assert result.json()['error']['code'] == 'STATION_UNAVAILABLE'
    assert client.get('/api/v1/officer/audit', headers=headers).json()['total'] == before


@pytest.mark.parametrize('username', ['officer1', 'citizen1', 'station-3d'])
def test_data_t1_control_denies_roles_before_any_write(client, username):
    headers = _headers(client, username)
    result = _send(client, headers)
    assert result.status_code == 403, result.text
    assert result.json()['error']['code'] == 'FORBIDDEN'


def test_data_t1_pending_does_not_change_override_before_dequeue_and_ack(client):
    user = _headers(client)
    lease = claim_station(client, _headers(client, 'station-3d'))
    before = client.get('/api/v1/officer/controls/state', headers=user).json()['overrides']
    response = client.post('/api/v1/officer/controls/signal-override', headers=user,
                           json={'node_id': 'HX-01', 'group': 1, 'duration_s': 45, 'reason': 'kiểm pending'})
    assert response.status_code == 200, response.text
    pending = response.json()
    assert pending['status'] == 'pending' and pending['command_id']
    assert client.get('/api/v1/officer/controls/state', headers=user).json()['overrides'] == before
    status = client.get('/api/v1/officer/commands/' + pending['command_id'], headers=user)
    assert status.status_code == 200 and status.json()['status'] == 'pending'
    apply_command(client, response, lease, t_sim=91.7)
    status = client.get('/api/v1/officer/commands/' + pending['command_id'], headers=user).json()
    assert status['status'] == 'applied' and status['applied_t_sim'] == 91.7
    overrides = client.get('/api/v1/officer/controls/state', headers=user).json()['overrides']
    assert any(item['node_id'] == 'HX-01' and item['group'] == 1 for item in overrides)


def test_data_t1_ack_needs_dequeue_and_terminal_is_immutable(client):
    user = _headers(client)
    lease = claim_station(client, _headers(client, 'station-3d'))
    pending = _send(client, user).json()
    path = '/api/v1/station/commands/' + pending['command_id'] + '/ack'
    forged = client.post(path, headers=capability_headers(lease), json={'status': 'applied', 'applied_t_sim': 999})
    assert forged.status_code in (403, 409), 'ACK trước dequeue phải bị chặn'
    assert client.get('/api/v1/officer/commands/' + pending['command_id'], headers=user).json()['status'] == 'pending'
    queue = client.get('/api/v1/station/commands/pending', headers=capability_headers(lease))
    assert queue.status_code == 200, queue.text
    assert [command['command_id'] for command in queue.json()['commands']] == [pending['command_id']]
    assert client.get('/api/v1/station/commands/pending', headers=capability_headers(lease)).json()['commands'] == []
    result = client.post(path, headers=capability_headers(lease), json={'status': 'applied', 'applied_t_sim': 17.2})
    assert result.status_code == 200 and result.json()['status'] == 'applied'
    client.post(path, headers=capability_headers(lease), json={'status': 'rejected', 'reason_code': 'COMMAND_REJECTED'})
    stored = client.get('/api/v1/officer/commands/' + pending['command_id'], headers=user).json()
    assert stored['status'] == 'applied' and stored['applied_t_sim'] == 17.2


def test_data_t1_two_claims_only_one_winner_and_old_generation_never_replays(client):
    station = _headers(client, 'station-3d')
    user = _headers(client)

    def claim(owner):
        return client.post('/api/v1/station/lease', headers=station, json={'station_id': 'STATION-3D-01', 'owner_id': owner})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(claim, ['first-owner', 'second-owner']))
    assert sorted(response.status_code for response in results) == [200, 409]
    lease = next(response.json() for response in results if response.status_code == 200)
    pending = _send(client, user, 'never-replay-old-generation').json()
    queue = client.get('/api/v1/station/commands/pending', headers=capability_headers(lease)).json()['commands']
    assert len(queue) == 1 and queue[0]['command_id'] == pending['command_id']
    released = client.request('DELETE', '/api/v1/station/lease', headers=capability_headers(lease),
                              json={'station_id': lease['station_id'], 'owner_id': lease['owner_id']})
    assert released.status_code == 200, released.text
    next_lease = claim_station(client, station, owner_id='new-owner')
    assert next_lease['generation'] > lease['generation']
    assert client.get('/api/v1/station/commands/pending', headers=capability_headers(next_lease)).json()['commands'] == []
    ack_path = '/api/v1/station/commands/' + pending['command_id'] + '/ack'
    for credentials in (lease, next_lease):
        response = client.post(ack_path, headers=capability_headers(credentials), json={'status': 'applied', 'applied_t_sim': 999})
        assert response.status_code in (401, 403, 409), response.text
    current = client.get('/api/v1/officer/commands/' + pending['command_id'], headers=user).json()
    assert current['status'] != 'applied' and current['applied_t_sim'] is None


def test_data_t1_pending_and_ack_survive_fresh_python_process(client):
    user = _headers(client)
    token = user['Authorization'][7:]
    lease = claim_station(client, _headers(client, 'station-3d'))
    response = _send(client, user, 'durable-command')
    assert response.status_code == 200, response.text
    command = response.json()
    assert command['status'] == 'pending'
    first = _fresh_request('/api/v1/officer/commands/' + command['command_id'], token=token)
    assert first['status'] == 200 and first['body']['status'] == 'pending', 'Queue không được chỉ nằm trong RAM'
    queue = _fresh_request('/api/v1/station/commands/pending', token=lease['capability'])
    assert queue['status'] == 200
    assert [item['command_id'] for item in queue['body']['commands']] == [command['command_id']]
    ack = client.post('/api/v1/station/commands/' + command['command_id'] + '/ack', headers=capability_headers(lease),
                      json={'status': 'applied', 'applied_t_sim': 21.6})
    assert ack.status_code == 200, ack.text
    second = _fresh_request('/api/v1/officer/commands/' + command['command_id'], token=token)
    assert second['status'] == 200
    assert second['body']['status'] == 'applied' and second['body']['applied_t_sim'] == 21.6


def test_data_t1_deadline_is_real_time_at_ack_and_dequeue_not_sim_time(client):
    user = _headers(client)
    lease = claim_station(client, _headers(client, 'station-3d'))
    first = _send(client, user, 'late-ack').json()
    assert client.get('/api/v1/station/commands/pending', headers=capability_headers(lease)).json()['commands']
    second = _send(client, user, 'late-dequeue').json()
    end = time.monotonic() + 10.4
    while time.monotonic() < end:
        time.sleep(min(1, end - time.monotonic()))
        renew = client.put('/api/v1/station/lease', headers=capability_headers(lease),
                           json={'station_id': lease['station_id'], 'owner_id': lease['owner_id']})
        assert renew.status_code == 200, renew.text
    # Chưa đọc status: ACK và dequeue tự kiểm deadline, không dựa timer/read trước đó.
    late = client.post('/api/v1/station/commands/' + first['command_id'] + '/ack', headers=capability_headers(lease),
                       json={'status': 'applied', 'applied_t_sim': 0})
    assert late.status_code in (200, 409), late.text
    if late.status_code == 200:
        assert late.json()['status'] == 'expired'
    assert client.get('/api/v1/station/commands/pending', headers=capability_headers(lease)).json()['commands'] == []
    for command in (first, second):
        status = client.get('/api/v1/officer/commands/' + command['command_id'], headers=user).json()
        assert status['status'] == 'expired' and status['reason_code'] == 'COMMAND_EXPIRED'
        assert status['applied_t_sim'] is None
        retry = _send(client, user, command['command_id'])
        assert retry.status_code == 200 and retry.json()['status'] == 'expired'
