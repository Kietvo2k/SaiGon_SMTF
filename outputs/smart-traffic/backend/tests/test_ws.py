from tests.m6_helpers import tok
from tests.public_demo_helpers import receive_ws, station_socket, ws_event


def test_ws_requires_auth_within_5s(client):
    with client, client.websocket_connect('/ws/v1') as ws:
        close = receive_ws(ws, timeout=6)
        assert close is not None, 'WS không gửi close sau hạn xác thực 5 giây'
        assert close['type'] == 'websocket.close' and close['code'] == 4401, close


def test_ws_auth_then_station_event_broadcast(client):
    # Trạm phát event → web công an nhận; trạm KHÔNG tự nhận lại event của mình.
    # Dùng cùng portal của TestClient để bản tin đi giữa các socket trên cùng event loop.
    with client:
        stoken = tok(client, 'station-3d')
        otoken = tok(client, 'officer1')
        with station_socket(client, otoken) as (officer, _), station_socket(client, stoken) as (station, _):
            payload = {'station_id': 'STATION-3D-01', 'fps': 60}
            station.send_json({'event': 'station.heartbeat', 'data': payload})
            msg = ws_event(officer)
            assert msg['event'] == 'station.heartbeat'
            assert 'seq' in msg and 't' in msg
            assert msg['data'] == payload
            assert receive_ws(station, timeout=0.25) is None, 'Trạm nhận lại heartbeat của mình'


def test_ws_allowlist_real_observer_officer_gets_nothing_from_citizen_or_station_cmd(client):
    # Observer officer KHÔNG được nhận gì khi citizen/station gửi cmd.* hoặc heartbeat giả.
    # Kiểm thật (không `assert True`): sau các gói sai, chỉ event heartbeat HỢP LỆ của trạm mới tới officer.
    with client:
        ctok = tok(client, 'citizen1')
        otok = tok(client, 'officer1')
        stok = tok(client, 'station-3d')
        cmd = {'event': 'cmd.signal-override', 'data': {'node_id': 'HX-01', 'group': 0}}
        with station_socket(client, otok) as (officer, _):
            with station_socket(client, ctok) as (citizen, _):
                citizen.send_json(cmd)
                citizen.send_json({'event': 'station.heartbeat', 'data': {'marker': 'citizen'}})
                # Đợi xử lý hết hai gói trước khi trạm gửi heartbeat hợp lệ.
                citizen.close()
                close = receive_ws(citizen)
                assert close is not None and close['type'] == 'websocket.close', close
            with station_socket(client, stok) as (station, _):
                station.send_json(cmd)
                station.send_json({'event': 'station.heartbeat', 'data': {'marker': 'station'}})
                msg = ws_event(officer)
                assert msg['event'] == 'station.heartbeat'
                assert msg['data']['marker'] == 'station'
                assert receive_ws(officer, timeout=0.25) is None, 'Cán bộ nhận thêm gói ngoài allowlist'
