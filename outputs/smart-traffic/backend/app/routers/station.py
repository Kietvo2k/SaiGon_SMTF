import base64
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app import config, heat
from app.auth import StationLimiter, require_role
from app.db import connect
from app.errors import err
from app.schemas import HeatIn, ViolationIn
from app.vms import report_from_station
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/station', tags=['station'])
MEDIA_NAME = re.compile(r'^(CAM-[A-Z]{2,3}-[0-9]{3})\.(mp4|jpg|png)$')
FRAMES = {}   # camera_id → frame mới nhất


def _station_guard(claims=Depends(require_role('station'))):
    # §11: ≤ 200 request/phút/station → 429 (mọi endpoint của trạm).
    StationLimiter.check(claims['sub'])
    return claims


STATION = _station_guard


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _sniff(data: bytes):
    """Nhận diện mime thật từ magic bytes; KHÔNG tin `content_type` do client gửi (§11)."""
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg', '.jpg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png', '.png'
    if len(data) >= 12 and data[4:8] == b'ftyp':
        return 'video/mp4', '.mp4'
    return None, None


@router.post('/heartbeat')
async def heartbeat(body: dict, claims=Depends(STATION)):
    return {'ok': True, 'server_time': _now(), 'commands': []}


@router.post('/metrics')
async def metrics(body: dict, claims=Depends(STATION)):
    kpi = body.get('kpi', {})
    with connect() as conn:
        conn.execute('INSERT INTO kpi_samples (t_sim, window_s, wait_avg_s, wait_p95_s, queue_max, queue_avg, flow_per_min, mode, scenario_key) VALUES (?,?,?,?,?,?,?,?,?)',
                     (body.get('t_sim', body.get('t')), 60, kpi.get('wait_avg_s', 0), 0, kpi.get('queue_max', 0), 0, kpi.get('flow_per_min', 0), body.get('signal_mode', 'fixed'), None))
        conn.execute('INSERT INTO station_metrics (station_id, t, payload_json, created_at) VALUES (?,?,?,?)',
                     (body.get('station_id'), body.get('t'), json.dumps(body, ensure_ascii=False), _now()))
        # Nhật ký trạng thái đèn bền vững: trạm báo trạng thái pha thật → ghi `signal_state_log`.
        states = body.get('signal_states')
        if isinstance(states, list):
            for s in states:
                if not isinstance(s, dict) or not s.get('node_id'):
                    continue
                conn.execute('INSERT INTO signal_state_log (node_id, cluster_id, t_sim, phase, grp, mode, override_by, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                             (s.get('node_id'), s.get('cluster_id'), s.get('t_sim'), s.get('phase'), s.get('group'),
                              s.get('mode'), s.get('override_by'), s.get('reason'), _now()))
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
    # M6c: trạm báo nội dung VMS đang hiển thị (tùy chọn) → GET /officer/vms gộp hiển thị.
    if 'vms' in body:
        report_from_station(body.get('vms'))
    await broadcast('kpi.update', {'t': body.get('t'), 'wait_avg_s': kpi.get('wait_avg_s', 0),
                                   'queue_max': kpi.get('queue_max', 0), 'flow_per_min': kpi.get('flow_per_min', 0),
                                   'mode': body.get('signal_mode', 'fixed')}, to_roles=['officer', 'commander', 'admin'])
    return {'ok': True}


