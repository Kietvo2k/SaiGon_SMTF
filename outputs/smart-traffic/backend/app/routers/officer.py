import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app import audit, heat
from app.audit import now_iso
from app.auth import require_role
from app.db import connect
from app.errors import err
from app.lifecycle import (OFFICER_ROLES, announce_violation, create_notifications, load,
                           owners_of, push_notifications, range_clauses, transition)
from app.schemas import ReviewIn, ResolveIn, ScenarioIn, SignalOverrideIn, VmsIn
from app.vms import STATION_VMS, VMS_IDS
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/officer', tags=['officer'])
OFFICER = require_role('officer', 'commander', 'admin')
COMMANDER = require_role('commander', 'admin')
# Cạnh vòng đời nằm ở app/lifecycle.py (§4.4, M6a). Ở đây chỉ còn các endpoint của cán bộ.
OVERRIDES = {}   # node_id → {group, by, reason, until_t_sim, until_at} — trạng thái ghi đè đang có


@router.get('/violations')
def list_violations(status: str = '', code: str = '', camera_id: str = '', page: int = Query(1, ge=1),
                    page_size: int = Query(50, ge=1, le=200), from_: str = Query('', alias='from'),
                    to: str = '', claims=Depends(OFFICER)):
    with connect() as conn:
        where, args = [], []
        if status:
            where.append('status=?'); args.append(status)
        if code:
            where.append('violation_code=?'); args.append(code)
        if camera_id:
            where.append('camera_id=?'); args.append(camera_id)
        rclauses, rargs = range_clauses(from_, to)
        where += rclauses; args += rargs
        sql = ('SELECT id, violation_code, status, plate, vehicle_class, occurred_at, node_id, camera_id, confidence, '
               'penalty_json, priority_flag, priority_reason FROM violations')
        if where:
            sql += ' WHERE ' + ' AND '.join(where)
        total = conn.execute(f'SELECT COUNT(*) AS n FROM ({sql})', args).fetchone()['n']
        rows = conn.execute(sql + ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?', (*args, page_size, (page - 1) * page_size)).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        item['penalty'] = json.loads(item.pop('penalty_json') or 'null')   # UI hiển thị mức phạt
        item['priority_flag'] = bool(item['priority_flag'])                 # cờ xe ưu tiên (§4.4)
        items.append(item)
    return {'items': items, 'total': total, 'page': page}


@router.get('/violations/{vid}')
def get_violation(vid: str, claims=Depends(OFFICER)):
    with connect() as conn:
        row = load(conn, vid)
        out = dict(row)
        out['evidence'] = [dict(r) for r in conn.execute('SELECT * FROM evidence WHERE violation_id=?', (vid,))]
        out['complaints'] = [dict(r) for r in conn.execute(
            'SELECT id, kind, reason, message, status, resolution, created_at, resolved_at, resolved_by '
            'FROM complaints WHERE violation_id=? ORDER BY created_at', (vid,))]
    for key in ('signal_json', 'detection_json', 'penalty_json', 'sim_json', 'review_json'):
        out[key.replace('_json', '')] = json.loads(out.pop(key) or 'null')
    out['priority_flag'] = bool(out['priority_flag'])
    return out


async def _review(vid: str, target: str, note: str, claims):
    with connect() as conn:
        row = transition(conn, vid, target, actor=claims['sub'], role=claims.get('role'), note=note, action='review')
        notified = []
        if target == 'confirmed':
            # M6a: xác nhận biển đã gắn tài khoản → backend tự chuyển notified và gửi thông báo.
            owners = owners_of(conn, row['plate'])
            if owners:
                row = transition(conn, vid, 'notified', actor='system', role='system', action='notify',
                                 note='Tự động thông báo: biển đã gắn tài khoản công dân')
                notified = create_notifications(conn, row, owners)
        owners = owners_of(conn, row['plate'])
    await announce_violation(row, [o['username'] for o in owners])
    await push_notifications(notified)
    return {'id': vid, 'status': row['status'], 'review': row['review']}


@router.post('/violations/{vid}/confirm')
async def confirm(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'confirmed', body.note, claims)


@router.post('/violations/{vid}/dismiss')
async def dismiss(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'dismissed', body.note, claims)


@router.post('/violations/{vid}/needs-review')
async def needs_review(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'needs_review', body.note, claims)


@router.post('/violations/{vid}/notify')
async def notify(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    """Officer bấm "Gửi thông báo" cho vi phạm đã confirmed (M6a). Không có tài khoản gắn biển → 409."""
    with connect() as conn:
        row = transition(conn, vid, 'notified', actor=claims['sub'], role=claims.get('role'), note=body.note, action='notify')
        owners = owners_of(conn, row['plate'])
        if not owners:
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Biển chưa gắn tài khoản công dân nào, không thể thông báo'))
        notified = create_notifications(conn, row, owners)
    await announce_violation(row, [o['username'] for o in owners])
    await push_notifications(notified)
    return {'id': vid, 'status': row['status'], 'review': row['review']}


@router.get('/complaints')
def list_complaints(status: str = '', page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                    claims=Depends(OFFICER)):
    if status and status not in ('open', 'resolved', 'rejected'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'status phải là open|resolved|rejected'))
    where, args = ('WHERE c.status=?', [status]) if status else ('', [])
    base = (f'FROM complaints c JOIN violations v ON v.id=c.violation_id {where}')
    with connect() as conn:
        total = conn.execute(f'SELECT COUNT(*) AS n {base}', args).fetchone()['n']
        rows = conn.execute(
            'SELECT c.id, c.violation_id, c.kind, c.reason, c.message, c.status, c.resolution, c.created_at, c.resolved_at, '
            'v.plate, v.violation_code, v.status AS violation_status, v.priority_flag, v.priority_reason '
            f'{base} ORDER BY c.created_at DESC LIMIT ? OFFSET ?', (*args, page_size, (page - 1) * page_size)).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        item['priority_flag'] = bool(item['priority_flag'])
        items.append(item)
    return {'items': items, 'total': total, 'page': page}


@router.post('/complaints/{cid}/resolve')
async def resolve_complaint(cid: str, body: ResolveIn, claims=Depends(OFFICER)):
    """`confirm` = giữ vi phạm (violation → notified, khiếu nại `rejected`);
    `dismiss` = gỡ vi phạm (violation → dismissed, khiếu nại `resolved`). Lý do bắt buộc."""
    keep = body.action == 'confirm'
    new_status = 'rejected' if keep else 'resolved'
    with connect() as conn:
        c = conn.execute('SELECT * FROM complaints WHERE id=?', (cid,)).fetchone()
        if not c:
            raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có khiếu nại'))
        if c['status'] != 'open':
            raise HTTPException(status_code=409, detail=err('CONFLICT', f"Khiếu nại đã {c['status']}"))
        row = transition(conn, c['violation_id'], 'notified' if keep else 'dismissed', actor=claims['sub'],
                         role=claims.get('role'), note=body.note, action='complaint-resolve',
                         payload={'complaint_id': cid, 'action': body.action})
        resolved_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        conn.execute('UPDATE complaints SET status=?, resolution=?, resolved_at=?, resolved_by=? WHERE id=?',
                     (new_status, body.note, resolved_at, claims['sub'], cid))
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='complaint-status',
                    target_type='complaint', target_id=cid, from_state='open', to_state=new_status, reason=body.note,
                    payload={'violation_id': row['id'], 'action': body.action})
        owners = owners_of(conn, row['plate'])
    usernames = [o['username'] for o in owners]
    await announce_violation(row, usernames)
    await broadcast('complaint.updated', {'id': cid, 'status': new_status, 'violation_id': row['id']},
                    to_roles=OFFICER_ROLES, to_users=usernames or None)
    return {'id': cid, 'status': new_status, 'violation': {'id': row['id'], 'status': row['status']}}


