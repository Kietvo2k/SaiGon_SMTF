"""Máy trạng thái vòng đời vi phạm (đặc tả §4.4, M6a) — MỘT nơi kiểm cạnh hợp lệ.

Mọi đổi trạng thái đi qua `transition`: sai cạnh → 409; đúng cạnh → ghi `review` vào bản ghi
và ghi một dòng `audit_log` cùng transaction với thay đổi nghiệp vụ.
"""
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app import audit
from app.errors import err
from app.ws import broadcast

# Cạnh hợp lệ (đặc tả §4.4 + brief M6a). Trạng thái không có cạnh ra: dismissed, paid.
ALLOWED = {
    'new': {'confirmed', 'dismissed', 'needs_review'},
    'needs_review': {'confirmed', 'dismissed'},
    'confirmed': {'notified'},
    'notified': {'paid', 'disputed'},
    'disputed': {'notified', 'dismissed'},   # giữ (→ notified, còn nộp được) | gỡ (→ dismissed)
    'paid': set(),
    'dismissed': set(),
}
OFFICER_ROLES = ['officer', 'commander', 'admin']
NOTIFY_TITLE = 'Thông báo vi phạm giao thông'
LOCAL_TZ_HOURS = 7   # Asia/Ho_Chi_Minh (không có DST) — dùng cho khoảng ngày và giờ trong ngày


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def load(conn, vid: str):
    row = conn.execute('SELECT * FROM violations WHERE id=?', (vid,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
    return row


def as_dict(row) -> dict:
    out = dict(row)
    out['review'] = json.loads(out.pop('review_json') or 'null')
    return out


def transition(conn, vid: str, target: str, *, actor: str, role, note, action: str, payload=None):
    """Đổi trạng thái vi phạm sang `target` nếu cạnh hợp lệ; trả về bản ghi đã cập nhật (dict)."""
    row = load(conn, vid)
    if target not in ALLOWED.get(row['status'], set()):
        raise HTTPException(status_code=409, detail=err('CONFLICT', f"Không thể chuyển {row['status']} → {target}"))
    review = {'by': actor, 'at': now_iso(), 'note': note}
    conn.execute('UPDATE violations SET status=?, review_json=?, updated_at=? WHERE id=?',
                 (target, json.dumps(review, ensure_ascii=False), review['at'], vid))
    audit.write(conn, actor=actor, role=role, action=action, target_type='violation', target_id=vid,
                from_state=row['status'], to_state=target, reason=note,
                payload={'review': review, **(payload or {})})
    return as_dict(conn.execute('SELECT * FROM violations WHERE id=?', (vid,)).fetchone())


def owners_of(conn, plate: str) -> list:
    """Tài khoản công dân đang gắn biển này (chỉ tài khoản hoạt động)."""
    return [dict(r) for r in conn.execute(
        'SELECT u.id, u.username FROM vehicle_ownerships o JOIN users u ON u.id=o.user_id '
        'WHERE o.plate=? AND u.active=1 ORDER BY u.id', (plate,))]


# ---------- Tự động xử lý vi phạm (chế độ demo) ----------
# Tỷ lệ chọn khiếu nại tự động dùng hash tất định của bộ khóa vi phạm, không random theo giờ,
# để cùng một vi phạm luôn cho cùng kết quả khi chạy lại/kiểm thử.
def auto_complaint_sample(vid: str, row: dict, pct: float = 1.0) -> bool:
    try:
        p = max(0.0, min(100.0, float(pct)))
    except (TypeError, ValueError):
        p = 1.0
    if p <= 0:
        return False
    key = f"{vid}|{row.get('vehicle_id', '')}|{row.get('cycle_id', '')}|{row.get('violation_code', '')}"
    n = int.from_bytes(hashlib.sha256(key.encode('utf-8')).digest()[:8], 'big')
    return (n % 10000) < int(round(p * 100))


def auto_process_violation(conn, vid: str, *, complaint_pct: float = 1.0) -> dict:
    """Xác nhận + báo về tự động; 1% (mặc định) sinh một khiếu nại mở.

    - `new`/`needs_review` → `confirmed` → `notified`, không cần cán bộ bấm.
    - Chỉ tạo `notifications` khi biển đã gắn tài khoản công dân; trạng thái `notified`
      vẫn là mốc "đã ghi nhận báo về" của bản mô phỏng.
    - Khiếu nại tự động có `user_id` là chủ xe nếu có, ngược lại NULL (khiếu nại hệ thống).
    """
    row = as_dict(load(conn, vid))
    if row['status'] in ('new', 'needs_review'):
        row = transition(conn, vid, 'confirmed', actor='system', role='system',
                         note='Tự động xác nhận vi phạm', action='auto-review')
    notifications = []
    if row['status'] == 'confirmed':
        row = transition(conn, vid, 'notified', actor='system', role='system',
                         note='Tự động ghi nhận và báo vi phạm', action='auto-notify')
    owners = owners_of(conn, row['plate'])
    if row['status'] == 'notified':
        notifications = create_notifications(conn, row, owners)

    complaint = None
    if row['status'] == 'notified' and auto_complaint_sample(vid, row, complaint_pct):
        row = transition(conn, vid, 'disputed', actor='system', role='system',
                         note='Tự động ghi nhận khiếu nại theo tỷ lệ thử nghiệm', action='auto-dispute')
        now = now_iso()
        cid = 'CB-' + secrets.token_hex(5).upper()
        reason = 'Hệ thống tự động ghi nhận khiếu nại theo tỷ lệ thử nghiệm.'
        message = 'Khiếu nại được tạo tự động để kiểm tra quy trình; không cần cán bộ thao tác.'
        owner_id = owners[0]['id'] if owners else None
        conn.execute(
            'INSERT INTO complaints (id, violation_id, user_id, message, status, resolution, created_at, resolved_at, '
            'kind, reason, resolved_by) VALUES (?,?,?,?,?,NULL,?,NULL,?,?,NULL)',
            (cid, vid, owner_id, message, 'open', now, 'auto_1pct', reason))
        audit.write(conn, actor='system', role='system', action='complaint-create', target_type='complaint',
                    target_id=cid, to_state='open', reason=reason,
                    payload={'violation_id': vid, 'kind': 'auto_1pct'})
        complaint = {'id': cid, 'status': 'open', 'violation_id': vid, 'kind': 'auto_1pct',
                     'reason': reason, 'message': message, 'created_at': now}
    return {'row': row, 'notifications': notifications, 'complaint': complaint, 'owners': owners}


def auto_process_pending(conn, *, complaint_pct: float = 1.0) -> dict:
    """Dọn các vi phạm còn `new`/`needs_review` khi bật chế độ tự động (backfill lúc khởi động)."""
    rows = conn.execute("SELECT id FROM violations WHERE status IN ('new','needs_review') "
                        "ORDER BY occurred_at, id").fetchall()
    complaints = 0
    for r in rows:
        result = auto_process_violation(conn, r['id'], complaint_pct=complaint_pct)
        if result['complaint']:
            complaints += 1
    return {'processed': len(rows), 'complaints': complaints}


def create_notifications(conn, row: dict, owners: list) -> list:
    """Ghi thông báo cho từng chủ tài khoản; trả về danh sách để đẩy WebSocket sau khi commit.

    Nội dung KHÔNG kèm số tiền, chủ xe, mã camera hay dữ liệu mô phỏng (§11).
    """
    body = (f'Biển số {row["plate"]} bị lập biên bản vi phạm tại {row["node_label"] or row["node_id"]}. '
            'Mở mục Vi phạm của tôi để xem bằng chứng, nộp phạt hoặc khiếu nại.')
    created = []
    now = now_iso()
    for o in owners:
        nid = 'NT-' + secrets.token_hex(8)
        conn.execute('INSERT INTO notifications (id, user_id, violation_id, kind, title, body, read_at, created_at) '
                     'VALUES (?,?,?,?,?,?,NULL,?)',
                     (nid, o['id'], row['id'], 'violation.notified', NOTIFY_TITLE, body, now))
        created.append({'id': nid, 'username': o['username'], 'title': NOTIFY_TITLE, 'body': body,
                        'violation_id': row['id'], 'kind': 'violation.notified', 'created_at': now})
    return created


def parse_bound(s: str, end: bool) -> str:
    """Chuỗi ngày/giờ từ query → mốc UTC ISO. Ngày không kèm giờ tính theo giờ Việt Nam (UTC+7);
    `to` dạng ngày lấy hết ngày đó. Sai định dạng → 422."""
    raw = (s or '').strip()
    if not raw or len(raw) > 40:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Ngày không hợp lệ'))
    try:
        d = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Ngày không hợp lệ (dùng YYYY-MM-DD hoặc ISO 8601)'))
    local = timezone(timedelta(hours=LOCAL_TZ_HOURS))
    if d.tzinfo is None:
        d = d.replace(tzinfo=local)
        if end and len(raw) == 10:
            d = d.replace(hour=23, minute=59, second=59)
    return d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def range_clauses(from_: str, to: str):
    """Điều kiện SQL theo `occurred_at` (so sánh qua datetime() để đúng múi giờ và có/không mili giây)."""
    clauses, args = [], []
    if from_:
        clauses.append('datetime(occurred_at) >= datetime(?)')
        args.append(parse_bound(from_, end=False))
    if to:
        clauses.append('datetime(occurred_at) <= datetime(?)')
        args.append(parse_bound(to, end=True))
    return clauses, args


async def announce_violation(row: dict, owner_usernames: list):
    """`violation.updated`: cán bộ nhận đủ ghi chú duyệt; chủ xe chỉ nhận trạng thái (review = null)."""
    await broadcast('violation.updated', {'id': row['id'], 'status': row['status'], 'review': row['review']},
                    to_roles=OFFICER_ROLES)
    if owner_usernames:
        await broadcast('violation.updated', {'id': row['id'], 'status': row['status'], 'review': None},
                        to_users=owner_usernames)


async def push_notifications(items: list):
    """`notification.new` gửi RIÊNG tới từng chủ tài khoản (không phát cho người khác)."""
    for n in items:
        await broadcast('notification.new', {'id': n['id'], 'title': n['title'], 'body': n['body'],
                                             'violation_id': n['violation_id'], 'kind': n['kind'],
                                             'created_at': n['created_at']}, to_users=[n['username']])
