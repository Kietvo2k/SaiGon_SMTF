"""Ca hồi quy vòng 1: quan sát HTTP/WS, media và trạng thái v1."""
import base64
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import time
from urllib.parse import quote

import httpx
import pytest

from tests.m6_helpers import hdr, tok
from tests.public_demo_helpers import (
    capability_headers, claim_station, receive_ws, station_socket, ws_event, ws_ready,
)
from tests.test_station import violation_body


SNAPSHOT = '/api/v1/officer/snapshot'
CAMERA = 'CAM-HX-001'
CAPTURED = '2026-11-20T08:03:05Z'
STREAM = '/api/v1/media/stream/' + CAMERA
DENIED = {401, 403, 409}


def post(client, path, headers, **kwargs):
    return client.post('/api/v1/station/' + path, headers=headers, **kwargs)


def good(response):
    assert response.status_code == 200, response.text
    return response.json()


def release(client, lease):
    good(client.delete('/api/v1/station/lease', headers=capability_headers(lease)))


def frame(marker, seq):
    raw = b'\xff\xd8\xff' + marker.encode('ascii') + b'\xff\xd9'
    return raw, {'camera_id': CAMERA, 'seq': seq, 't': CAPTURED, 'w': 16, 'h': 9,
                 'frame_id': marker, 'jpeg_base64': base64.b64encode(raw).decode('ascii')}


def test_r1_station_writes_require_current_lease_during_takeover(client):
    legacy = hdr(client, 'station-3d')
    officer = hdr(client, 'officer1')
    commander = hdr(client, 'commander1')
    good(post(client, 'heartbeat', legacy, json={}))
    legacy_bytes, legacy_frame = frame('legacy-before-lease', 1)
    good(post(client, 'frames', legacy, json=legacy_frame))
    assert client.get(STREAM, headers=officer).content == legacy_bytes
    old = claim_station(client, legacy, owner_id='owner-old')
    release(client, old)
    current = claim_station(client, legacy, owner_id='owner-current')
    assert current['generation'] > old['generation']
    active = capability_headers(current)

    current_bytes, current_frame = frame('current-owner-frame', 2)
    good(post(client, 'heartbeat', active, json={}))
    good(post(client, 'metrics', active, json={'station_id': current['station_id'], 't_sim': 8,
                                                'kpi': {'queue_max': 3}, 'signal_mode': 'smart'}))
    good(post(client, 'heat', active, json={'t_sim': 8, 'levels': [[19, 0.2]], 'alerts': []}))
    good(post(client, 'frames', active, json=current_frame))
    vid = good(post(client, 'violations', active, json=violation_body(vehicle_id='current-vehicle')))['id']
    evidence = f'violations/{vid}/evidence'
    media_input = {'files': {'file': (CAMERA + '.jpg', current_bytes, 'image/jpeg')}}
    media_id = good(post(client, 'media', active, **media_input))['media_id']
    good(post(client, evidence, active, **media_input, data={'kind': 'before'}))

    snapshot = good(client.get(SNAPSHOT, headers=officer))
    assert next(c for c in snapshot['cameras'] if c['camera_id'] == CAMERA)['frame_id'] == 'current-owner-frame'
    assert client.get(STREAM, headers=officer).content == current_bytes
    media_route = '/api/v1/media/' + media_id
    assert client.get(media_route, headers=officer).content == current_bytes
    reads = [
        (SNAPSHOT, officer), ('/api/v1/officer/heat', officer),
        ('/api/v1/officer/audit', commander), (f'/api/v1/officer/violations/{vid}', officer),
    ]
    def count_rows():
        # Kết nối đọc riêng đo cả các bản ghi mà snapshot chưa phản ánh.
        with sqlite3.connect(os.environ['SMART_DB_PATH']) as conn:
            return [conn.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in (
                'kpi_samples', 'station_metrics', 'heat_snapshots', 'violations',
                'evidence', 'media_assets', 'audit_log',
            )]

    before = [good(client.get(path, headers=headers)) for path, headers in reads]
    row_counts = count_rows()

    rejected_bytes, rejected_frame = frame('rejected-frame', 3)
    failed_media = {'files': {'file': (CAMERA + '.jpg', rejected_bytes, 'image/jpeg')}}
    statuses = {}
    with station_socket(client, tok(client, 'officer1')) as (observer, _):
        with station_socket(client, current['capability']) as (station, _):
            ws_ready(observer, station)
        for name, writer in [('old', capability_headers(old)), ('legacy', legacy)]:
            for path, request in [
                ('heartbeat', {'json': {}}),
                ('metrics', {'json': {'station_id': current['station_id'], 't_sim': 999,
                                      'kpi': {'queue_max': 999}, 'signal_mode': 'fixed'}}),
                ('heat', {'json': {'t_sim': 99, 'levels': [[19, 0.95]], 'alerts': []}}),
                ('frames', {'json': rejected_frame}),
                ('violations', {'json': violation_body(vehicle_id=name + '-rejected')}),
                (evidence, {**failed_media, 'data': {'kind': 'after'}}),
                ('media', failed_media),
            ]:
                statuses[f'{name}:{path}'] = post(client, path, writer, **request).status_code
        leaked = receive_ws(observer, timeout=0.25)

    after = [good(client.get(path, headers=headers)) for path, headers in reads]
    stream = client.get(STREAM, headers=officer)
    assert {
        'unexpected_statuses': {key: code for key, code in statuses.items() if code not in DENIED},
        'state_equal': [a == b for a, b in zip(after, before)],
        'rows_unchanged': count_rows() == row_counts,
        'stream_unchanged': stream.status_code == 200 and stream.content == current_bytes,
        'existing_media_unchanged': client.get(media_route, headers=officer).content == current_bytes,
        'event_absent': leaked is None,
    } == {'unexpected_statuses': {}, 'state_equal': [True] * len(reads), 'stream_unchanged': True,
          'existing_media_unchanged': True, 'rows_unchanged': True, 'event_absent': True}


