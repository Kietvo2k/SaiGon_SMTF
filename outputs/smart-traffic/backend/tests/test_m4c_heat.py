import asyncio
import json
from pathlib import Path

import pytest

from app import heat
from app.schemas import HeatIn
from app.ws import _wanted

# Dữ liệu tên đường dùng chung với web (web/public/north-roads-32.json, xuất bởi scripts/export_north_roads_32.py).
ROAD_FILE = Path(__file__).resolve().parents[2] / 'web' / 'public' / 'north-roads-32.json'
PUBLIC_KEYS = {'name', 'level', 'level_label', 'prob_pct', 'horizon_min'}


@pytest.fixture(autouse=True)
def _reset_heat_state():
    heat.reset()
    yield
    heat.reset()


def token_headers(client, username):
    r = client.post('/api/v1/auth/login', json={'username': username, 'password': 'SaiGon@2026'})
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


def named_edge():
    doc = json.loads(ROAD_FILE.read_text(encoding='utf-8'))
    edge = next(e for e in doc['edges'] if e['name'])
    return edge['edge'], edge['name']


def heat_body(t=0, levels=None, alerts=None, **extra):
    return {'t_sim': t, 'levels': [[1, 0.85], [2, 0.5]] if levels is None else levels,
            'alerts': [] if alerts is None else alerts, **extra}


def alert(edge=1, prob=0.8, reliability=0.7, horizon_min=15, level=0.9):
    return {'edge': edge, 'prob': prob, 'reliability': reliability, 'horizon_min': horizon_min, 'level': level}


def test_station_heat_is_read_back_by_officer_with_names_and_hourly(client):
    st = token_headers(client, 'station-3d')
    of = token_headers(client, 'officer1')
    edge, name = named_edge()
    r = client.post('/api/v1/station/heat', headers=st,
                    json=heat_body(t=3600 * 9 + 30, levels=[[edge, 0.85], [edge + 1, 0.45]],
                                   alerts=[alert(edge=edge, prob=0.8)]))
    assert r.status_code == 200, r.text
    assert r.json() == {'ok': True, 'saved': True, 'new_alerts': 1}
    view = client.get('/api/v1/officer/heat', headers=of).json()
    assert view['t_sim'] == 32430 and view['stale'] is False
    assert [edge, 0.85] in view['levels']
    assert view['alerts'][0]['name'] == name
    assert view['alerts'][0]['prob'] == 0.8 and view['alerts'][0]['band'] == 4
    assert len(view['hourly']) == 24
    assert view['hourly'][9]['samples'] == 1
    assert view['hourly'][9]['mean_level'] == pytest.approx(0.65)
    assert view['hourly'][10]['samples'] == 0 and view['hourly'][10]['mean_level'] is None
    assert view['history_count'] == 1


def test_heat_roles_station_writes_and_officer_roles_read_only(client):
    # Mỗi tài khoản đăng nhập đúng một lần (giới hạn đăng nhập 5 lần/phút/IP).
    tokens = {u: token_headers(client, u) for u in ('station-3d', 'officer1', 'commander1', 'admin1', 'citizen1')}
    assert client.post('/api/v1/station/heat', json=heat_body()).status_code == 401
    assert client.post('/api/v1/station/heat', headers=tokens['officer1'], json=heat_body()).status_code == 403
    assert client.get('/api/v1/officer/heat').status_code == 401
    assert client.get('/api/v1/officer/heat', headers=tokens['station-3d']).status_code == 403
    assert client.get('/api/v1/officer/heat', headers=tokens['citizen1']).status_code == 403
    for user in ('officer1', 'commander1', 'admin1'):
        assert client.get('/api/v1/officer/heat', headers=tokens[user]).status_code == 200


@pytest.mark.parametrize('body', [
    heat_body(t=-1),
    heat_body(levels=[[1, 1.5]]),
    heat_body(levels=[[-1, 0.5]]),
    heat_body(levels=[[1]]),
    heat_body(levels=[[i, 0.5] for i in range(5001)]),
    heat_body(alerts=[alert(prob=1.2)]),
    heat_body(alerts=[{'edge': 1, 'prob': 0.8}]),
    heat_body(alerts=[alert() for _ in range(5001)]),
    {'levels': [], 'alerts': []},
])
def test_heat_rejects_bad_shape_with_unified_error(client, body):
    r = client.post('/api/v1/station/heat', headers=token_headers(client, 'station-3d'), json=body)
    assert r.status_code == 422, r.text
    assert r.json()['error']['code'] == 'VALIDATION'


def test_heat_accepts_exactly_5000_levels(client):
    r = client.post('/api/v1/station/heat', headers=token_headers(client, 'station-3d'),
                    json=heat_body(levels=[[i, 0.5] for i in range(5000)]))
    assert r.status_code == 200, r.text


def test_snapshot_every_5_min_sim_and_keep_288(client):
    def count():
        from app.db import connect
        with connect() as conn:
            return conn.execute('SELECT COUNT(*) AS n FROM heat_snapshots').fetchone()['n']

    async def run(times):
        for t in times:
            await heat.ingest(HeatIn(t_sim=t, levels=[[1, 0.5]]))

    asyncio.run(run([0, 60, 299.0]))
    assert count() == 1
    asyncio.run(run([300.0]))
    assert count() == 2
    asyncio.run(run([300.0 + 300 * i for i in range(1, 320)]))
    assert count() == heat.SNAPSHOT_KEEP == 288
    from app.db import connect
    with connect() as conn:
        assert conn.execute('SELECT MAX(t_sim) AS m FROM heat_snapshots').fetchone()['m'] == 300 + 300 * 319


