"""M6c: điều khiển thủ công (kịch bản, VMS, trạng thái đèn) trên REST + WS.

Vai trò: chỉ commander/admin ghi (kịch bản, VMS, ghi đè pha); officer chỉ đọc trạng thái.
Mọi lệnh ghi phải có audit và phát `cmd.*` tới trạm (WS, to_roles=station).
"""
import json

from app.vms import clean_text
from tests.m6_helpers import hdr


def _ws_auth(sock, token):
    sock.send_text(json.dumps({'type': 'auth', 'token': token}))


def _station_metrics(client, **over):
    body = {'station_id': 'STATION-3D-01', 't': '2026-10-16T02:00:00Z', 't_sim': 100.0, 'fps': 58.0,
            'kpi': {'wait_avg_s': 10.0, 'queue_max': 4, 'flow_per_min': 30.0}, 'signal_mode': 'smart'}
    body.update(over)
    r = client.post('/api/v1/station/metrics', headers=hdr(client, 'station-3d'), json=body)
    assert r.status_code == 200, r.text


def _put_vms(client, vms_id, **body):
    return client.put(f'/api/v1/officer/vms/{vms_id}', headers=hdr(client, 'commander1'), json=body)


# ---------- Kịch bản ----------

def test_scenario_write_requires_commander_or_admin(client):
    oh = hdr(client, 'officer1')
    assert client.post('/api/v1/officer/controls/scenario', headers=oh, json={'scenario': 'lane-block'}).status_code == 403
    assert client.post('/api/v1/officer/controls/scenario', headers=hdr(client, 'station-3d'),
                       json={'scenario': 'lane-block'}).status_code == 403
    assert client.post('/api/v1/officer/controls/scenario', headers=hdr(client, 'commander1'),
                       json={'scenario': 'lane-block'}).status_code == 200


def test_scenario_start_state_audit_then_stop(client):
    ch = hdr(client, 'commander1')
    r = client.post('/api/v1/officer/controls/scenario', headers=ch, json={'scenario': 'peak-hang-xanh'})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['ok'] is True and body['scenario'] == 'peak-hang-xanh'
    assert body['scenario_id'].startswith('SC-')
    st = client.get('/api/v1/officer/controls/state', headers=hdr(client, 'officer1')).json()
    assert st['scenario']['key'] == 'peak-hang-xanh' and st['scenario']['scenario_id'] == body['scenario_id']
    # Ghi nhật ký thao tác có mã kịch bản.
    audit = client.get(f"/api/v1/officer/audit?target_id={body['scenario_id']}", headers=ch).json()['items']
    assert audit and audit[0]['action'] == 'scenario' and audit[0]['to_state'] == 'peak-hang-xanh'
    # 'none' dừng kịch bản đang chạy.
    stop = client.post('/api/v1/officer/controls/scenario', headers=ch, json={'scenario': 'none'})
    assert stop.status_code == 200 and stop.json()['scenario_id'] is None
    assert client.get('/api/v1/officer/controls/state', headers=hdr(client, 'officer1')).json()['scenario'] is None


def test_scenario_only_one_active_run(client):
    ch = hdr(client, 'commander1')
    first = client.post('/api/v1/officer/controls/scenario', headers=ch, json={'scenario': 'flood-nhc'}).json()
    second = client.post('/api/v1/officer/controls/scenario', headers=ch, json={'scenario': 'priority-run'}).json()
    assert first['scenario_id'] != second['scenario_id']
    st = client.get('/api/v1/officer/controls/state', headers=hdr(client, 'officer1')).json()
    assert st['scenario']['key'] == 'priority-run'


def test_scenario_rejects_unknown_key_extra_fields_and_big_params(client):
    ch = hdr(client, 'commander1')
    url = '/api/v1/officer/controls/scenario'
    assert client.post(url, headers=ch, json={'scenario': 'boom'}).status_code == 422
    assert client.post(url, headers=ch, json={'scenario': 'none', 'key': 'x'}).status_code == 422
    assert client.post(url, headers=ch, json={'scenario': 'lane-block', 'params': {'x': 'a' * 5000}}).status_code == 422


