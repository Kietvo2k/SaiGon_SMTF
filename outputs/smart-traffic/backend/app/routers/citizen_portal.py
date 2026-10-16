"""Cổng người dân (M6a, đặc tả §4.5 mục API M6): tài khoản, gắn biển bằng mã đăng ký, vi phạm của tôi,
nộp phạt (chỉ đổi trạng thái), khiếu nại, thông báo. Mọi truy vấn đều lọc theo người đang đăng nhập."""
import hmac
import json
import secrets
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import audit
from app.auth import BindLimiter, RegisterLimiter, hash_password, require_role
from app.db import connect
from app.errors import err
from app.lifecycle import OFFICER_ROLES, announce_violation, owners_of, transition
from app.routers.citizen import CITIZEN_STATUSES
from app.schemas import ComplaintIn, NotifyReadIn, PayIn, PlateBindIn, RegisterIn, violation_label_of
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/citizen', tags=['citizen'])
CITIZEN = require_role('citizen')
MAX_PLATES = 5


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _me(conn, claims) -> dict:
    row = conn.execute(
        'SELECT u.id, u.username, u.display_name, p.full_name, p.phone, p.email '
        'FROM users u LEFT JOIN citizen_profiles p ON p.user_id=u.id WHERE u.username=? AND u.role=? AND u.active=1',
        (claims['sub'], 'citizen')).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có tài khoản công dân'))
    return dict(row)


def _plates(conn, uid: int) -> list:
    return [dict(r) for r in conn.execute(
        'SELECT o.plate, p.vehicle_class, o.created_at AS bound_at FROM vehicle_ownerships o '
        'JOIN plates_seed p ON p.plate=o.plate WHERE o.user_id=? ORDER BY o.created_at, o.plate', (uid,))]


def _penalty(raw: str) -> dict:
    # Chưa xác minh (NĐ 168/2024 chưa đủ) → KHÔNG lộ số tiền (§4.5, Phụ lục B).
    penalty = json.loads(raw or '{}')
    verified = bool(penalty.get('verified'))
    return {'vnd_min': penalty.get('vnd_min') if verified else None,
            'vnd_max': penalty.get('vnd_max') if verified else None,
            'verified': verified}


def _owned(conn, uid: int, vid: str, any_status: bool = False):
    """Vi phạm thuộc biển đã gắn của `uid`; không phải của mình → 404 (không lộ sự tồn tại)."""
    sql = 'SELECT v.* FROM violations v JOIN vehicle_ownerships o ON o.plate=v.plate WHERE v.id=? AND o.user_id=?'
    args = [vid, uid]
    if not any_status:
        sql += f" AND v.status IN ({','.join('?' * len(CITIZEN_STATUSES))})"
        args += list(CITIZEN_STATUSES)
    row = conn.execute(sql, args).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
    return row


# ---------- Tài khoản ----------

@router.post('/account/register')
def register(body: RegisterIn, request: Request):
    # Giả lập: KHÔNG gửi email/SMS thật. Email chỉ lưu vào hồ sơ; không có bước xác minh qua thư.
    RegisterLimiter.check(request.client.host if request.client else '0.0.0.0')
    with connect() as conn:
        try:
            cur = conn.execute(
                'INSERT INTO users (username, password_hash, role, display_name, created_at, active) VALUES (?,?,?,?,?,1)',
                (body.username, hash_password(body.password), 'citizen', body.full_name, _now()))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Tên đăng nhập đã tồn tại'))
        uid = cur.lastrowid
        conn.execute('INSERT INTO citizen_profiles (user_id, full_name, phone, email, created_at) VALUES (?,?,?,?,?)',
                     (uid, body.full_name, body.phone, body.email, _now()))
        audit.write(conn, actor=body.username, role='citizen', action='register', target_type='user',
                    target_id=str(uid), to_state='citizen')
    return {'ok': True}


@router.get('/account')
def account(claims=Depends(CITIZEN)):
    with connect() as conn:
        me = _me(conn, claims)
        plates = _plates(conn, me['id'])
    return {'id': me['id'], 'username': me['username'], 'display_name': me['display_name'],
            'full_name': me['full_name'], 'phone': me['phone'], 'email': me['email'],
            'plates': plates, 'max_plates': MAX_PLATES}


