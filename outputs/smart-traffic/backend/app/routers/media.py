from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app import config
from app.auth import decode_token
from app.db import get_conn
from app.errors import err
from app.routers.citizen import CITIZEN_STATUSES

router = APIRouter(prefix='/api/v1/media', tags=['media'])


@router.get('/{media_id}')
def get_media(media_id: str, request: Request):
    conn = get_conn()
    row = conn.execute('SELECT * FROM media_assets WHERE id=?', (media_id,)).fetchone()
    if not row or not Path(row['path']).exists():
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có media'))
    # Phân quyền: officer/commander/admin/station xem mọi media; công dân/ẩn danh chỉ xem
    # bằng chứng của vi phạm `confirmed+` (M1) — id ngẫu nhiên nhưng KHÔNG đủ để bỏ qua kiểm quyền.
    role = None
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            role = decode_token(auth[7:]).get('role')
        except Exception:
            role = None
    if role not in ('officer', 'commander', 'admin', 'station'):
        placeholders = ','.join('?' * len(CITIZEN_STATUSES))
        linked = conn.execute(
            f'SELECT v.status AS status FROM evidence e JOIN violations v ON v.id=e.violation_id WHERE e.media_id=? AND v.status IN ({placeholders})',
            (media_id, *CITIZEN_STATUSES)).fetchone()
        if not linked:
            raise HTTPException(status_code=403, detail=err('FORBIDDEN', 'Không đủ quyền xem media'))
    return FileResponse(row['path'], media_type=row['mime'], headers={'ETag': row['sha256']})


def _frame_path(camera_id: str):
    p = config.VAR_DIR / 'frames' / f'{camera_id}-latest.jpg'
    if not p.exists():
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có khung hình'))
    return p


@router.get('/stream/{camera_id}')
def stream(camera_id: str, fps: int = 2):
    from app.routers.station import FRAMES
    if camera_id not in FRAMES:
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có khung hình'))
    return FileResponse(_frame_path(camera_id), media_type='image/jpeg')


@router.get('/video/{camera_id}')
def video(camera_id: str):
    p = config.ROOT_DIR / 'media' / 'cameras' / f'{camera_id}.mp4'
    if not p.exists():
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có video'))
    return FileResponse(p, media_type='video/mp4')
