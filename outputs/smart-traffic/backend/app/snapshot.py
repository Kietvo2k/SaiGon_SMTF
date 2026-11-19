import json
import os
import time
from datetime import datetime

VERSION = 'public-demo-v1'


def get_state(conn, key, default=None):
    row = conn.execute('SELECT payload_json FROM traffic_state WHERE id=?', (key,)).fetchone()
    return json.loads(row['payload_json']) if row else default


def put_state(conn, key, value):
    conn.execute('INSERT INTO traffic_state (id,payload_json,revision) VALUES (?,?,0) '
                 'ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json',
                 (key, json.dumps(value, ensure_ascii=False, allow_nan=False)))


def bump(conn):
    conn.execute("INSERT INTO traffic_state (id,payload_json,revision) VALUES ('revision','null',1) "
                 'ON CONFLICT(id) DO UPDATE SET revision=revision+1')
    return conn.execute("SELECT revision FROM traffic_state WHERE id='revision'").fetchone()['revision']


def controls(conn):
    value = get_state(conn, 'controls', {'mode': 'fixed', 'overrides': [], 'scenario': None, 'signals': []})
    now = time.time()
    value['overrides'] = [o for o in value['overrides'] if _override_active(o, now)]
    return value


def _override_active(override, now):
    if override.get('until_epoch') is not None:
        return override['until_epoch'] > now
    try:
        until = datetime.fromisoformat(override['until_at'].replace('Z', '+00:00'))
    except (KeyError, AttributeError, ValueError):
        return True
    return until.timestamp() > now


def read_snapshot(conn):
    value = get_state(conn, 'snapshot')
    if value is None:
        last = conn.execute('SELECT * FROM kpi_samples ORDER BY id DESC LIMIT 1').fetchone()
        cameras = conn.execute(
            'SELECT c.camera_id, n.cluster_id, c.label FROM cameras c '
            'LEFT JOIN signal_nodes n ON n.node_id=c.node_id')
        value = {
            'simulation': {'seed': None, 'scenario': 'none', 'mode': last['mode'] if last else 'fixed',
                           't_sim': last['t_sim'] if last else 0, 'paused': False},
            'junctions': [], 'routes': [],
            'kpi': {k: (last[k] if last and k in last.keys() else 0) for k in
                    ('wait_avg_s', 'queue_max', 'flow_per_min', 'trips_completed', 'admission_wait', 'recoveries')},
            'cameras': [{'camera_id': c['camera_id'], 'junction_id': c['cluster_id'], 'label': c['label'],
                         'frame_id': None, 'source': 'live', 'status': 'missing', 'captured_at': None,
                         'width': None, 'height': None} for c in cameras]}
    row = conn.execute("SELECT * FROM station_leases WHERE id='station'").fetchone()
    alive = row is not None and row['expires_at'] > time.time()
    revision = conn.execute("SELECT revision FROM traffic_state WHERE id='revision'").fetchone()
    value.update(snapshot_version=VERSION, revision=revision['revision'] if revision else 0,
                 build_id=os.environ.get('SMART_BUILD_ID', 'local'),
                 station={'status': 'active' if alive else 'stale' if row else 'missing',
                          'id': row['station_id'] if row else None, 'last_seen_at': row['last_seen_at'] if row else None})
    value['cameras'] = [{**c, 'status': 'missing' if not c.get('frame_id') else c.get('status', 'ready') if alive else 'stale'}
                        for c in value.get('cameras', [])]
    return value


def snapshot_event(conn):
    return ('snapshot.updated', {'snapshot_version': VERSION, 'revision': bump(conn)})
