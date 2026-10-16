"""Nhãn lỗi theo từng mã (đặc tả §4.4): mỗi mã có nhãn riêng, tra cứu công dân trả đúng nhãn của mã đó."""
from app.schemas import VIOLATION_LABELS, VIOLATION_LABEL_FALLBACK, violation_label_of
def _login(client, username):
    tok = client.post('/api/v1/auth/login', json={'username': username, 'password': 'SaiGon@2026'}).json()
    return {'Authorization': f"Bearer {tok['access_token']}"}


def station_headers(client):
    return _login(client, 'station-3d')


def officer_headers(client):
    return _login(client, 'officer1')


def violation_body(**over):
    body = {
        'violation_code': 'RED-LIGHT', 'plate': '51K-123.45', 'plate_format': 'car', 'vehicle_class': 'car',
        'vehicle_color': 'trắng', 'vehicle_id': 'V-004231', 'owner_name': 'Nguyễn Văn A', 'owner_phone': '0901234567',
        'is_scenario_plate': False, 'node_id': 'HX-01', 'node_osm_id': 366390689, 'node_label': 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ',
        'camera_id': 'CAM-HX-001', 'road_index': 1287, 'lane_index': 4, 'cycle_id': 12,
        'signal': {'mode': 'smart', 'cluster_id': 'HX-C1', 'cycle_id': 12, 'phase_for_vehicle': 'red', 'group': 1,
                   'elapsed_in_phase_s': 2.4, 'cycle_s': 48.0, 'speed_kmh': 38.5, 'speed_limit_kmh': 50},
        'confidence': 0.9, 'ocr_confidence': 0.91,
        'detection': {'in_fov_s': 3.2, 'distance_m': 41.0, 'grace_s': 0.8, 'crossed_stop_line_at_s': 102.4},
        'evidence': [],
        'penalty': {'vnd_min': 18000000, 'vnd_max': 20000000, 'license_deduction_points': 4,
                    'source': 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', 'verified': True},
        'sim': {'t_sim': 102.4, 'seed': 31031, 'scenario': 'peak-hang-xanh', 'station_id': 'STATION-3D-01', 'station_time': '2026-10-14T09:29:58.2Z'},
    }
    body.update(over)
    return body

SPEC_CODES = ['RED-LIGHT', 'STOP-LINE', 'LANE', 'WRONG-WAY', 'SPEED', 'PARK', 'NO-HELMET', 'NO-PRIORITY',
              'OVERLOAD', 'WRONG-TURN', 'PHONE', 'NO-SEATBELT']


def test_bang_nhan_du_12_ma_cua_dac_ta():
    assert sorted(VIOLATION_LABELS) == sorted(SPEC_CODES)
    for code in SPEC_CODES:
        label = violation_label_of(code)
        assert label and label != VIOLATION_LABEL_FALLBACK, code
    assert len({violation_label_of(c) for c in SPEC_CODES}) == len(SPEC_CODES), 'hai mã không được cùng nhãn'


def test_nhan_dung_cho_mot_so_ma():
    assert violation_label_of('RED-LIGHT') == 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông'
    assert violation_label_of('NO-HELMET') == 'Không đội mũ bảo hiểm khi điều khiển xe máy'
    assert violation_label_of('WRONG-WAY') == 'Đi ngược chiều đường một chiều'
    assert violation_label_of('SPEED') == 'Chạy quá tốc độ quy định'


def test_ma_la_hoac_rong_ra_nhan_chung():
    assert violation_label_of('XYZ') == VIOLATION_LABEL_FALLBACK
    assert violation_label_of(None) == VIOLATION_LABEL_FALLBACK


def test_tra_cuu_cong_dan_tra_dung_nhan_tung_ma(client):
    """Vi phạm NO-HELMET (xe máy) đã xác nhận: tra cứu công dân phải ghi nhãn mũ bảo hiểm, không phải vượt đèn đỏ."""
    st = station_headers(client)
    body = violation_body(violation_code='NO-HELMET', plate='59-X9 999.99', plate_format='motorbike', vehicle_class='motorbike',
                          vehicle_id='V-000777', cycle_id=21, is_scenario_plate=True,
                          penalty={'vnd_min': 400000, 'vnd_max': 600000, 'license_deduction_points': 0,
                                   'source': 'NĐ 168/2024 · Điều 7 · khoản 2 · điểm h, điểm i', 'verified': True})
    vid = client.post('/api/v1/station/violations', headers=st, json=body).json()['id']
    assert client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=officer_headers(client),
                       json={'note': 'kiểm thử nhãn'}).status_code == 200
    items = client.get('/api/v1/public/lookup', params={'plate': '59-X9 999.99', 'vehicle_class': 'motorbike'}).json()['items']
    mine = [i for i in items if i['id'] == vid]
    assert mine, items
    assert mine[0]['violation_code'] == 'NO-HELMET'
    assert mine[0]['violation_label'] == violation_label_of('NO-HELMET')
    assert mine[0]['violation_label'] != violation_label_of('RED-LIGHT')
