import base64
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app import config
from app.auth import require_role
from app.db import get_conn
from app.errors import err
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/station', tags=['station'])
STATION = require_role('station')
MEDIA_NAME = re.compile(r'^(CAM-[A-Z]{2,3}-[0-9]{3})\.(mp4|jpg|png)$')
FRAMES = {}   # camera_id → frame mới nhất


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


@router.post('/heartbeat')
async def heartbeat(body: dict, claims=Depends(STATION)):
    return {'ok': True, 'server_time': _now(), 'commands': []}


@router.post('/metrics')
async def metrics(body: dict, claims=Depends(STATION)):
    conn = get_conn()
    kpi = body.get('kpi', {})
    conn.execute('INSERT INTO kpi_samples (t_sim, window_s, wait_avg_s, wait_p95_s, queue_max, queue_avg, flow_per_min, mode, scenario_key) VALUES (?,?,?,?,?,?,?,?,?)',
                 (body.get('t_sim', body.get('t')), 60, kpi.get('wait_avg_s', 0), 0, kpi.get('queue_max', 0), 0, kpi.get('flow_per_min', 0), body.get('signal_mode', 'fixed'), None))
    conn.execute('INSERT INTO station_metrics (station_id, t, payload_json, created_at) VALUES (?,?,?,?)',
                 (body.get('station_id'), body.get('t'), json.dumps(body, ensure_ascii=False), _now()))
    conn.commit()
    # Trạm báo lại danh sách override đang áp dụng (kèm `until_t_sim` theo đồng hồ sim) → lưu trạng thái.
    ovs = body.get('overrides')
    if isinstance(ovs, list):
        from app.routers.officer import OVERRIDES
        live = {o.get('node_id') for o in ovs if o.get('node_id')}
        for o in ovs:
            if o.get('node_id'):
                OVERRIDES[o['node_id']] = o
        for nid in list(OVERRIDES):
            if nid not in live:
                OVERRIDES.pop(nid, None)
    await broadcast('kpi.update', {'t': body.get('t'), 'wait_avg_s': kpi.get('wait_avg_s', 0),
                                   'queue_max': kpi.get('queue_max', 0), 'flow_per_min': kpi.get('flow_per_min', 0),
                                   'mode': body.get('signal_mode', 'fixed')}, to_roles=['officer', 'commander', 'admin'])
    return {'ok': True}