@pytest.mark.parametrize('flow', ['inbound', 'outbound'])
def test_r1_station_ws_fences_already_open_and_new_legacy_sessions(client, flow):
    jwt = tok(client, 'station-3d')
    commander = hdr(client, 'commander1')
    with station_socket(client, tok(client, 'officer1')) as (officer, _):
        with station_socket(client, jwt) as (legacy_before, _):
            ws_ready(officer, legacy_before)
            old = claim_station(client, owner_id='ws-previous')
            with station_socket(client, old['capability']) as (old_socket, _):
                ws_ready(officer, old_socket)
                release(client, old)
                current = claim_station(client, owner_id='ws-next')
                with station_socket(client, current['capability']) as (station, _):
                    with station_socket(client, jwt, must_auth=False) as (legacy_new, new_ready):
                        ws_ready(officer, station)
                        superseded = {'legacy_before': (legacy_before, True), 'legacy_new': (legacy_new, new_ready),
                                      'old_capability': (old_socket, True)}
                        if flow == 'inbound':
                            for marker, (sock, ready) in superseded.items():
                                if ready:
                                    sock.send_json({'event': 'station.heartbeat', 'data': {'marker': marker}})
                            station.send_json({'event': 'station.heartbeat', 'data': {'marker': 'current'}})
                            seen = [ws_event(officer)['data']['marker']]
                            extra = receive_ws(officer, timeout=0.35)
                            while extra is not None and len(seen) <= len(superseded):
                                assert extra['type'] == 'websocket.send', extra
                                seen.append(json.loads(extra['text'])['data']['marker'])
                                extra = receive_ws(officer, timeout=0.05)
                            assert seen == ['current']
                        else:
                            command = good(client.post('/api/v1/officer/controls/signal-mode', headers=commander,
                                                       json={'mode': 'smart', 'command_id': 'ws-current-only'}))
                            assert command['status'] == 'pending'
                            msg = ws_event(station)
                            assert msg['event'] == 'cmd.signal-mode'
                            assert msg['data']['command_id'] == 'ws-current-only' and msg['data']['mode'] == 'smart'
                            leaked = {}
                            for marker, (sock, _) in superseded.items():
                                message = receive_ws(sock, timeout=0.2)
                                if message is not None and message['type'] == 'websocket.send':
                                    leaked[marker] = json.loads(message['text'])['event']
                            assert leaked == {}, 'Chỉ chủ lease hiện tại nhận cmd.*'


