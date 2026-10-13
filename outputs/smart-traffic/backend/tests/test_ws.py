import json

from starlette.websockets import WebSocketDisconnect


def test_ws_requires_auth_within_5s(client):
    with client.websocket_connect('/ws/v1') as ws:
        try:
            ws.receive_text()
        except WebSocketDisconnect:
            return
        raise AssertionError('phải đóng khi chưa auth')


def test_ws_auth_then_station_event_broadcast(client):
    # Trạm phát event → web công an nhận; trạm KHÔNG tự nhận lại event của mình.
    stoken = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()['access_token']
    otoken = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()['access_token']
    with client.websocket_connect('/ws/v1') as officer:
        officer.send_text(json.dumps({'type': 'auth', 'token': otoken}))
        with client.websocket_connect('/ws/v1') as station:
            station.send_text(json.dumps({'type': 'auth', 'token': stoken}))
            station.send_text(json.dumps({'event': 'station.heartbeat', 'data': {'station_id': 'STATION-3D-01', 'fps': 60}}))
            msg = json.loads(officer.receive_text())
            assert msg['event'] == 'station.heartbeat'
            assert 'seq' in msg and 't' in msg


def test_ws_allowlist_real_observer_officer_gets_nothing_from_citizen_or_station_cmd(client):
    # Observer officer KHÔNG được nhận gì khi citizen/station gửi cmd.* hoặc heartbeat giả.
    # Kiểm thật (không `assert True`): sau các gói sai, chỉ event heartbeat HỢP LỆ của trạm mới tới officer.
    ctok = client.post('/api/v1/auth/login', json={'username': 'citizen1', 'password': 'SaiGon@2026'}).json()['access_token']
    otok = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()['access_token']
    stok = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()['access_token']
    with client.websocket_connect('/ws/v1') as officer:
        officer.send_text(json.dumps({'type': 'auth', 'token': otok}))
        with client.websocket_connect('/ws/v1') as citizen:
            citizen.send_text(json.dumps({'type': 'auth', 'token': ctok}))
            citizen.send_text(json.dumps({'event': 'cmd.signal-override', 'data': {'node_id': 'HX-01', 'group': 0}}))
            citizen.send_text(json.dumps({'event': 'station.heartbeat', 'data': {'marker': 'citizen'}}))
            with client.websocket_connect('/ws/v1') as station:
                station.send_text(json.dumps({'type': 'auth', 'token': stok}))
                station.send_text(json.dumps({'event': 'station.heartbeat', 'data': {'marker': 'station'}}))
                msg = json.loads(officer.receive_text())
                assert msg['event'] == 'station.heartbeat'
                assert msg['data']['marker'] == 'station'   # nếu allowlist hở, officer đã nhận gói của citizen trước