@router.get('/stats')
def stats(from_: str = Query('', alias='from'), to: str = '', claims=Depends(OFFICER)):
    """Thống kê theo nút, loại lỗi, giờ trong ngày (giờ Việt Nam) và trạng thái trong khoảng thời gian."""
    rclauses, rargs = range_clauses(from_, to)
    where = (' WHERE ' + ' AND '.join(rclauses)) if rclauses else ''
    with connect() as conn:
        total = conn.execute(f'SELECT COUNT(*) AS n FROM violations{where}', rargs).fetchone()['n']
        by_node = [dict(r) for r in conn.execute(
            f'SELECT node_id, node_label, COUNT(*) AS count FROM violations{where} GROUP BY node_id, node_label '
            'ORDER BY count DESC, node_id', rargs)]
        by_code = [dict(r) for r in conn.execute(
            f'SELECT violation_code, COUNT(*) AS count FROM violations{where} GROUP BY violation_code ORDER BY count DESC', rargs)]
        by_status = [dict(r) for r in conn.execute(
            f'SELECT status, COUNT(*) AS count FROM violations{where} GROUP BY status ORDER BY status', rargs)]
        hour_rows = conn.execute(
            f"SELECT CAST(strftime('%H', occurred_at, '+7 hours') AS INTEGER) AS hour, COUNT(*) AS count "
            f'FROM violations{where} GROUP BY hour', rargs).fetchall()
    hours = {h: 0 for h in range(24)}
    for r in hour_rows:
        hours[r['hour']] = r['count']
    return {'from': from_ or None, 'to': to or None, 'total': total, 'by_node': by_node, 'by_code': by_code,
            'by_status': by_status, 'by_hour': [{'hour': h, 'count': hours[h]} for h in range(24)]}


