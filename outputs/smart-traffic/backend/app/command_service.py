"""Lệnh v1: lease fenced, dequeue một lần và terminal bền vững theo đồng hồ thực."""
import hashlib
import json
import math
import secrets
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from app import audit
from app.db import connect
from app.errors import err
from app.snapshot import controls, get_state, put_state, read_snapshot, snapshot_event

LEASE_S = 6
COMMAND_S = 10
READERS = ['officer', 'commander', 'admin']


def iso(value=None):
    return datetime.fromtimestamp(time.time() if value is None else value, timezone.utc).isoformat().replace('+00:00', 'Z')


def failure(status, code, message):
    raise HTTPException(status_code=status, detail=err(code, message))


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def require_lease(conn, capability):
    row = conn.execute("SELECT * FROM station_leases WHERE id='station'").fetchone()
    if not row or not capability or row['capability_hash'] != _hash(capability) or row['expires_at'] <= time.time():
        failure(403, 'FORBIDDEN', 'Lease trạm đã hết hiệu lực')
    user = conn.execute('SELECT active,role FROM users WHERE username=?', (row['username'],)).fetchone()
    if not user or not user['active'] or user['role'] != 'station':
        failure(401, 'UNAUTHORIZED', 'Tài khoản trạm không hoạt động')
    return dict(row)


def guard_write(conn, claims):
    if claims.get('capability'):
        return require_lease(conn, claims['capability'])
    if conn.execute("SELECT 1 FROM station_leases WHERE id='station' AND expires_at>?", (time.time(),)).fetchone():
        failure(403, 'FORBIDDEN', 'Trạm đang hoạt động cần capability lease')
    return None


def station_claims(token):
    if token.startswith('station-'):
        with connect() as conn:
            lease = require_lease(conn, token)
        return {'sub': lease['username'], 'role': 'station', 'capability': token}
    from app.auth import decode_token
    claims = decode_token(token)
    if claims['role'] != 'station':
        failure(403, 'FORBIDDEN', 'Không đủ quyền trạm')
    return claims


def lease_view(row, capability):
    return {key: row[key] for key in ('station_id', 'owner_id', 'generation')} | {
        'expires_at': iso(row['expires_at']), 'capability': capability}


def claim(body, claims):
    now = time.time()
    token = 'station-' + secrets.token_urlsafe(32)
    with connect(immediate=True) as conn:
        old = conn.execute("SELECT * FROM station_leases WHERE id='station'").fetchone()
        if old and old['expires_at'] > now:
            failure(409, 'CONFLICT', 'Một tab trạm đang giữ lease')
        generation = old['generation'] + 1 if old else 1
        conn.execute("INSERT OR REPLACE INTO station_leases VALUES ('station',?,?,?,?,?,?,?)",
                     (body.station_id, body.owner_id, generation, _hash(token), claims['sub'], now + LEASE_S, iso(now)))
        row = conn.execute("SELECT * FROM station_leases WHERE id='station'").fetchone()
        event = snapshot_event(conn)
    return lease_view(row, token), [event]


def renew(token, release=False):
    with connect(immediate=True) as conn:
        row = require_lease(conn, token)
        now = time.time()
        conn.execute("UPDATE station_leases SET expires_at=?,last_seen_at=?,capability_hash=? WHERE id='station'",
                     (0 if release else now + LEASE_S, iso(now), None if release else _hash(token)))
        row.update(expires_at=0 if release else now + LEASE_S, last_seen_at=iso(now))
        events = [snapshot_event(conn)] if release else []
    return ({'ok': True} if release else lease_view(row, token)), events


def result(row):
    return {key: row[key] for key in ('command_id', 'status', 'reason_code', 'applied_t_sim')}


def expire(conn):
    events = []
    rows = conn.execute("SELECT * FROM traffic_commands WHERE status='pending' AND deadline_at<=?", (time.time(),)).fetchall()
    for row in rows:
        conn.execute("UPDATE traffic_commands SET status='expired',reason_code='COMMAND_EXPIRED' WHERE command_id=?", (row['command_id'],))
        data = result(dict(row) | {'status': 'expired', 'reason_code': 'COMMAND_EXPIRED'})
        audit.write(conn, actor='system', role='system', action='command.expired', target_type='command',
                    target_id=row['command_id'], to_state='expired', payload=data)
        events.append(('command.updated', data))
    return events


def audit_enqueue(conn, actor, event, data, payload, command_id):
    action = event.removeprefix('cmd.')
    target_type, target_id, to_state = 'signal', None, data.get('mode')
    if action == 'signal-override':
        target_id = data['node_id']
        to_state = 'cancel' if data['group'] is None else str(data['group'])
    elif action == 'scenario':
        target_type, target_id, to_state = 'scenario', data['scenario_id'], data['key']
    elif action == 'vms':
        target_type, target_id = 'vms', data['vms_id']
    audit.write(conn, actor=actor['sub'], role=actor['role'], action=action,
                target_type=target_type, target_id=target_id, to_state=to_state, reason=data.get('reason'),
                payload=payload | {'command_id': command_id, 'status': 'pending'})


