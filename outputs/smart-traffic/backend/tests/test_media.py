import base64
import io

from tests.test_station import station_headers


def test_media_stream_and_get(client):
    h = station_headers(client)
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    client.post('/api/v1/station/frames', headers=h, json={
        'camera_id': 'CAM-HX-001', 'seq': 1, 't': '2026-10-14T09:30:00Z',
        'jpeg_base64': base64.b64encode(png).decode(), 'w': 1, 'h': 1})
    r = client.get('/api/v1/media/stream/CAM-HX-001')
    assert r.status_code == 200
    missing = client.get('/api/v1/media/stream/CAM-HX-002')
    assert missing.status_code == 404
    no_video = client.get('/api/v1/media/video/CAM-HX-001')
    assert no_video.status_code == 404