@router.get('/kpi')
def kpi(from_: str = Query('', alias='from'), to: str = '', node_id: str = '', claims=Depends(OFFICER)):
    with connect() as conn:
        where, args = ['1=1'], []
        if from_:
            where.append('t_sim>=?'); args.append(from_)
        if to:
            where.append('t_sim<=?'); args.append(to)
        rows = conn.execute('SELECT t_sim, wait_avg_s, queue_max, flow_per_min, mode FROM kpi_samples WHERE ' + ' AND '.join(where) + ' ORDER BY id DESC LIMIT 120', args).fetchall()
    samples = [dict(r) for r in rows]
    last = samples[0] if samples else {'wait_avg_s': 0, 'queue_max': 0, 'flow_per_min': 0, 'mode': 'fixed'}
    return {'wait_avg_s': last['wait_avg_s'], 'queue_max': last['queue_max'],
            'flow_per_min': last['flow_per_min'], 'mode': last['mode'], 'samples': samples,
            'node_id': node_id or None}


@router.get('/heat')
def heat_view(claims=Depends(OFFICER)):
    """Bản đồ nhiệt mới nhất + cảnh báo kẹt + trung bình theo giờ từ lịch sử (M4c)."""
    with connect() as conn:
        return heat.officer_view(conn)


@router.get('/streams')
def streams(claims=Depends(OFFICER)):
    with connect() as conn:
        cams = [dict(r) for r in conn.execute('SELECT camera_id FROM cameras')]
    return {'streams': [{'camera_id': c['camera_id'], 'fps': 2,
                         'url': f"/api/v1/media/stream/{c['camera_id']}", 'active': True} for c in cams]}


@router.get('/audit')
def list_audit(target_id: str = '', limit: int = Query(100, ge=1, le=500), claims=Depends(COMMANDER)):
    # Nhật ký thao tác bền vững cho commander/admin (§11).
    with connect() as conn:
        if target_id:
            rows = conn.execute('SELECT * FROM audit_log WHERE target_id=? ORDER BY id DESC LIMIT ?', (target_id, limit)).fetchall()
        else:
            rows = conn.execute('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        item['payload'] = json.loads(item.pop('payload_json') or 'null')
        items.append(item)
    return {'items': items, 'total': len(items)}


@router.post('/controls/signal-mode')
async def signal_mode(body: dict, claims=Depends(COMMANDER)):
    mode = body.get('mode')
    if mode not in ('fixed', 'smart'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'mode phải là fixed|smart'))
    with connect() as conn:
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='signal-mode',
                    target_type='signal', target_id=None, to_state=mode, payload={'mode': mode})
    await broadcast('cmd.signal-mode', {'mode': mode}, to_roles=['station'])
    return {'ok': True, 'mode': mode}


@router.post('/controls/signal-override')
async def signal_override(body: SignalOverrideIn, claims=Depends(COMMANDER)):
    node_id = body.node_id
    group = body.group
    with connect() as conn:
        if not conn.execute('SELECT node_id FROM signal_nodes WHERE node_id=?', (node_id,)).fetchone():
            raise HTTPException(status_code=422, detail=err('VALIDATION', f'node_id không tồn tại: {node_id}'))
        now = datetime.now(timezone.utc)
        until_at = datetime.fromtimestamp(now.timestamp() + body.duration_s, timezone.utc).isoformat().replace('+00:00', 'Z')
        if group is None:
            OVERRIDES.pop(node_id, None)
        else:
            OVERRIDES[node_id] = {'node_id': node_id, 'group': group, 'by': claims['sub'],
                                  'reason': body.reason, 'until_t_sim': body.until_t_sim, 'until_at': until_at}
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='signal-override',
                    target_type='signal', target_id=node_id, to_state='cancel' if group is None else str(group),
                    reason=body.reason,
                    payload={'group': group, 'duration_s': body.duration_s, 'until_t_sim': body.until_t_sim, 'until_at': until_at})
    await broadcast('cmd.signal-override', {'node_id': node_id, 'group': group,
                                            'duration_s': body.duration_s, 'by': claims['sub'], 'reason': body.reason},
                    to_roles=['station'])
    return {'ok': True, 'until_t_sim': body.until_t_sim, 'until_at': until_at}


