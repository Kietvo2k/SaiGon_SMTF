"""Policy nội bộ, chuyển từ hcmc-poc/violation-rules-32.js::penaltyOf32.

`verified` chỉ phản ánh bảng đã có của dự án, không phải kết luận pháp lý hay
xác nhận bằng chứng. Trạm gửi dữ kiện; backend quyết định policy và nguồn.
"""
import math


UNVERIFIED = 'chưa đối chiếu điều, khoản, điểm (cần xác minh)'
VEHICLE_CLASSES = frozenset(('car', 'motorbike', 'bus', 'truck'))


def _penalty(low=None, high=None, points=None, source=UNVERIFIED, verified=False):
    return {'vnd_min': low, 'vnd_max': high, 'license_deduction_points': points,
            'source': source, 'verified': verified}


def _finite_number(value):
    # Không ép chuỗi/bool thành số; không cho NaN/Infinity chọn nhánh mức phạt.
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def penalty_for(code: str, vehicle_class: str, signal: dict) -> dict:
    if vehicle_class not in VEHICLE_CLASSES:
        return _penalty()
    car = vehicle_class != 'motorbike'
    if code == 'RED-LIGHT':
        return (_penalty(18000000, 20000000, 4, 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', True) if car else
                _penalty(4000000, 6000000, 4, 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm c', True))
    if code == 'WRONG-WAY':
        return (_penalty(18000000, 20000000, 4, 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm d', True) if car else
                _penalty(4000000, 6000000, 2, 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm a; khoản 13 · điểm a', True))
    if code == 'LANE':
        return _penalty() if car else _penalty(600000, 800000, 0, 'NĐ 168/2024 · Điều 7 · khoản 3 · điểm d', True)
    if code == 'SPEED':
        speed, limit = signal.get('speed_kmh'), signal.get('speed_limit_kmh')
        if not (_finite_number(speed) and _finite_number(limit)) or speed < 0 or limit <= 0:
            return _penalty()
        excess = speed - limit
        # Perception của dự án chỉ ghi SPEED khi vượt giới hạn hơn 5 km/h.
        if excess <= 5:
            return _penalty()
        if not car:
            return (_penalty(6000000, 8000000, None, 'NĐ 168/2024 · Điều 7 · khoản 8 · điểm a') if excess > 20 else
                    _penalty(800000, 1000000, None, 'NĐ 168/2024 · Điều 7 · khoản 4 · điểm a'))
        if excess > 35:
            return _penalty(12000000, 14000000, 6, 'NĐ 168/2024 · Điều 6 · khoản 7 · điểm a', True)
        if excess > 20:
            return _penalty(6000000, 8000000, 4, 'NĐ 168/2024 · Điều 6 · khoản 6 · điểm a', True)
        if excess >= 10:
            return _penalty(4000000, 6000000, 2, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm đ', True)
        return _penalty(800000, 1000000, 0, 'NĐ 168/2024 · Điều 6 · khoản 3 · điểm a', True)
    if code == 'PARK':
        return (_penalty(4000000, 6000000, 2, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm k', True) if car else
                _penalty(400000, 600000, None, 'NĐ 168/2024 · Điều 7 · khoản 3 (chưa chốt điểm)'))
    if code == 'WRONG-TURN':
        return (_penalty(2000000, 3000000, 2, 'NĐ 168/2024 · Điều 6 · khoản 4 · điểm i, điểm k', True) if car else
                _penalty(200000, 400000, 0, 'NĐ 168/2024 · Điều 7 · khoản 1 · điểm k', True))
    if code == 'NO-HELMET' and not car:
        return _penalty(400000, 600000, 0, 'NĐ 168/2024 · Điều 7 · khoản 2 · điểm h, điểm i', True)
    if code == 'PHONE':
        return (_penalty(4000000, 6000000, 4, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm h; khoản 16 · điểm b', True) if car else
                _penalty(800000, 1000000, 4, 'NĐ 168/2024 · Điều 7 · khoản 4 · điểm đ; khoản 13 · điểm b', True))
    if code == 'NO-SEATBELT' and car:
        return _penalty(800000, 1000000, 0, 'NĐ 168/2024 · Điều 6 · khoản 3 · điểm k', True)
    return _penalty()


def public_penalty(penalty: dict) -> dict:
    """Whitelist trường policy công khai; chưa xác minh thì ẩn tiền và điểm trừ."""
    verified = penalty.get('verified') is True
    return {'vnd_min': penalty.get('vnd_min') if verified else None,
            'vnd_max': penalty.get('vnd_max') if verified else None,
            'license_deduction_points': penalty.get('license_deduction_points') if verified else None,
            'source': penalty.get('source'), 'verified': verified}
