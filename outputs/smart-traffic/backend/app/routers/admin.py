"""Quản trị tài khoản cán bộ (M6a): chỉ `admin`; chỉ thao tác trên officer/commander; không tự đổi quyền/khóa mình."""
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import audit
from app.auth import hash_password, require_role
from app.cleanup import storage_stats
from app.db import connect
from app.errors import err
from app.schemas import StaffActiveIn, StaffCreateIn, StaffRoleIn

router = APIRouter(prefix='/api/v1/admin', tags=['admin'])
ADMIN = require_role('admin')
STAFF_ROLES = ('officer', 'commander')


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _staff_target(conn, uid: int, claims):
    me = conn.execute('SELECT id FROM users WHERE username=?', (claims['sub'],)).fetchone()
    if me and me['id'] == uid:
        raise HTTPException(status_code=403, detail=err('FORBIDDEN', 'Không thể tự thay đổi tài khoản của chính mình'))
    t = conn.execute('SELECT id, username, role, active FROM users WHERE id=?', (uid,)).fetchone()
    if not t:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có tài khoản'))
    if t['role'] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail=err('FORBIDDEN', 'Chỉ quản lý được tài khoản cán bộ (officer/commander)'))
    return t


@router.get('/users')
def list_staff(role: str = '', claims=Depends(ADMIN)):
    if role and role not in STAFF_ROLES:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'role phải là officer|commander'))
    roles = [role] if role else list(STAFF_ROLES)
    ph = ','.join('?' * len(roles))
    with connect() as conn:
        rows = conn.execute(f'SELECT id, username, role, display_name, active, created_at FROM users '
                            f'WHERE role IN ({ph}) ORDER BY username', roles).fetchall()
    items = [{**dict(r), 'active': bool(r['active'])} for r in rows]
    return {'items': items, 'total': len(items)}


@router.post('/users')
def create_staff(body: StaffCreateIn, claims=Depends(ADMIN)):
    with connect() as conn:
        try:
            cur = conn.execute(
                'INSERT INTO users (username, password_hash, role, display_name, created_at, active) VALUES (?,?,?,?,?,1)',
                (body.username, hash_password(body.password), body.role, body.display_name, _now()))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Tên đăng nhập đã tồn tại'))
        uid = cur.lastrowid
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='staff-create', target_type='user',
                    target_id=str(uid), to_state=body.role, payload={'username': body.username, 'role': body.role})
    return {'ok': True, 'id': uid, 'username': body.username, 'role': body.role}


@router.post('/users/{uid}/active')
def set_active(uid: int, body: StaffActiveIn, claims=Depends(ADMIN)):
    """Khóa/mở khóa cán bộ. Khóa có hiệu lực NGAY với token đang dùng (decode_token kiểm `active`)."""
    with connect() as conn:
        t = _staff_target(conn, uid, claims)
        conn.execute('UPDATE users SET active=? WHERE id=?', (1 if body.active else 0, uid))
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='staff-active', target_type='user',
                    target_id=str(uid), from_state='active' if t['active'] else 'locked',
                    to_state='active' if body.active else 'locked', payload={'username': t['username']})
    return {'ok': True, 'id': uid, 'active': body.active}


@router.put('/users/{uid}/role')
def set_role(uid: int, body: StaffRoleIn, claims=Depends(ADMIN)):
    """Đổi vai trò officer ⇄ commander. Token cũ mang vai trò cũ bị từ chối ngay (decode_token)."""
    with connect() as conn:
        t = _staff_target(conn, uid, claims)
        if t['role'] == body.role:
            raise HTTPException(status_code=409, detail=err('CONFLICT', f'Tài khoản đã có vai trò {body.role}'))
        conn.execute('UPDATE users SET role=? WHERE id=?', (body.role, uid))
        audit.write(conn, actor=claims['sub'], role=claims.get('role'), action='staff-role', target_type='user',
                    target_id=str(uid), from_state=t['role'], to_state=body.role, payload={'username': t['username']})
    return {'ok': True, 'id': uid, 'role': body.role}


@router.get('/storage')
def storage(claims=Depends(ADMIN)):
    """PERF-4: thống kê lưu trữ cho quản trị — kích thước DB, frames, số dòng mỗi bảng, lần dọn gần nhất."""
    return storage_stats()