@router.post('/account/plates')
def bind_plate(body: PlateBindIn, claims=Depends(CITIZEN)):
    """Gắn biển: xác minh bằng mã đăng ký xe (seed). Sai mã đếm theo tài khoản, quá 5 lần → khóa tạm."""
    BindLimiter.check(claims['sub'])
    with connect() as conn:
        me = _me(conn, claims)
        p = conn.execute('SELECT plate, vehicle_class, registration_code FROM plates_seed WHERE plate=?',
                         (body.plate,)).fetchone()
        ok = (p is not None and p['vehicle_class'] == body.vehicle_class and bool(p['registration_code'])
              and hmac.compare_digest(p['registration_code'], body.registration_code))
        if not ok:
            BindLimiter.fail(claims['sub'])
            raise HTTPException(status_code=422, detail=err('VALIDATION', 'Biển số, loại xe hoặc mã đăng ký không khớp'))
        if conn.execute('SELECT 1 FROM vehicle_ownerships WHERE user_id=? AND plate=?', (me['id'], body.plate)).fetchone():
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Biển này đã được gắn vào tài khoản của bạn'))
        if conn.execute('SELECT 1 FROM vehicle_ownerships WHERE plate=?', (body.plate,)).fetchone():
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Biển này đã gắn với tài khoản khác'))
        if len(_plates(conn, me['id'])) >= MAX_PLATES:
            raise HTTPException(status_code=409, detail=err('CONFLICT', f'Tối đa {MAX_PLATES} biển số cho mỗi tài khoản'))
        conn.execute('INSERT INTO vehicle_ownerships (user_id, plate, created_at) VALUES (?,?,?)',
                     (me['id'], body.plate, _now()))
        audit.write(conn, actor=claims['sub'], role='citizen', action='plate-bind', target_type='plate',
                    target_id=body.plate, to_state='bound', payload={'vehicle_class': body.vehicle_class})
        plates = [r['plate'] for r in _plates(conn, me['id'])]
    return {'ok': True, 'plates': plates}


@router.delete('/account/plates/{plate}')
def unbind_plate(plate: str, claims=Depends(CITIZEN)):
    with connect() as conn:
        me = _me(conn, claims)
        cur = conn.execute('DELETE FROM vehicle_ownerships WHERE user_id=? AND plate=?', (me['id'], plate))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Biển này chưa được gắn vào tài khoản'))
        audit.write(conn, actor=claims['sub'], role='citizen', action='plate-unbind', target_type='plate',
                    target_id=plate, from_state='bound')
        plates = [r['plate'] for r in _plates(conn, me['id'])]
    return {'ok': True, 'plates': plates}


# ---------- Vi phạm của tôi ----------

@router.get('/violations')
def my_violations(status: str = '', page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  claims=Depends(CITIZEN)):
    if status and status not in CITIZEN_STATUSES:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'status phải là confirmed|notified|paid|disputed'))
    statuses = [status] if status else list(CITIZEN_STATUSES)
    ph = ','.join('?' * len(statuses))
    base = (f'FROM violations v JOIN vehicle_ownerships o ON o.plate=v.plate '
            f'WHERE o.user_id=? AND v.status IN ({ph})')
    with connect() as conn:
        me = _me(conn, claims)
        total = conn.execute(f'SELECT COUNT(*) AS n {base}', [me['id'], *statuses]).fetchone()['n']
        rows = conn.execute(
            f'SELECT v.id, v.violation_code, v.status, v.plate, v.occurred_at, v.node_label, v.penalty_json {base} '
            'ORDER BY v.occurred_at DESC LIMIT ? OFFSET ?',
            [me['id'], *statuses, page_size, (page - 1) * page_size]).fetchall()
    items = [{'id': r['id'], 'violation_code': r['violation_code'], 'violation_label': violation_label_of(r['violation_code']),
              'status': r['status'], 'plate': r['plate'], 'occurred_at': r['occurred_at'],
              'node_label': r['node_label'], 'penalty': _penalty(r['penalty_json'])} for r in rows]
    return {'items': items, 'total': total, 'page': page}


@router.get('/violations/{vid}')
def my_violation(vid: str, claims=Depends(CITIZEN)):
    with connect() as conn:
        me = _me(conn, claims)
        row = _owned(conn, me['id'], vid)
        evidence = [{'kind': e['kind'], 'url': f"/api/v1/media/{e['media_id']}"} for e in conn.execute(
            'SELECT kind, media_id FROM evidence WHERE violation_id=? ORDER BY kind', (vid,))]
        complaints = [dict(c) for c in conn.execute(
            'SELECT id, kind, status, created_at, resolved_at FROM complaints WHERE violation_id=? AND user_id=? '
            'ORDER BY created_at', (vid, me['id']))]
    notified = row['status'] == 'notified'
    return {'id': row['id'], 'violation_code': row['violation_code'], 'violation_label': violation_label_of(row['violation_code']),
            'status': row['status'], 'plate': row['plate'], 'occurred_at': row['occurred_at'],
            'node_label': row['node_label'], 'camera_id': row['camera_id'],
            'penalty': _penalty(row['penalty_json']), 'evidence': evidence, 'complaints': complaints,
            'can_pay': notified, 'can_complain': notified}


