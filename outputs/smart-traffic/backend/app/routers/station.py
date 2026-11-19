import base64
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app import config, heat, command_service
from app import snapshot as snapshots
from app.auth import StationLimiter, require_role, bearer_of
from app.db import connect
from app.errors import err
from app.lifecycle import OFFICER_ROLES, announce_violation, auto_process_violation, push_notifications
from app.penalties import penalty_for
from app.schemas import HeatIn, ViolationIn, LeaseClaimIn, CommandAckIn, SnapshotIn
from app.vms import report_from_station
from app.ws import broadcast

router = APIRouter(prefix='/api/v1/station', tags=['station'])
MEDIA_NAME = re.compile(r'^(CAM-[A-Z]{2,3}-[0-9]{3})\.(mp4|jpg|png)$')
FRAMES = {}   # camera_id → frame mới nhất


def _station_guard(group):
    # §11 (STATION-a): hạn mức theo NHÓM — mỗi nhóm một cửa sổ riêng, 429 kèm Retry-After.
    def dep(request: Request):
        claims = command_service.station_claims(bearer_of(request))
        StationLimiter.check(claims['sub'], group)
        return claims
    return dep


STATION = _station_guard('violation')             # vi phạm, bằng chứng, media, nhịp sống
STATION_TELEMETRY = _station_guard('telemetry')   # metrics, heat
STATION_FRAME = _station_guard('frame')           # khung stream


def v1_station(request: Request):
    claims = command_service.station_claims(bearer_of(request))
    if not claims.get('capability'):
        command_service.failure(403, 'FORBIDDEN', 'Giao thức v1 cần capability lease')
    return claims


@router.post('/lease')
async def claim_lease(body: LeaseClaimIn, claims=Depends(require_role('station'))):
    value, events = command_service.claim(body, claims)
    await command_service.publish(events)
    return value


@router.put('/lease')
async def renew_lease(claims=Depends(v1_station)):
    value, events = command_service.renew(claims['capability'])
    await command_service.publish(events)
    return value


@router.delete('/lease')
async def release_lease(claims=Depends(v1_station)):
    value, events = command_service.renew(claims['capability'], release=True)
    await command_service.publish(events)
    return value


@router.get('/commands/pending')
async def pending_commands(claims=Depends(v1_station)):
    value, events = command_service.pending(claims['capability'])
    await command_service.publish(events)
    return value


@router.post('/commands/{command_id}/ack')
async def acknowledge_command(command_id: str, body: CommandAckIn, claims=Depends(v1_station)):
    value, events = command_service.acknowledge(claims['capability'], command_id, body)
    await command_service.publish(events)
    return value


@router.post('/snapshot')
async def update_snapshot(body: SnapshotIn, claims=Depends(v1_station)):
    value = body.snapshot
    simulation = value.get('simulation', {})
    if (not isinstance(simulation, dict) or simulation.get('mode') not in ('fixed', 'smart') or
            not isinstance(simulation.get('t_sim'), (int, float)) or
            not all(isinstance(value.get(k), list) for k in ('junctions', 'routes', 'cameras')) or
            not isinstance(value.get('kpi'), dict)):
        command_service.failure(422, 'VALIDATION', 'Snapshot không hợp lệ')
    with connect(immediate=True) as conn:
        command_service.guard_write(conn, claims)
        snapshots.put_state(conn, 'snapshot', value)
        event = snapshots.snapshot_event(conn)
    await command_service.publish([event])
    return {'ok': True}


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
    if claims.get('capability'):
        value, events = command_service.pending(claims['capability'])
        await command_service.publish(events)
        return {'ok': True, 'server_time': _now(), **value}
    return {'ok': True, 'server_time': _now(), 'commands': []}


