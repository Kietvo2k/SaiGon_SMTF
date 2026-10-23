import json

from fastapi import APIRouter, HTTPException

from app import heat
from app.db import connect
from app.errors import err
from app.penalties import public_penalty
from app.schemas import public_plate_candidates, violation_label_of

router = APIRouter(prefix='/api/v1/public', tags=['public'])
# M1 chỉ có 4 trạng thái; công dân chỉ thấy vi phạm từ `confirmed` trở lên (ẩn `new`/`needs_review`/`dismissed`).
CITIZEN_STATUSES = ('confirmed', 'notified', 'paid', 'disputed')


@router.get('/lookup')
def lookup(plate: str, vehicle_class: str = 'car'):
    try:
        plates = public_plate_candidates(plate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=err('VALIDATION', str(exc))) from exc
    placeholders = ','.join('?' * len(CITIZEN_STATUSES))
    plate_placeholders = ','.join('?' * len(plates))
    with connect() as conn:
        rows = conn.execute(f'SELECT * FROM violations WHERE plate IN ({plate_placeholders}) AND status IN ({placeholders}) ORDER BY occurred_at DESC LIMIT 50',
                            (*plates, *CITIZEN_STATUSES)).fetchall()
        items = []
        for r in rows:
            penalty = json.loads(r['penalty_json'] or '{}')
            ev = conn.execute('SELECT kind, media_id FROM evidence WHERE violation_id=?', (r['id'],)).fetchall()
            items.append({
                'id': r['id'], 'violation_code': r['violation_code'],
                'violation_label': violation_label_of(r['violation_code']),
                'occurred_at': r['occurred_at'], 'node_label': r['node_label'], 'camera_id': r['camera_id'],
                'status': r['status'],
                # Chưa xác minh → KHÔNG lộ số tiền (null); web hiện "Mức phạt đang cập nhật…".
                'penalty': public_penalty(penalty),
                'evidence': [{'kind': e['kind'], 'url': f"/api/v1/media/{e['media_id']}"} for e in ev],
            })
    return {'items': items, 'total': len(items)}


@router.get('/alerts')
def public_alerts():
    """Cảnh báo kẹt công khai (M4c): chỉ tên đường, mức, xác suất làm tròn và số phút; không cần đăng nhập."""
    with connect() as conn:
        return heat.public_view(conn)