def test_public_alerts_show_only_name_level_rounded_prob_and_horizon(client):
    assert client.get('/api/v1/public/alerts').json()['items'] == []
    edge, name = named_edge()
    st = token_headers(client, 'station-3d')
    client.post('/api/v1/station/heat', headers=st, json=heat_body(
        levels=[[edge, 0.9]], alerts=[alert(edge=edge, prob=0.8, reliability=0.66, horizon_min=14.6, level=0.9),
                                      alert(edge=edge + 1, prob=0.5)]))
    r = client.get('/api/v1/public/alerts')
    assert r.status_code == 200
    body = r.json()
    assert body['total'] == 1 and len(body['items']) == 1
    item = body['items'][0]
    assert set(item) == PUBLIC_KEYS
    assert item == {'name': name, 'level': 4, 'level_label': 'Kẹt nặng', 'prob_pct': 80, 'horizon_min': 15}
    for leaked in ('reliability', 'edge', 't_sim', 'levels', 'owner', 'plate'):
        assert leaked not in r.text


def test_public_alerts_expire_when_station_goes_silent(client):
    edge, _ = named_edge()
    client.post('/api/v1/station/heat', headers=token_headers(client, 'station-3d'),
                json=heat_body(alerts=[alert(edge=edge, prob=0.9)]))
    assert len(client.get('/api/v1/public/alerts').json()['items']) == 1
    heat._STATE['latest']['received_ts'] -= heat.ALERT_TTL_S + 5
    assert client.get('/api/v1/public/alerts').json()['items'] == []
    stale = client.get('/api/v1/officer/heat', headers=token_headers(client, 'officer1')).json()
    assert stale['stale'] is True


def test_unknown_edge_gets_default_name_and_survives_restart(client):
    client.post('/api/v1/station/heat', headers=token_headers(client, 'station-3d'),
                json=heat_body(levels=[[999999, 0.7]], alerts=[alert(edge=999999, prob=0.7)]))
    heat.reset()   # như khi máy chủ khởi động lại: bộ nhớ trống, dữ liệu lấy từ lịch sử trong DB
    view = client.get('/api/v1/officer/heat', headers=token_headers(client, 'officer1')).json()
    assert view['levels'] == [[999999, 0.7]]
    assert view['alerts'][0]['name'] == heat.UNNAMED_ROAD
    assert client.get('/api/v1/public/alerts').json()['items'][0]['name'] == heat.UNNAMED_ROAD


def test_ws_heat_update_only_to_officers_and_alert_to_both(client):
    st = token_headers(client, 'station-3d')
    otok = client.post('/api/v1/auth/login', json={'username': 'officer1', 'password': 'SaiGon@2026'}).json()['access_token']
    ctok = client.post('/api/v1/auth/login', json={'username': 'citizen1', 'password': 'SaiGon@2026'}).json()['access_token']
    edge, _ = named_edge()
    with client.websocket_connect('/ws/v1') as officer:
        officer.send_text(json.dumps({'type': 'auth', 'token': otok}))
        with client.websocket_connect('/ws/v1') as citizen:
            citizen.send_text(json.dumps({'type': 'auth', 'token': ctok}))
            r = client.post('/api/v1/station/heat', headers=st,
                            json=heat_body(levels=[[edge, 0.9]], alerts=[alert(edge=edge, prob=0.8)]))
            assert r.status_code == 200, r.text
            m1 = json.loads(officer.receive_text())
            assert m1['event'] == 'heat.update' and m1['data']['levels'] == [[edge, 0.9]]
            m2 = json.loads(officer.receive_text())
            assert m2['event'] == 'alert.congestion' and m2['data']['prob'] == 0.8 and 'reliability' in m2['data']
            # Công dân: nhận cảnh báo công khai, KHÔNG nhận heat.update (gói đầu tiên của họ phải là alert.congestion).
            c1 = json.loads(citizen.receive_text())
            assert c1['event'] == 'alert.congestion'
            assert set(c1['data']) == PUBLIC_KEYS
            # Cảnh báo dưới ngưỡng 0,6 không tạo alert.congestion; cán bộ chỉ nhận heat.update.
            client.post('/api/v1/station/heat', headers=st,
                        json=heat_body(levels=[[edge, 0.9]], alerts=[alert(edge=edge + 1, prob=0.5)]))
            m3 = json.loads(officer.receive_text())
            assert m3['event'] == 'heat.update'


def test_ws_recipient_rule_excludes_station_and_citizen_for_heat_roles():
    from app.heat import OFFICER_ROLES
    assert _wanted({'role': 'officer', 'username': 'o'}, OFFICER_ROLES, None)
    assert _wanted({'role': 'admin', 'username': 'a'}, OFFICER_ROLES, None)
    assert not _wanted({'role': 'station', 'username': 's'}, OFFICER_ROLES, None)
    assert not _wanted({'role': 'citizen', 'username': 'c'}, OFFICER_ROLES, None)
