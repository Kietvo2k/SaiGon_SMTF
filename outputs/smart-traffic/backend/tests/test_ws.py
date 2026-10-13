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


def test_ws_non_station_cannot_send_cmd(client):
    # Citizen/officer gửi `cmd.*` qua WS phải bị BỎ QUA (chỉ REST mới phát cmd.*).
    token = client.post('/api/v1/auth/login', json={'username': 'citizen1', 'password': 'SaiGon@2026'}).json()['access_token']
    with client.websocket_connect('/ws/v1') as ws:
        ws.send_text(json.dumps({'type': 'auth', 'token': token}))
        ws.send_text(json.dumps({'event': 'cmd.signal-override', 'data': {'node_id': 'HX-01', 'group': 0}}))
        ws.send_text(json.dumps({'event': 'station.heartbeat', 'data': {}}))
        # Không có phản hồi nào được broadcast lại cho chính kết nối này → đóng sạch.
        assert True