def enqueue(*, actor, route, body, event, data, compatible):
    payload = {k: v for k, v in body.items() if k != 'command_id'}
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    command_id = body.get('command_id') or 'cmd-' + secrets.token_hex(16)
    with connect(immediate=True) as conn:
        events = expire(conn)
        old = conn.execute('SELECT * FROM traffic_commands WHERE command_id=?', (command_id,)).fetchone()
        if old:
            if old['actor'] != actor['sub'] or old['route'] != route or old['payload_json'] != encoded:
                failure(409, 'CONFLICT', 'command_id đã được dùng cho yêu cầu khác')
            return json.loads(old['compatible_json']) | result(old), events
        lease = conn.execute("SELECT * FROM station_leases WHERE id='station'").fetchone()
        if not lease or lease['expires_at'] <= time.time():
            failure(409, 'STATION_UNAVAILABLE', 'Mở trang 3D để chạy trạm')
        now = time.time()
        conn.execute('INSERT INTO traffic_commands (command_id,actor,route,payload_json,event,data_json,compatible_json,'
                     'station_id,owner_id,generation,status,created_at,deadline_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                     (command_id, actor['sub'], route, encoded, event, json.dumps(data, ensure_ascii=False),
                      json.dumps(compatible, ensure_ascii=False), lease['station_id'], lease['owner_id'], lease['generation'],
                      'pending', now, now + COMMAND_S))
        audit_enqueue(conn, actor, event, data, payload, command_id)
        row = conn.execute('SELECT * FROM traffic_commands WHERE command_id=?', (command_id,)).fetchone()
        events += [('command.updated', result(row)), (event, data | {'command_id': command_id})]
    return compatible | result(row), events


def pending(capability):
    with connect(immediate=True) as conn:
        lease = require_lease(conn, capability)
        events = expire(conn)
        rows = conn.execute("SELECT * FROM traffic_commands WHERE status='pending' AND delivered=0 AND station_id=? "
                            'AND owner_id=? AND generation=? ORDER BY created_at',
                            (lease['station_id'], lease['owner_id'], lease['generation'])).fetchall()
        commands = []
        for row in rows:
            conn.execute('UPDATE traffic_commands SET delivered=1 WHERE command_id=?', (row['command_id'],))
            commands.append({'command_id': row['command_id'], 'deadline_at': iso(row['deadline_at']),
                             'event': row['event'], 'data': json.loads(row['data_json'])})
    return {'commands': commands}, events


def read_command(command_id):
    with connect(immediate=True) as conn:
        events = expire(conn)
        row = conn.execute('SELECT * FROM traffic_commands WHERE command_id=?', (command_id,)).fetchone()
        if not row:
            failure(404, 'NOT_FOUND', 'Không có lệnh')
    return result(row), events


def acknowledge(capability, command_id, body):
    with connect(immediate=True) as conn:
        lease = require_lease(conn, capability)
        events = expire(conn)
        row = conn.execute('SELECT * FROM traffic_commands WHERE command_id=?', (command_id,)).fetchone()
        if not row:
            failure(404, 'NOT_FOUND', 'Không có lệnh')
        if any(row[k] != lease[k] for k in ('station_id', 'owner_id', 'generation')):
            failure(403, 'FORBIDDEN', 'Lệnh thuộc lease khác')
        if row['status'] != 'pending':
            return result(row), events
        if not row['delivered']:
            failure(409, 'CONFLICT', 'Trạm chưa nhận lệnh')
        if body.status == 'applied' and (body.applied_t_sim is None or not math.isfinite(body.applied_t_sim)):
            failure(422, 'VALIDATION', 'Thiếu applied_t_sim hợp lệ')
        code = (body.reason_code or 'COMMAND_REJECTED') if body.status == 'rejected' else None
        applied = body.applied_t_sim if body.status == 'applied' else None
        conn.execute('UPDATE traffic_commands SET status=?,reason_code=?,applied_t_sim=? WHERE command_id=?',
                     (body.status, code, applied, command_id))
        if body.status == 'applied':
            _apply(conn, row, applied)
            events.append(snapshot_event(conn))
        row = dict(row) | {'status': body.status, 'reason_code': code, 'applied_t_sim': applied}
        audit.write(conn, actor=lease['username'], role='station', action='command.' + body.status,
                    target_type='command', target_id=command_id, to_state=body.status, payload=result(row))
        events.append(('command.updated', result(row)))
    return result(row), events


def _apply(conn, row, applied_t_sim):
    data = json.loads(row['data_json'])
    state = controls(conn)
    snap = read_snapshot(conn)
    if row['event'] == 'cmd.signal-mode':
        state['mode'] = snap['simulation']['mode'] = data['mode']
    elif row['event'] == 'cmd.signal-override':
        state['overrides'] = [o for o in state['overrides'] if o['node_id'] != data['node_id']]
        if data['group'] is not None:
            until = time.time() + data['duration_s']
            state['overrides'].append(data | {'until_epoch': until, 'until_at': iso(until),
                                              'until_t_sim': applied_t_sim + data['duration_s']})
    elif row['event'] == 'cmd.scenario':
        now = iso()
        conn.execute('UPDATE scenario_runs SET finished_at=? WHERE finished_at IS NULL', (now,))
        state['scenario'] = None
        if data['key'] != 'none':
            conn.execute('INSERT INTO scenario_runs (id,key,params_json,started_at) VALUES (?,?,?,?)',
                         (data['scenario_id'], data['key'], json.dumps(data['params']), now))
            state['scenario'] = {'scenario_id': data['scenario_id'], 'key': data['key'], 'params': data['params'], 'started_at': now}
        snap['simulation']['scenario'] = data['key']
    elif row['event'] == 'cmd.vms':
        conn.execute('INSERT INTO vms_messages (vms_id,text,mode,set_by,set_at) VALUES (?,?,?,?,?)',
                     (data['vms_id'], data['text'], data['mode'], row['actor'], iso()))
    put_state(conn, 'controls', state)
    put_state(conn, 'snapshot', snap)


async def publish(events):
    from app.ws import broadcast
    for event, data in events:
        await broadcast(event, data, to_roles=['station'] if event.startswith('cmd.') else READERS)