@router.get('/controls/state')
def controls_state(claims=Depends(OFFICER)):
    """Trạng thái điều khiển: chế độ đèn, ghi đè đang có, kịch bản đang chạy, pha mới nhất của từng nút đèn."""
    with connect() as conn:
        last = conn.execute('SELECT mode FROM kpi_samples ORDER BY id DESC LIMIT 1').fetchone()
        run = conn.execute('SELECT id, key, params_json, started_at FROM scenario_runs WHERE finished_at IS NULL '
                           'ORDER BY started_at DESC LIMIT 1').fetchone()
        signals = [dict(r) for r in conn.execute(
            'SELECT n.node_id, n.label, n.cluster_id, s.phase, s.grp, s.t_sim, s.mode, s.override_by, s.reason '
            'FROM signal_nodes n LEFT JOIN signal_state_log s ON s.id = '
            '(SELECT MAX(id) FROM signal_state_log WHERE node_id = n.node_id) ORDER BY n.node_id')]
    for s in signals:
        s['group'] = s.pop('grp')   # bản ghi pha chưa có → None (nút chưa báo trạng thái)
    scenario = None
    if run:
        scenario = {'scenario_id': run['id'], 'key': run['key'], 'params': json.loads(run['params_json'] or '{}'),
                    'started_at': run['started_at']}
    return {'mode': last['mode'] if last else 'fixed', 'overrides': list(OVERRIDES.values()),
            'scenario': scenario, 'signals': signals}


@router.post('/controls/scenario')
async def start_scenario(body: ScenarioIn, claims=Depends(COMMANDER)):
    """Chạy một kịch bản (hoặc `none` để dừng). Chỉ một kịch bản chạy tại một thời điểm; phát `cmd.scenario` tới trạm."""
    now = now_iso()
    scenario_id = None
    with connect() as conn:
        conn.execute('UPDATE scenario_runs SET finished_at=? WHERE finished_at IS NULL', (now,))
        if body.scenario != 'none':
            scenario_id = f'SC-{secrets.token_hex(6)}'
            conn.execute('INSERT INTO scenario_runs (id, key, seed, mode, params_json, result_json, started_at, finished_at) '
                         'VALUES (?,?,?,?,?,?,?,?)',
                         (scenario_id, body.scenario, None, None, json.dumps(body.params, ensure_ascii=False), None, now, None))
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='scenario',
                    target_type='scenario', target_id=scenario_id, to_state=body.scenario,
                    payload={'scenario': body.scenario, 'params': body.params, 'scenario_id': scenario_id})
    await broadcast('cmd.scenario', {'key': body.scenario, 'params': body.params, 'scenario_id': scenario_id},
                    to_roles=['station'])
    return {'ok': True, 'scenario': body.scenario, 'scenario_id': scenario_id}


@router.get('/vms')
def list_vms(claims=Depends(OFFICER)):
    """Bốn bảng VMS: nội dung cán bộ đặt gần nhất + nội dung trạm đang hiển thị (nếu trạm đã báo)."""
    with connect() as conn:
        rows = conn.execute('SELECT vms_id, text, mode, set_by, set_at FROM vms_messages '
                            'WHERE id IN (SELECT MAX(id) FROM vms_messages GROUP BY vms_id)').fetchall()
    latest = {r['vms_id']: dict(r) for r in rows}
    items = []
    for vid in VMS_IDS:
        cur = latest.get(vid) or {'text': '', 'mode': 'auto', 'set_by': None, 'set_at': None}
        shown = STATION_VMS.get(vid)
        items.append({'vms_id': vid, 'mode': cur['mode'], 'text': cur['text'], 'set_by': cur['set_by'],
                      'set_at': cur['set_at'],
                      'shown': shown['text'] if shown else None,
                      'shown_mode': shown['mode'] if shown else None,
                      'reported_at': shown['reported_at'] if shown else None})
    return {'items': items, 'total': len(items)}


@router.put('/vms/{vms_id}')
async def put_vms(vms_id: str, body: VmsIn, claims=Depends(COMMANDER)):
    if vms_id not in VMS_IDS:
        raise HTTPException(status_code=422, detail=err('VALIDATION', f'vms_id không tồn tại: {vms_id}'))
    lines = [body.text] if body.text else []
    with connect() as conn:
        conn.execute('INSERT INTO vms_messages (vms_id, text, mode, set_by, set_at) VALUES (?,?,?,?,?)',
                     (vms_id, body.text, body.mode, claims['sub'], now_iso()))
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='vms',
                    target_type='vms', target_id=vms_id, to_state=body.mode, payload={'text': body.text, 'mode': body.mode})
    await broadcast('cmd.vms', {'vms_id': vms_id, 'mode': body.mode, 'text': body.text, 'lines': lines, 'by': claims['sub']},
                    to_roles=['station'])
    return {'ok': True, 'vms_id': vms_id, 'mode': body.mode, 'text': body.text}
