import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_role
from app.db import get_conn
from app.errors import err
from app.schemas import ReviewIn
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/officer', tags=['officer'])
OFFICER = require_role('officer', 'commander', 'admin')
COMMANDER = require_role('commander', 'admin')
# Cạnh hợp lệ M1 = đúng sơ đồ spec 4.4: confirmed/dismissed KHÔNG có cạnh ra trong M1
# (notified/paid/disputed thuộc M6). Không có `new → paid`, không có `confirmed → dismissed`.
ALLOWED = {'new': {'confirmed', 'dismissed', 'needs_review'},
           'needs_review': {'confirmed', 'dismissed'},
           'confirmed': set(),
           'dismissed': set()}
OVERRIDES = {}   # node_id → {group, by, reason, until_t_sim, until_at} — trạng thái ghi đè đang có


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


@router.get('/violations')
def list_violations(status: str = '', code: str = '', camera_id: str = '', page: int = 1, page_size: int = 50, claims=Depends(OFFICER)):
    conn = get_conn()
    where, args = [], []
    if status:
        where.append('status=?'); args.append(status)
    if code:
        where.append('violation_code=?'); args.append(code)
    if camera_id:
        where.append('camera_id=?'); args.append(camera_id)
    sql = 'SELECT id, violation_code, status, plate, vehicle_class, occurred_at, node_id, camera_id, confidence, penalty_json FROM violations'
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    total = conn.execute(f'SELECT COUNT(*) AS n FROM ({sql})', args).fetchone()['n']
    rows = conn.execute(sql + ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?', (*args, page_size, (page - 1) * page_size)).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        item['penalty'] = json.loads(item.pop('penalty_json') or 'null')   # UI hiển thị mức phạt
        items.append(item)
    return {'items': items, 'total': total, 'page': page}


@router.get('/violations/{vid}')
def get_violation(vid: str, claims=Depends(OFFICER)):
    conn = get_conn()
    row = conn.execute('SELECT * FROM violations WHERE id=?', (vid,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
    out = dict(row)
    for key in ('signal_json', 'detection_json', 'penalty_json', 'sim_json', 'review_json'):
        out[key.replace('_json', '')] = json.loads(out.pop(key) or 'null')
    out['evidence'] = [dict(r) for r in conn.execute('SELECT * FROM evidence WHERE violation_id=?', (vid,))]
    return out


async def _review(vid: str, target: str, note: str, claims):
    conn = get_conn()
    row = conn.execute('SELECT * FROM violations WHERE id=?', (vid,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
    if target not in ALLOWED.get(row['status'], set()):
        raise HTTPException(status_code=409, detail=err('CONFLICT', f"Không thể chuyển {row['status']} → {target}"))
    review = {'by': claims['sub'], 'at': _now(), 'note': note}
    conn.execute('UPDATE violations SET status=?, review_json=?, updated_at=? WHERE id=?',
                 (target, json.dumps(review, ensure_ascii=False), _now(), vid))
    conn.commit()
    await broadcast('violation.updated', {'id': vid, 'status': target, 'review': review}, to_roles=['officer', 'commander', 'admin'])
    return {'id': vid, 'status': target, 'review': review}


@router.post('/violations/{vid}/confirm')
async def confirm(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'confirmed', body.note, claims)


@router.post('/violations/{vid}/dismiss')
async def dismiss(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'dismissed', body.note, claims)


@router.post('/violations/{vid}/needs-review')
async def needs_review(vid: str, body: ReviewIn, claims=Depends(OFFICER)):
    return await _review(vid, 'needs_review', body.note, claims)


@router.get('/kpi')
def kpi(from_: str = Query('', alias='from'), to: str = '', node_id: str = '', claims=Depends(OFFICER)):
    conn = get_conn()
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


@router.get('/streams')
def streams(claims=Depends(OFFICER)):
    conn = get_conn()
    cams = [dict(r) for r in conn.execute('SELECT camera_id FROM cameras')]
    return {'streams': [{'camera_id': c['camera_id'], 'fps': 2,
                         'url': f"/api/v1/media/stream/{c['camera_id']}", 'active': True} for c in cams]}


@router.post('/controls/signal-mode')
async def signal_mode(body: dict, claims=Depends(COMMANDER)):
    mode = body.get('mode')
    if mode not in ('fixed', 'smart'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'mode phải là fixed|smart'))
    await broadcast('cmd.signal-mode', {'mode': mode}, to_roles=['station'])
    return {'ok': True, 'mode': mode}


@router.post('/controls/signal-override')
async def signal_override(body: dict, claims=Depends(COMMANDER)):
    now = datetime.now(timezone.utc)
    duration = float(body.get('duration_s', 60))
    until_at = datetime.fromtimestamp(now.timestamp() + duration, timezone.utc).isoformat().replace('+00:00', 'Z')
    node_id = body.get('node_id')
    group = body.get('group')
    # `until_t_sim` là giây SIM; officer web không biết đồng hồ sim nên backend nhận từ trạm
    # (trường `until_t_sim` trong body nếu trạm đã biết) hoặc để trạm báo lại qua `station.metrics.overrides`.
    until_t_sim = body.get('until_t_sim')
    if group is None:
        OVERRIDES.pop(node_id, None)
    else:
        OVERRIDES[node_id] = {'node_id': node_id, 'group': group, 'by': claims['sub'],
                              'reason': body.get('reason', ''), 'until_t_sim': until_t_sim, 'until_at': until_at}
    await broadcast('cmd.signal-override', {'node_id': node_id, 'group': group,
                                            'duration_s': duration, 'by': claims['sub'], 'reason': body.get('reason', '')},
                    to_roles=['station'])
    return {'ok': True, 'until_t_sim': until_t_sim, 'until_at': until_at}


@router.get('/controls/state')
def controls_state(claims=Depends(OFFICER)):
    conn = get_conn()
    last = conn.execute('SELECT mode FROM kpi_samples ORDER BY id DESC LIMIT 1').fetchone()
    return {'mode': last['mode'] if last else 'fixed', 'overrides': list(OVERRIDES.values()), 'scenario': None}
