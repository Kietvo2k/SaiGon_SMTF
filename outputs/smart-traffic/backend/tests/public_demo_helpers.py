"""Tiện ích HTTP của test: lease và pending/ACK tường minh, không autouse."""
from tests.m6_helpers import hdr


def claim_station(client, headers=None, station_id='STATION-3D-01', owner_id='pytest-owner'):
    result = client.post('/api/v1/station/lease', headers=headers or hdr(client, 'station-3d'),
                         json={'station_id': station_id, 'owner_id': owner_id})
    assert result.status_code == 200, result.text
    lease = result.json()
    assert lease['station_id'] == station_id and lease['owner_id'] == owner_id
    assert isinstance(lease['generation'], int) and lease['generation'] > 0
    assert lease['capability'] and lease['expires_at']
    return lease


def capability_headers(lease):
    return {'Authorization': 'Bearer ' + lease['capability']}


def apply_command(client, response, lease, t_sim=100.0):
    """Test mô phỏng trạm sau callback thành công; kết quả HTTP cũ vẫn pending."""
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['status'] == 'pending', 'HTTP 200 chỉ xác nhận nhận lệnh'
    command_id = body['command_id']
    headers = capability_headers(lease)
    renewed = client.put('/api/v1/station/lease', headers=headers,
                         json={'station_id': lease['station_id'], 'owner_id': lease['owner_id']})
    assert renewed.status_code == 200, renewed.text
    pending = client.get('/api/v1/station/commands/pending', headers=headers)
    assert pending.status_code == 200, pending.text
    commands = pending.json()['commands']
    delivered = [command for command in commands if command['command_id'] == command_id]
    assert len(delivered) == 1, 'Trạm phải dequeue đúng một bản command trước ACK'
    assert delivered[0]['event'].startswith('cmd.') and delivered[0]['deadline_at']
    result = client.post('/api/v1/station/commands/' + command_id + '/ack', headers=headers,
                         json={'status': 'applied', 'applied_t_sim': t_sim})
    assert result.status_code == 200, result.text
    assert result.json()['status'] == 'applied'
    assert result.json()['applied_t_sim'] == t_sim
    return result.json()


def snapshot_body(marker=73.4):
    """Dữ liệu do test tự tạo; không dùng snapshot từ runtime/fixture UI."""
    return {
        'snapshot_version': 'public-demo-v1', 'revision': 0, 'build_id': 'hardtest-local',
        'station': {'status': 'active', 'id': 'STATION-3D-01', 'last_seen_at': '2026-11-19T01:00:00Z'},
        'simulation': {'seed': 31034, 'scenario': 'none', 'mode': 'fixed', 't_sim': marker, 'paused': True},
        'junctions': [{'junction_id': 'HX-C1', 'node_ids': ['HX-01'], 'label': 'Hàng Xanh', 'phase': 'green', 'group': 0, 'decision': None}],
        'kpi': {'wait_avg_s': 4.25, 'queue_max': 7, 'flow_per_min': 31, 'trips_completed': 6, 'admission_wait': 2, 'recoveries': 1},
        'routes': [],
        'cameras': [{'camera_id': 'CAM-HX-001', 'junction_id': 'HX-C1', 'label': 'Camera kiểm thử', 'source': 'live', 'status': 'missing', 'frame_id': None, 'captured_at': None, 'width': None, 'height': None}],
    }