@pytest.fixture
def uvicorn_client(tmp_path):
    # HTTP qua TCP để đo raw_path đúng như Uvicorn nhận.
    backend = Path(__file__).resolve().parents[1]
    if product_root := os.environ.get('DATA_T1_ROOT'):
        backend = Path(product_root) / 'outputs/smart-traffic/backend'
    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    runner = (
        'from app.db import connect, init_db; from app.seed.run_seed import run_seed\n'
        'with connect() as conn: init_db(conn)\n'
        'run_seed()\n'
        'import os, uvicorn\n'
        'uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ["DATA_T1_TEST_PORT"]), access_log=False)\n'
    )
    env = {**os.environ, 'SMART_DB_PATH': str(tmp_path / 'test.db'), 'SMART_VAR_DIR': str(tmp_path),
           'SMART_CLEANUP': '0', 'DATA_T1_TEST_PORT': str(port)}
    with (tmp_path / 'uvicorn.log').open('wb') as log, httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=2) as client:
        with subprocess.Popen([sys.executable, '-B', '-c', runner], cwd=backend, env=env, stdout=log, stderr=log) as process:
            try:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline and process.poll() is None:
                    try:
                        if client.get('/api/v1/health').status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(0.05)
                else:
                    pytest.fail((tmp_path / 'uvicorn.log').read_text(encoding='utf8', errors='replace'))
                yield client
            finally:
                process.terminate()
                process.wait(timeout=5)


def test_r3_uvicorn_command_id_round_trip_and_dedup(uvicorn_client):
    client = uvicorn_client
    commander = hdr(client, 'commander1')
    active = capability_headers(claim_station(client))
    ids = ['review space', 'review đèn', 'review%', 'review/slash', 'review%2Fslash']
    path = '/api/v1/officer/controls/signal-mode'

    def enqueue(command_id):
        return good(client.post(path, headers=commander, json={'mode': 'smart', 'command_id': command_id}))

    for command_id in ids:
        assert enqueue(command_id)['command_id'] == command_id
        assert enqueue(command_id)['status'] == 'pending'
    queue = good(client.get('/api/v1/station/commands/pending', headers=active))
    assert sorted(item['command_id'] for item in queue['commands']) == sorted(ids)
    assert good(client.get('/api/v1/station/commands/pending', headers=active)) == {'commands': []}
    failures = {}
    for index, command_id in enumerate(ids):
        segment = quote(command_id, safe='')
        read = '/api/v1/officer/commands/' + segment
        get_before = client.get(read, headers=commander)
        ack = post(client, 'commands/' + segment + '/ack', active, json={'status': 'applied', 'applied_t_sim': index + 12})
        get_after = client.get(read, headers=commander)
        if [get_before.status_code, ack.status_code, get_after.status_code] != [200, 200, 200]:
            failures[command_id] = [get_before.status_code, ack.status_code, get_after.status_code]
            continue
        assert get_before.json()['command_id'] == command_id and get_before.json()['status'] == 'pending'
        terminal = get_after.json()
        assert terminal['command_id'] == command_id and terminal['applied_t_sim'] == index + 12
        assert terminal['status'] == 'applied' == ack.json()['status']
        assert enqueue(command_id)['applied_t_sim'] == index + 12
    assert failures == {}