@router.post('/metrics')
async def metrics(body: dict, claims=Depends(STATION_TELEMETRY)):
    kpi = body.get('kpi', {})
    with connect(immediate=True) as conn:
        command_service.guard_write(conn, claims)
        conn.execute('INSERT INTO kpi_samples (t_sim, window_s, wait_avg_s, wait_p95_s, queue_max, queue_avg, flow_per_min, mode, scenario_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                     (body.get('t_sim', body.get('t')), 60, kpi.get('wait_avg_s', 0), 0, kpi.get('queue_max', 0), 0, kpi.get('flow_per_min', 0), body.get('signal_mode', 'fixed'), None, _now()))
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
        if claims.get('capability'):
            state = snapshots.controls(conn)
            state.update(mode=body.get('signal_mode', state['mode']), overrides=body.get('overrides', state['overrides']))
            snapshots.put_state(conn, 'controls', state)
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
    data['penalty'] = penalty_for(data['violation_code'], data['vehicle_class'], data['signal'])
    auto = None
    with connect(immediate=True) as conn:
        command_service.guard_write(conn, claims)
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
        if config.AUTO_VIOLATIONS:
            # Chế độ demo: không để vi phạm nằm chờ cán bộ bấm; tự xác nhận + báo về.
            # Tỷ lệ nhỏ tự sinh khiếu nại để diễn tập quy trình xử lý khiếu nại.
            auto = auto_process_violation(conn, vid, complaint_pct=config.AUTO_COMPLAINT_PCT)
            row = auto['row']
            status = row['status']
        else:
            row = conn.execute('SELECT plate, violation_code, node_id, camera_id, confidence FROM violations WHERE id=?', (vid,)).fetchone()
    await broadcast('violation.created', {'id': vid, 'status': status, 'plate': row['plate'],
                                          'violation_code': row['violation_code'], 'occurred_at': now,
                                          'node_id': row['node_id'], 'camera_id': row['camera_id'],
                                          'confidence': row['confidence']}, to_roles=OFFICER_ROLES)
    if auto:
        owner_names = [o['username'] for o in auto['owners']]
        await announce_violation(auto['row'], owner_names)
        await push_notifications(auto['notifications'])
        if auto['complaint']:
            await broadcast('complaint.updated',
                            {'id': auto['complaint']['id'], 'status': 'open', 'violation_id': vid},
                            to_roles=OFFICER_ROLES, to_users=owner_names or None)
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
    with connect(immediate=True) as conn:
        command_service.guard_write(conn, claims)
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
        # Giữ lease lock tới khi ghi xong, không để callback cũ ghi sau takeover.
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
    with connect(immediate=True) as conn:
        command_service.guard_write(conn, claims)
        conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                     (mid, 'video' if mime.startswith('video/') else 'image', str(dest), mime, len(data), sha, m.group(1), _now()))
        dest.write_bytes(data)
    return {'media_id': mid, 'camera_id': m.group(1)}


@router.post('/heat')
async def post_heat(body: HeatIn, claims=Depends(STATION_TELEMETRY)):
    """Bản đồ nhiệt + cảnh báo kẹt từ trạm (M4c). Lỗi hình dạng/giới hạn → 422 thống nhất."""
    result = await heat.ingest(body, guard=lambda conn: command_service.guard_write(conn, claims))
    return {'ok': True, **result}


@router.post('/frames')
async def post_frame(body: dict, claims=Depends(STATION_FRAME)):
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
    frame = {'seq': body.get('seq'), 't': body.get('t'), 'w': body.get('w'), 'h': body.get('h'), 'jpeg': raw}
    with connect(immediate=True) as conn:
        lease = command_service.guard_write(conn, claims)
        (config.VAR_DIR / 'frames' / f'{cam}-latest.jpg').write_bytes(raw)
        if lease:
            value = snapshots.read_snapshot(conn)
            previous = next((c for c in value['cameras'] if c['camera_id'] == cam), {})
            metadata = {**previous, 'camera_id': cam, 'junction_id': previous.get('junction_id'),
                        'label': previous.get('label', cam), 'frame_id': body.get('frame_id') or f"{lease['generation']}-{body.get('seq')}",
                        'source': 'live', 'status': 'ready', 'captured_at': body.get('t'), 'width': body.get('w'), 'height': body.get('h')}
            value['cameras'] = [c for c in value['cameras'] if c['camera_id'] != cam] + [metadata]
            snapshots.put_state(conn, 'snapshot', value)
    FRAMES[cam] = frame
    await broadcast('stream.updated', {'camera_id': cam, 'seq': body.get('seq')},
                    to_roles=['officer', 'commander', 'admin'])
    return {'ok': True}