@router.post('/violations')
async def create_violation(body: dict, claims=Depends(STATION)):
    conn = get_conn()
    # cycle_id nằm ở `signal.cycle_id` (shape bản ghi T3); fallback cấp gốc cho tương thích.
    cycle_id = (body.get('signal') or {}).get('cycle_id', body.get('cycle_id'))
    dup = conn.execute('SELECT id FROM violations WHERE vehicle_id=? AND node_id=? AND cycle_id=? AND violation_code=?',
                       (body.get('vehicle_id'), body.get('node_id'), cycle_id, body.get('violation_code'))).fetchone()
    if dup:
        raise HTTPException(status_code=409, detail=err('CONFLICT', 'Bản ghi trùng (vehicle_id, node_id, cycle_id, violation_code)'))
    day = datetime.now(timezone.utc).strftime('%Y%m%d')
    n = conn.execute("SELECT COUNT(*) AS n FROM violations WHERE id LIKE ?", (f'VP-{day}-%',)).fetchone()['n'] + 1
    vid = f'VP-{day}-{n:06d}'
    now = _now()
    status = 'needs_review' if body.get('priority_flag') or body.get('confidence', 0) < 0.85 else 'new'
    conn.execute('''INSERT INTO violations (id, violation_code, status, plate, plate_format, vehicle_class, vehicle_color,
        vehicle_id, cycle_id, owner_name, owner_phone, is_scenario_plate, occurred_at, node_id, node_osm_id, node_label,
        camera_id, road_index, lane_index, signal_json, confidence, ocr_confidence, detection_json, penalty_json, sim_json,
        priority_flag, priority_reason, review_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (vid, body.get('violation_code'), status, body.get('plate'), body.get('plate_format'), body.get('vehicle_class'),
         body.get('vehicle_color'), body.get('vehicle_id'), cycle_id, body.get('owner_name'), body.get('owner_phone'),
         int(bool(body.get('is_scenario_plate'))), now, body.get('node_id'), body.get('node_osm_id'), body.get('node_label'),
         body.get('camera_id'), body.get('road_index'), body.get('lane_index'), json.dumps(body.get('signal', {}), ensure_ascii=False),
         body.get('confidence', 0), body.get('ocr_confidence', 0), json.dumps(body.get('detection', {}), ensure_ascii=False),
         json.dumps(body.get('penalty', {}), ensure_ascii=False), json.dumps(body.get('sim', {}), ensure_ascii=False),
         int(bool(body.get('priority_flag'))), body.get('priority_reason'), json.dumps({'by': None, 'at': None, 'note': None}), now, now))
    conn.commit()
    row = conn.execute('SELECT * FROM violations WHERE id=?', (vid,)).fetchone()
    await broadcast('violation.created', {'id': vid, 'status': status, 'plate': row['plate'],
                                          'violation_code': row['violation_code'], 'occurred_at': now,
                                          'node_id': row['node_id'], 'camera_id': row['camera_id'],
                                          'confidence': row['confidence']}, to_roles=['officer', 'commander', 'admin'])
    return {'id': vid, 'status': status}


@router.post('/violations/{vid}/evidence')
async def upload_evidence(vid: str, file: UploadFile = File(...), kind: str = Form(...), claims=Depends(STATION)):
    if kind not in ('before', 'after', 'plate_crop'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'kind phải là before|after|plate_crop'))
    conn = get_conn()
    if not conn.execute('SELECT id FROM violations WHERE id=?', (vid,)).fetchone():
        raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
    data = file.file.read(config.UPLOAD_MAX_BYTES + 1)
    if len(data) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=err('TOO_LARGE', 'File quá 50 MB'))
    sha = hashlib.sha256(data).hexdigest()
    mid = f'MD-{secrets.token_hex(8)}'   # id ngẫu nhiên khó đoán
    path = config.VAR_DIR / 'frames' / f'{mid}.png'
    path.write_bytes(data)
    conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                 (mid, 'image', str(path), file.content_type or 'image/png', len(data), sha, None, _now()))
    eid = f'EV-{vid}-{kind}'
    conn.execute('INSERT INTO evidence (id, violation_id, kind, media_id, captured_at, width, height, sha256) VALUES (?,?,?,?,?,?,?,?)',
                 (eid, vid, kind, mid, _now(), 0, 0, sha))
    conn.commit()
    await broadcast('violation.evidence', {'violation_id': vid, 'kind': kind, 'media_id': mid, 'sha256': sha}, to_roles=['officer', 'commander', 'admin'])
    return {'media_id': mid, 'sha256': sha}


@router.post('/media')
async def upload_media(file: UploadFile = File(...), claims=Depends(STATION)):
    name = Path(file.filename or '').name
    if '/' in name or '\\' in name or '..' in name:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Tên file không hợp lệ'))
    m = MEDIA_NAME.match(name)
    if not m:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Tên file phải khớp ^(CAM-[A-Z]{2,3}-[0-9]{3})\\.(mp4|jpg|png)$'))
    data = file.file.read(config.UPLOAD_MAX_BYTES + 1)
    if len(data) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=err('TOO_LARGE', 'File quá 50 MB'))
    sha = hashlib.sha256(data).hexdigest()
    mid = f'MD-{secrets.token_hex(8)}'
    dest = config.VAR_DIR / 'frames' / name
    dest.write_bytes(data)
    conn = get_conn()
    conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                 (mid, 'video' if name.endswith('.mp4') else 'image', str(dest), file.content_type or 'application/octet-stream',
                  len(data), sha, m.group(1), _now()))
    conn.commit()
    return {'media_id': mid, 'camera_id': m.group(1)}


@router.post('/frames')
async def post_frame(body: dict, claims=Depends(STATION)):
    cam = body.get('camera_id', '')
    if not MEDIA_NAME.match(f'{cam}.jpg'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'camera_id không hợp lệ'))
    raw = base64.b64decode(body.get('jpeg_base64', ''))
    FRAMES[cam] = {'seq': body.get('seq'), 't': body.get('t'), 'w': body.get('w'), 'h': body.get('h'), 'jpeg': raw}
    (config.VAR_DIR / 'frames' / f'{cam}-latest.jpg').write_bytes(raw)
    await broadcast('stream.frame', {'camera_id': cam, 'seq': body.get('seq'), 'jpeg_base64': body.get('jpeg_base64')},
                    to_roles=['officer', 'commander', 'admin'])
    return {'ok': True}
