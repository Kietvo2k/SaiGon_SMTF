"""STATION-a: hạn mức gọi API của trạm tách THEO NHÓM + `Retry-After` khi 429.

Nhóm theo `config.STATION_RATE_LIMITS`: vi phạm/bằng chứng/media/nhịp sống 300/phút,
metrics/heat 60/phút, frames 150/phút. Mỗi nhóm một cửa sổ riêng — chặn nhóm này
KHÔNG làm chặn nhóm khác.
"""
from tests.test_station import station_headers

METRICS = {'station_id': 'STATION-3D-01', 't': '2026-10-14T09:30:05Z', 'kpi': {'wait_avg_s': 1, 'queue_max': 1, 'flow_per_min': 1}}
HEARTBEAT = {'station_id': 'STATION-3D-01', 'app_version': '32a', 't': '2026-10-14T09:30:00Z'}
FRAME = {'camera_id': 'CAM-HX-001', 'seq': 1, 't': '2026-10-14T09:30:00Z', 'jpeg_base64': 'QUJD', 'w': 1, 'h': 1}


def _retry_after(res):
    raw = res.headers.get('retry-after')
    assert raw is not None, '429 phải kèm header Retry-After (giây)'
    assert raw.isdigit(), raw
    return int(raw)


def test_telemetry_group_60_per_minute_blocked_with_retry_after(client):
    h = station_headers(client)
    for i in range(60):
        r = client.post('/api/v1/station/metrics', headers=h, json=METRICS)
        assert r.status_code == 200, (i, r.text)
    over = client.post('/api/v1/station/metrics', headers=h, json=METRICS)
    assert over.status_code == 429, over.text
    assert 1 <= _retry_after(over) <= 60
    assert over.json()['error']['code'] == 'RATE_LIMITED'
    # heat dùng CHUNG nhóm telemetry → cũng bị chặn
    assert client.post('/api/v1/station/heat', headers=h, json={}).status_code == 429


def test_frame_group_150_per_minute_blocked_with_retry_after(client):
    h = station_headers(client)
    for i in range(150):
        r = client.post('/api/v1/station/frames', headers=h, json=FRAME)
        assert r.status_code == 200, (i, r.text)
    over = client.post('/api/v1/station/frames', headers=h, json=FRAME)
    assert over.status_code == 429, over.text
    assert 1 <= _retry_after(over) <= 60


def test_violation_group_300_per_minute_blocked_with_retry_after(client):
    h = station_headers(client)
    for i in range(300):
        r = client.post('/api/v1/station/heartbeat', headers=h, json=HEARTBEAT)
        assert r.status_code == 200, (i, r.text)
    over = client.post('/api/v1/station/heartbeat', headers=h, json=HEARTBEAT)
    assert over.status_code == 429, over.text
    assert 1 <= _retry_after(over) <= 60


def test_groups_have_separate_windows(client):
    h = station_headers(client)
    for _ in range(60):
        assert client.post('/api/v1/station/metrics', headers=h, json=METRICS).status_code == 200
    assert client.post('/api/v1/station/metrics', headers=h, json=METRICS).status_code == 429
    # nhóm vi phạm và frames KHÔNG bị ảnh hưởng bởi nhóm telemetry
    assert client.post('/api/v1/station/heartbeat', headers=h, json=HEARTBEAT).status_code == 200
    assert client.post('/api/v1/station/frames', headers=h, json=FRAME).status_code == 200