@router.post('/violations/{vid}/pay')
async def pay(vid: str, body: PayIn, claims=Depends(CITIZEN)):
    """Nộp phạt: CHỈ đổi trạng thái notified → paid (Q18). Không có thông tin thẻ/tài khoản ngân hàng."""
    with connect() as conn:
        me = _me(conn, claims)
        _owned(conn, me['id'], vid, any_status=True)
        row = transition(conn, vid, 'paid', actor=claims['sub'], role='citizen', note='chỉ đổi trạng thái',
                         action='pay')
        conn.execute('INSERT INTO payments (id, violation_id, amount_vnd, status, created_at, by_user) VALUES (?,?,?,?,?,?)',
                     ('PM-' + secrets.token_hex(8), vid, None, 'recorded', _now(), me['id']))
        owners = owners_of(conn, row['plate'])
    await announce_violation(row, [o['username'] for o in owners])
    return {'id': vid, 'status': 'paid', 'note': 'chỉ đổi trạng thái'}


# ---------- Khiếu nại ----------

@router.post('/complaints')
async def create_complaint(body: ComplaintIn, claims=Depends(CITIZEN)):
    """Khiếu nại khi vi phạm đang `notified` → vi phạm chuyển `disputed`, khiếu nại `open`."""
    with connect() as conn:
        me = _me(conn, claims)
        _owned(conn, me['id'], body.violation_id, any_status=True)
        row = transition(conn, body.violation_id, 'disputed', actor=claims['sub'], role='citizen', note=body.reason,
                         action='dispute', payload={'kind': body.kind})
        cid = 'CB-' + secrets.token_hex(5).upper()
        conn.execute(
            'INSERT INTO complaints (id, violation_id, user_id, message, status, resolution, created_at, resolved_at, '
            'kind, reason, resolved_by) VALUES (?,?,?,?,?,NULL,?,NULL,?,?,NULL)',
            (cid, body.violation_id, me['id'], body.message, 'open', _now(), body.kind, body.reason))
        audit.write(conn, actor=claims['sub'], role='citizen', action='complaint-create', target_type='complaint',
                    target_id=cid, to_state='open', reason=body.reason,
                    payload={'violation_id': body.violation_id, 'kind': body.kind})
        owners = owners_of(conn, row['plate'])
    usernames = [o['username'] for o in owners]
    await announce_violation(row, usernames)
    await broadcast('complaint.updated', {'id': cid, 'status': 'open', 'violation_id': body.violation_id},
                    to_roles=OFFICER_ROLES, to_users=usernames or None)
    return {'id': cid, 'status': 'open', 'violation_id': body.violation_id}


@router.get('/complaints/{cid}')
def get_complaint(cid: str, claims=Depends(CITIZEN)):
    with connect() as conn:
        me = _me(conn, claims)
        c = conn.execute(
            'SELECT id, violation_id, kind, reason, message, status, resolution, created_at, resolved_at '
            'FROM complaints WHERE id=? AND user_id=?', (cid, me['id'])).fetchone()
    if not c:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có khiếu nại'))
    return dict(c)


# ---------- Thông báo ----------

@router.get('/notifications')
def notifications(unread: bool = False, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100),
                  claims=Depends(CITIZEN)):
    extra = ' AND read_at IS NULL' if unread else ''
    with connect() as conn:
        me = _me(conn, claims)
        total = conn.execute(f'SELECT COUNT(*) AS n FROM notifications WHERE user_id=?{extra}', (me['id'],)).fetchone()['n']
        unread_n = conn.execute('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL',
                                (me['id'],)).fetchone()['n']
        rows = conn.execute(
            f'SELECT id, violation_id, kind, title, body, read_at, created_at FROM notifications WHERE user_id=?{extra} '
            'ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
            (me['id'], page_size, (page - 1) * page_size)).fetchall()
    return {'items': [dict(r) for r in rows], 'total': total, 'unread': unread_n, 'page': page}


@router.post('/notifications/read')
def mark_read(body: NotifyReadIn, claims=Depends(CITIZEN)):
    ph = ','.join('?' * len(body.ids))
    with connect() as conn:
        me = _me(conn, claims)
        cur = conn.execute(f'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL AND id IN ({ph})',
                           (_now(), me['id'], *body.ids))
        updated = cur.rowcount
    return {'ok': True, 'updated': updated}