def test_r4_local_fallback_camera_to_logic_cluster(client):
    seed = Path(__file__).resolve().parents[1] / 'app' / 'seed'
    nodes = json.loads((seed / 'node_map.json').read_text(encoding='utf-8'))
    cameras = json.loads((seed / 'cameras.json').read_text(encoding='utf-8'))
    clusters = {row['node_id']: row['cluster_id'] for row in nodes}
    assert len(clusters) == len(nodes)
    associations = {row['camera_id']: row['node_id'] for row in cameras}
    assert len(cameras) == len(associations) == 10
    officer = hdr(client, 'officer1')

    def check(links, case):
        snapshot = good(client.get(SNAPSHOT, headers=officer))
        assert snapshot['station']['status'] == 'missing'
        expected = {camera_id: clusters[node_id] for camera_id, node_id in links.items()}
        assert all(expected.values()), expected
        actual = {row['camera_id']: row['junction_id'] for row in snapshot['cameras']}
        assert len(snapshot['cameras']) == len(actual) == 10
        assert actual == expected, case

    check(associations, 'Mapping camera theo nguồn')
    first = next(iter(associations))
    second = next(camera for camera, node in associations.items()
                  if clusters[node] != clusters[associations[first]])
    swapped = {**associations, first: associations[second], second: associations[first]}
    # Đổi hai liên kết trong SQLite riêng của ca này. Tổng số camera và tập cụm không đổi.
    with sqlite3.connect(os.environ['SMART_DB_PATH']) as conn:
        conn.executemany('UPDATE cameras SET node_id=? WHERE camera_id=?',
                         [(node, camera) for camera, node in swapped.items() if node != associations[camera]])
    check(swapped, 'Mapping camera phải đổi theo node_id')


def test_r7_local_frame_notifies_committed_snapshot_and_stream(client):
    user = hdr(client, 'officer1')
    lease = claim_station(client)
    creds = capability_headers(lease)
    before = good(client.get(SNAPSHOT, headers=user))
    original_camera = next(c for c in before['cameras'] if c['camera_id'] == CAMERA)
    assert original_camera['frame_id'] is None and original_camera['status'] == 'missing'
    raw, payload = frame('frame-committed', 41)
    receipts = []

    def at_wire_send(event):
        if event['event'] == 'snapshot.updated':
            # Một GET khác đọc dữ liệu ngay lúc event ra wire.
            snapshot = good(client.get(SNAPSHOT, headers=user))
            media = client.get(STREAM, headers=user)
            receipts.append((snapshot, media.status_code, media.content))

    with station_socket(client, tok(client, 'officer1'), on_send=at_wire_send) as (officer, _):
        with station_socket(client, lease['capability']) as (station, _):
            ws_ready(officer, station)
        good(post(client, 'frames', creds, json=payload))
        messages = [ws_event(officer)]
        remaining = receive_ws(officer, timeout=0.25)
        if remaining is not None:
            assert remaining['type'] == 'websocket.send', remaining
            messages.append(json.loads(remaining['text']))

    after = good(client.get(SNAPSHOT, headers=user))
    updated = next(c for c in after['cameras'] if c['camera_id'] == CAMERA)
    assert (updated['status'], updated['frame_id'], updated['captured_at'], updated['width'], updated['height']) == (
        'ready', payload['frame_id'], CAPTURED, 16, 9)
    assert updated['junction_id'] == original_camera['junction_id']
    assert client.get(STREAM, headers=user).content == raw
    events = {msg['event']: msg['data'] for msg in messages}
    assert events.get('stream.updated') == {'camera_id': CAMERA, 'seq': 41}
    assert {'new_revision': after['revision'] > before['revision'], 'snapshot_event': events.get('snapshot.updated')} == {
        'new_revision': True, 'snapshot_event': {'snapshot_version': 'public-demo-v1', 'revision': after['revision']},
    }
    assert receipts == [(after, 200, raw)]