def test_scenario_relayed_only_to_station_over_ws(client):
    ch = hdr(client, 'commander1')
    stok = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()['access_token']
    otok = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()['access_token']
    with client.websocket_connect('/ws/v1') as officer:
        _ws_auth(officer, otok)
        with client.websocket_connect('/ws/v1') as station:
            _ws_auth(station, stok)
            r = client.post('/api/v1/officer/controls/scenario', headers=ch,
                            json={'scenario': 'lane-block', 'params': {'lane': 2}})
            assert r.status_code == 200, r.text
            msg = json.loads(station.receive_text())
            assert msg['event'] == 'cmd.scenario'
            assert msg['data'] == {'key': 'lane-block', 'params': {'lane': 2}, 'scenario_id': r.json()['scenario_id']}
            # Cán bộ KHÔNG nhận cmd.*: gói kế tiếp của cán bộ phải là heartbeat do trạm gửi sau đó.
            station.send_text(json.dumps({'event': 'station.heartbeat', 'data': {'marker': 'after-cmd'}}))
            nxt = json.loads(officer.receive_text())
            assert nxt['event'] == 'station.heartbeat' and nxt['data']['marker'] == 'after-cmd'


# ---------- VMS ----------

def test_vms_write_requires_commander_and_known_id(client):
    oh = hdr(client, 'officer1')
    r = client.put('/api/v1/officer/vms/VMS-01', headers=oh, json={'text': 'x', 'mode': 'manual'})
    assert r.status_code == 403
    assert _put_vms(client, 'VMS-09', text='Ùn tắc', mode='manual').status_code == 422
    assert _put_vms(client, 'VMS-01', text='Ùn tắc', mode='manual').status_code == 200


def test_vms_text_rules_manual_needs_text_max_60_and_control_chars(client):
    assert _put_vms(client, 'VMS-01', text='', mode='manual').status_code == 422
    assert _put_vms(client, 'VMS-01', text='   ', mode='manual').status_code == 422
    assert _put_vms(client, 'VMS-01', text='a' * 61, mode='manual').status_code == 422
    assert _put_vms(client, 'VMS-01', text='a' * 60, mode='manual').status_code == 200
    r = _put_vms(client, 'VMS-02', text='Ùn\x00 tắc\n phía\ttrước', mode='manual')
    assert r.status_code == 200, r.text
    assert r.json()['text'] == 'Ùn tắc phía trước'
    # Chế độ tự động: trả quyền về hệ thống, bỏ nội dung cũ.
    auto = _put_vms(client, 'VMS-02', text='bỏ qua', mode='auto')
    assert auto.status_code == 200 and auto.json()['mode'] == 'auto' and auto.json()['text'] == ''


def test_vms_list_merges_officer_setting_with_station_report(client):
    assert _put_vms(client, 'VMS-01', text='Ùn tắc phía trước', mode='manual').status_code == 200
    items = client.get('/api/v1/officer/vms', headers=hdr(client, 'officer1')).json()['items']
    assert [i['vms_id'] for i in items] == ['VMS-01', 'VMS-02', 'VMS-03', 'VMS-04']
    v1 = items[0]
    assert v1['text'] == 'Ùn tắc phía trước' and v1['mode'] == 'manual' and v1['set_by'] == 'commander1'
    assert v1['shown'] is None   # trạm chưa báo
    _station_metrics(client, vms=[{'vms_id': 'VMS-01', 'text': 'Nên rẽ Bạch Đằng', 'mode': 'manual'},
                                  {'vms_id': 'VMS-09', 'text': 'bỏ', 'mode': 'manual'}])
    items = client.get('/api/v1/officer/vms', headers=hdr(client, 'officer1')).json()['items']
    assert items[0]['shown'] == 'Nên rẽ Bạch Đằng' and items[0]['shown_mode'] == 'manual'
    assert items[0]['reported_at'] and items[1]['shown'] is None
    assert all(i['vms_id'] != 'VMS-09' for i in items)
    # Trạm báo danh sách rỗng → xóa trạng thái đã báo.
    _station_metrics(client, vms=[])
    assert client.get('/api/v1/officer/vms', headers=hdr(client, 'officer1')).json()['items'][0]['shown'] is None


def test_vms_put_audited_and_relayed_to_station(client):
    ch = hdr(client, 'commander1')
    stok = client.post('/api/v1/auth/login', json={'username': 'station-3d', 'password': 'SaiGon@2026'}).json()['access_token']
    otok = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()['access_token']
    with client.websocket_connect('/ws/v1') as officer:
        _ws_auth(officer, otok)
        with client.websocket_connect('/ws/v1') as station:
            _ws_auth(station, stok)
            assert _put_vms(client, 'VMS-02', text='Đường Nguyễn Hữu Cảnh ngập', mode='manual').status_code == 200
            msg = json.loads(station.receive_text())
            assert msg['event'] == 'cmd.vms'
            assert msg['data']['vms_id'] == 'VMS-02' and msg['data']['text'] == 'Đường Nguyễn Hữu Cảnh ngập'
            assert msg['data']['mode'] == 'manual' and msg['data']['lines'] == ['Đường Nguyễn Hữu Cảnh ngập']
            station.send_text(json.dumps({'event': 'station.heartbeat', 'data': {'marker': 'after-vms'}}))
            assert json.loads(officer.receive_text())['data']['marker'] == 'after-vms'
    audit = client.get('/api/v1/officer/audit?target_id=VMS-02', headers=ch).json()['items']
    assert audit and audit[0]['action'] == 'vms' and audit[0]['actor'] == 'commander1'


