import json
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def write(conn, *, actor, role, action, target_type, target_id,
          from_state=None, to_state=None, reason=None, payload=None):
    """Ghi một dòng nhật ký thao tác BỀN VỮNG vào `audit_log`.

    Phải gọi trên `conn` đang mở trong cùng transaction với thay đổi nghiệp vụ
    (không commit riêng) để nhật ký và dữ liệu cùng sống/chết.
    """
    conn.execute(
        'INSERT INTO audit_log (actor, role, action, target_type, target_id, from_state, to_state, reason, payload_json, created_at) '
        'VALUES (?,?,?,?,?,?,?,?,?,?)',
        (actor, role, action, target_type, target_id, from_state, to_state, reason,
         json.dumps(payload, ensure_ascii=False) if payload is not None else None, now_iso()))
