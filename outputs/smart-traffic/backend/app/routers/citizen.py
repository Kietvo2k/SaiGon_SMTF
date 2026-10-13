import json

from fastapi import APIRouter, HTTPException

from app.db import connect
from app.errors import err

router = APIRouter(prefix='/api/v1/public', tags=['public'])
# M1 chỉ có 4 trạng thái; công dân chỉ thấy vi phạm từ `confirmed` trở lên (ẩn `new`/`needs_review`/`dismissed`).
CITIZEN_STATUSES = ('confirmed', 'notified', 'paid', 'disputed')


@router.get('/lookup')
def lookup(plate: str, vehicle_class: str = 'car'):
    if not plate:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Thiếu plate'))
    placeholders = ','.join('?' * len(CITIZEN_STATUSES))
    with connect() as conn:
        rows = conn.execute(f'SELECT * FROM violations WHERE plate=? AND status IN ({placeholders}) ORDER BY occurred_at DESC LIMIT 50',
                            (plate, *CITIZEN_STATUSES)).fetchall()
        items = []
        for r in rows:
            penalty = json.loads(r['penalty_json'] or '{}')
            verified = bool(penalty.get('verified'))
            ev = conn.execute('SELECT kind, media_id FROM evidence WHERE violation_id=?', (r['id'],)).fetchall()
            items.append({
                'id': r['id'], 'violation_code': r['violation_code'],
                'violation_label': 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
                'occurred_at': r['occurred_at'], 'node_label': r['node_label'], 'camera_id': r['camera_id'],
                'status': r['status'],
                # Chưa xác minh → KHÔNG lộ số tiền (null); web hiện "Mức phạt đang cập nhật…".
                'penalty': {'vnd_min': penalty.get('vnd_min') if verified else None,
                            'vnd_max': penalty.get('vnd_max') if verified else None,
                            'verified': verified},
                'evidence': [{'kind': e['kind'], 'url': f"/api/v1/media/{e['media_id']}"} for e in ev],
            })
    return {'items': items, 'total': len(items)}