# ---------- Trạng thái đèn và đọc chung ----------

def test_controls_state_lists_signal_nodes_with_latest_phase(client):
    _station_metrics(client, signal_states=[
        {'node_id': 'HX-01', 'cluster_id': 'HX-C1', 't_sim': 98.0, 'phase': 'red', 'group': 1, 'mode': 'smart'},
        {'node_id': 'HX-01', 'cluster_id': 'HX-C1', 't_sim': 100.0, 'phase': 'green', 'group': 0, 'mode': 'smart'},
    ])
    st = client.get('/api/v1/officer/controls/state', headers=hdr(client, 'officer1')).json()
    by_id = {s['node_id']: s for s in st['signals']}
    assert set(by_id) >= {'HX-01', 'HX-02', 'HX-06'}
    assert by_id['HX-01']['phase'] == 'green' and by_id['HX-01']['group'] == 0    # bản ghi MỚI NHẤT
    assert by_id['HX-01']['label'] and by_id['HX-01']['cluster_id'] == 'HX-C1'
    assert by_id['HX-02']['phase'] is None                                         # chưa có trạng thái


def test_controls_state_includes_overrides_and_mode(client):
    ch = hdr(client, 'commander1')
    assert client.post('/api/v1/officer/controls/signal-override', headers=ch,
                       json={'node_id': 'HX-01', 'group': 1, 'duration_s': 30, 'reason': 'thử'}).status_code == 200
    st = client.get('/api/v1/officer/controls/state', headers=hdr(client, 'officer1')).json()
    ov = [o for o in st['overrides'] if o['node_id'] == 'HX-01']
    assert ov and ov[0]['group'] == 1 and ov[0]['until_at'].endswith('Z')
    assert st['mode'] in ('fixed', 'smart')


def test_officer_reads_controls_and_vms_but_cannot_write(client):
    oh = hdr(client, 'officer1')
    assert client.get('/api/v1/officer/controls/state', headers=oh).status_code == 200
    assert client.get('/api/v1/officer/vms', headers=oh).status_code == 200
    assert client.post('/api/v1/officer/controls/signal-mode', headers=oh, json={'mode': 'smart'}).status_code == 403
    assert client.post('/api/v1/officer/controls/signal-override', headers=oh,
                       json={'node_id': 'HX-01', 'group': 0, 'duration_s': 10}).status_code == 403


def test_clean_text_removes_control_and_format_chars_and_collapses_spaces():
    assert clean_text('  Ùn\x00 tắc\n\n phía\ttrước  ') == 'Ùn tắc phía trước'
    assert clean_text('ab​cd') == 'abcd'    # ký tự định dạng vô hình (Cf) bị bỏ
    assert clean_text('') == ''


def test_legacy_vms_table_is_renamed_not_dropped(tmp_path):
    # DB dev tạo từ M1 có bảng vms_messages lược đồ cũ: init_db đổi tên (giữ dữ liệu), tạo lại lược đồ mới.
    import sqlite3
    from app.db import init_db
    conn = sqlite3.connect(tmp_path / 'legacy.db')
    conn.row_factory = sqlite3.Row
    conn.execute('CREATE TABLE vms_messages (id TEXT PRIMARY KEY, vms_id TEXT, lines_json TEXT, ttl_s INTEGER, '
                 'active INTEGER, created_by INTEGER, created_at TEXT)')
    conn.execute("INSERT INTO vms_messages (id, vms_id, lines_json) VALUES ('X1', 'VMS-01', '[]')")
    conn.commit()
    init_db(conn)
    cols = {r['name'] for r in conn.execute('PRAGMA table_info(vms_messages)')}
    assert {'text', 'mode', 'set_by', 'set_at'} <= cols and 'lines_json' not in cols
    assert conn.execute('SELECT COUNT(*) AS n FROM vms_messages_m1').fetchone()['n'] == 1
    conn.close()