@router.post('/violations')
async def create_violation(body: ViolationIn, claims=Depends(STATION)):
    data = body.model_dump()
    with connect() as conn:
        cycle_id = data['cycle_id']
        dup = conn.execute('SELECT id FROM violations WHERE vehicle_id=? AND node_id=? AND cycle_id=? AND violation_code=?',
                           (data['vehicle_id'], data['node_id'], cycle_id, data['violation_code'])).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail=err('CONFLICT', 'Bản ghi trùng (vehicle_id, node_id, cycle_id, violation_code)'))
        day = datetime.now(timezone.utc).strftime('%Y%m%d')
        n = conn.execute("SELECT COUNT(*) AS n FROM violations WHERE id LIKE ?", (f'VP-{day}-%',)).fetchone()['n'] + 1
        vid = f'VP-{day}-{n:06d}'
        now = _now()
        status = 'needs_review' if data['priority_flag'] or data['confidence'] < 0.85 else 'new'
        conn.execute('''INSERT INTO violations (id, violation_code, status, plate, plate_format, vehicle_class, vehicle_color,
            vehicle_id, cycle_id, owner_name, owner_phone, is_scenario_plate, occurred_at, node_id, node_osm_id, node_label,
            camera_id, road_index, lane_index, signal_json, confidence, ocr_confidence, detection_json, penalty_json, sim_json,
            priority_flag, priority_reason, review_json, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (vid, data['violation_code'], status, data['plate'], data['plate_format'], data['vehicle_class'],
             data['vehicle_color'], data['vehicle_id'], cycle_id, data['owner_name'], data['owner_phone'],
             int(bool(data['is_scenario_plate'])), now, data['node_id'], data['node_osm_id'], data['node_label'],
             data['camera_id'], data['road_index'], data['lane_index'], json.dumps(data['signal'], ensure_ascii=False),
             data['confidence'], data['ocr_confidence'], json.dumps(data['detection'], ensure_ascii=False),
             json.dumps(data['penalty'], ensure_ascii=False), json.dumps(data['sim'], ensure_ascii=False),
             int(bool(data['priority_flag'])), data['priority_reason'], json.dumps({'by': None, 'at': None, 'note': None}), now, now))
        row = conn.execute('SELECT plate, violation_code, node_id, camera_id, confidence FROM violations WHERE id=?', (vid,)).fetchone()
    await broadcast('violation.created', {'id': vid, 'status': status, 'plate': row['plate'],
                                          'violation_code': row['violation_code'], 'occurred_at': now,
                                          'node_id': row['node_id'], 'camera_id': row['camera_id'],
                                          'confidence': row['confidence']}, to_roles=['officer', 'commander', 'admin'])
    return {'id': vid, 'status': status}


@router.post('/violations/{vid}/evidence')
async def upload_evidence(vid: str, file: UploadFile = File(...), kind: str = Form(...), claims=Depends(STATION)):
    if kind not in ('before', 'after', 'plate_crop'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'kind phải là before|after|plate_crop'))
    data = file.file.read(config.UPLOAD_MAX_BYTES + 1)
    if len(data) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=err('TOO_LARGE', 'File quá 50 MB'))
    mime, ext = _sniff(data)
    if mime is None:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Không nhận diện được ảnh/video (jpg|png|mp4)'))
    sha = hashlib.sha256(data).hexdigest()
    mid = f'MD-{secrets.token_hex(8)}'
    path = config.VAR_DIR / 'frames' / f'{mid}{ext}'
    with connect() as conn:
        if not conn.execute('SELECT id FROM violations WHERE id=?', (vid,)).fetchone():
            raise HTTPException(status_code=404, detail=err('NOT_FOUND', 'Không có vi phạm'))
        # Kiểm trùng kind TRƯỚC khi ghi để trả 409 (không để lại file mồ côi / khóa ghi).
        if conn.execute('SELECT id FROM evidence WHERE violation_id=? AND kind=?', (vid, kind)).fetchone():
            raise HTTPException(status_code=409, detail=err('CONFLICT', f'Đã có bằng chứng kind={kind} cho vi phạm này'))
        conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                     (mid, 'image' if mime.startswith('image/') else 'video', str(path), mime, len(data), sha, None, _now()))
        eid = f'EV-{vid}-{kind}'
        conn.execute('INSERT INTO evidence (id, violation_id, kind, media_id, captured_at, width, height, sha256) VALUES (?,?,?,?,?,?,?,?)',
                     (eid, vid, kind, mid, _now(), 0, 0, sha))
    # Ghi file SAU khi DB đã commit thành công (tránh file mồ côi khi insert lỗi).
    path.write_bytes(data)
    await broadcast('violation.evidence', {'violation_id': vid, 'kind': kind, 'media_id': mid, 'sha256': sha}, to_roles=['officer', 'commander', 'admin'])
    return {'media_id': mid, 'sha256': sha}


@router.post('/media')
async def upload_media(file: UploadFile = File(...), claims=Depends(STATION)):
    name = Path(file.filename or '').name
    if '/' in name or '\\' in name or '..' in name:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Tên file không hợp lệ'))
    m = MEDIA_NAME.fullmatch(name)
    if not m:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Tên file phải khớp ^(CAM-[A-Z]{2,3}-[0-9]{3})\\.(mp4|jpg|png)$'))
    data = file.file.read(config.UPLOAD_MAX_BYTES + 1)
    if len(data) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=err('TOO_LARGE', 'File quá 50 MB'))
    mime, ext = _sniff(data)
    if mime is None:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'Không nhận diện được ảnh/video (jpg|png|mp4)'))
    sha = hashlib.sha256(data).hexdigest()
    mid = f'MD-{secrets.token_hex(8)}'
    dest = config.VAR_DIR / 'frames' / f'{mid}{ext}'   # tên theo media_id, không dùng tên client
    with connect() as conn:
        conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                     (mid, 'video' if mime.startswith('video/') else 'image', str(dest), mime, len(data), sha, m.group(1), _now()))
    dest.write_bytes(data)
    return {'media_id': mid, 'camera_id': m.group(1)}


@router.post('/heat')
async def post_heat(body: HeatIn, claims=Depends(STATION)):
    """Bản đồ nhiệt + cảnh báo kẹt từ trạm (M4c). Lỗi hình dạng/giới hạn → 422 thống nhất."""
    result = await heat.ingest(body)
    return {'ok': True, **result}


@router.post('/frames')
async def post_frame(body: dict, claims=Depends(STATION)):
    cam = body.get('camera_id', '')
    if not MEDIA_NAME.fullmatch(f'{cam}.jpg'):
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'camera_id không hợp lệ'))
    raw_b64 = body.get('jpeg_base64', '')
    max_b64 = config.UPLOAD_MAX_BYTES * 4 // 3 + 8   # chặn body /station/frames trước khi decode
    if not isinstance(raw_b64, str) or len(raw_b64) > max_b64:
        raise HTTPException(status_code=413, detail=err('TOO_LARGE', 'Khung hình quá lớn'))
    try:
        raw = base64.b64decode(raw_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail=err('VALIDATION', 'jpeg_base64 không hợp lệ'))
    FRAMES[cam] = {'seq': body.get('seq'), 't': body.get('t'), 'w': body.get('w'), 'h': body.get('h'), 'jpeg': raw}
    (config.VAR_DIR / 'frames' / f'{cam}-latest.jpg').write_bytes(raw)
    await broadcast('stream.frame', {'camera_id': cam, 'seq': body.get('seq'), 'jpeg_base64': body.get('jpeg_base64')},
                    to_roles=['officer', 'commander', 'admin'])
    return {'ok': True}
