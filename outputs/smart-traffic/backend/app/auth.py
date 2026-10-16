import base64
import math
import os
import time

import bcrypt
import jwt
from fastapi import HTTPException, Request

from app import config

LOGIN_HITS = {}      # ip -> [epoch, count]
LOGIN_LOCKS = {}     # ip -> locked_until_epoch
REGISTER_HITS = {}   # ip -> [epoch, count] (đăng ký công dân, M6a)
REGISTER_LOCKS = {}
BIND_FAILS = {}      # user -> [epoch, count] số lần NHẬP SAI mã đăng ký xe (M6a)
BIND_LOCKS = {}
STATION_HITS = {}    # nhóm -> {station_id -> [epoch, count]} (STATION-a: mỗi nhóm một cửa sổ riêng)
# Hash bcrypt hợp lệ của một mật khẩu không tồn tại — dùng để chạy `bcrypt.checkpw` khi
# user không có, giữ thời gian phản hồi tương đương (không lộ user tồn tại — §11).
DUMMY_HASH = '$2b$12$QEkSPfjieoHD0TZDORzeWODSQRqRs1y2Sz1Mj2PuHoSzz/nCYcCgm'


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except ValueError:
        return False


def load_or_create_secret() -> str:
    p = config.JWT_SECRET_PATH
    if p.exists():
        return p.read_text(encoding='utf-8').strip()
    secret = base64.b64encode(os.urandom(48)).decode('ascii')
    p.write_text(secret, encoding='utf-8')
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass
    return secret


def make_token(user) -> str:
    now = int(time.time())
    payload = {'sub': user['username'], 'role': user['role'], 'iat': now, 'exp': now + config.JWT_TTL_S}
    return jwt.encode(payload, load_or_create_secret(), algorithm='HS256')


def decode_token(token: str) -> dict:
    try:
        claims = jwt.decode(token, load_or_create_secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Token không hợp lệ', 'detail': None}})
    # §11: token còn hiệu lực nhưng tài khoản đã bị khóa (`active=0`) cũng phải bị từ chối.
    # M6a: vai trò luôn đối chiếu với DB — token cũ sau khi admin đổi vai trò bị từ chối ngay,
    # không để cán bộ bị hạ quyền vẫn dùng quyền cũ tới khi hết 8 giờ.
    from app.db import get_conn
    conn = get_conn()
    try:
        row = conn.execute('SELECT active, role FROM users WHERE username=?', (claims.get('sub'),)).fetchone()
    finally:
        conn.close()
    if not row or not row['active'] or row['role'] != claims.get('role'):
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Tài khoản không hoạt động hoặc vai trò đã thay đổi', 'detail': None}})
    return claims


def bearer_of(request: Request) -> str:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Thiếu token', 'detail': None}})
    return auth[7:]


def require_role(*roles):
    def dep(request: Request):
        claims = decode_token(bearer_of(request))
        if claims.get('role') not in roles:
            raise HTTPException(status_code=403, detail={'error': {'code': 'FORBIDDEN', 'message': 'Không đủ quyền', 'detail': None}})
        request.state.claims = claims
        return claims
    return dep


def _purge_stale(bucket: dict, now: float, max_age: float):
    """Dọn bucket cũ để dict rate-limit không phình vô hạn."""
    if len(bucket) > 1000:
        for k in [k for k, v in bucket.items() if now - (v[0] if isinstance(v, tuple) else v) >= max_age]:
            bucket.pop(k, None)


class _Window:
    """Giới hạn `limit` lần/phút theo khóa; vượt → khóa tạm `lock_s` giây (§11).

    `check` chỉ kiểm khóa; `hit` đếm một lần (vượt ngưỡng thì khóa và raise 429).
    """

    def __init__(self, hits: dict, locks: dict, limit, lock_s, message: str):
        self.hits, self.locks, self.limit, self.lock_s, self.message = hits, locks, limit, lock_s, message

    def _limited(self):
        return HTTPException(status_code=429, detail={'error': {'code': 'RATE_LIMITED', 'message': self.message, 'detail': None}})

    def check(self, key: str):
        if time.time() < self.locks.get(key, 0):
            raise self._limited()

    def hit(self, key: str):
        now = time.time()
        window, count = self.hits.get(key, (now, 0))
        if now - window >= 60:
            window, count = now, 0
        count += 1
        self.hits[key] = (window, count)
        _purge_stale(self.hits, now, 120)
        for k in [k for k, v in self.locks.items() if now >= v]:
            self.locks.pop(k, None)
        if count > self.limit:
            self.locks[key] = now + self.lock_s
            raise self._limited()


_LOGIN = _Window(LOGIN_HITS, LOGIN_LOCKS, config.LOGIN_RATE_LIMIT, config.LOGIN_LOCK_S,
                 'Đăng nhập quá nhiều, thử lại sau 5 phút')
_REGISTER = _Window(REGISTER_HITS, REGISTER_LOCKS, config.LOGIN_RATE_LIMIT, config.LOGIN_LOCK_S,
                    'Đăng ký quá nhiều, thử lại sau 5 phút')
_BIND = _Window(BIND_FAILS, BIND_LOCKS, config.LOGIN_RATE_LIMIT, config.LOGIN_LOCK_S,
                'Nhập sai mã đăng ký xe quá nhiều, thử lại sau 5 phút')


def reset_limits():
    """Xóa toàn bộ bộ đếm giới hạn (chỉ dùng trong test: mỗi test một bộ đếm riêng)."""
    for d in (LOGIN_HITS, LOGIN_LOCKS, REGISTER_HITS, REGISTER_LOCKS, BIND_FAILS, BIND_LOCKS):
        d.clear()
    for group in STATION_HITS.values():   # STATION-a: lồng theo nhóm
        group.clear()


class LoginLimiter:
    @staticmethod
    def check(ip: str):
        _LOGIN.check(ip)
        _LOGIN.hit(ip)


class RegisterLimiter:
    """Đăng ký công dân: giới hạn như đăng nhập, tính theo IP (M6a, §11)."""

    @staticmethod
    def check(ip: str):
        _REGISTER.check(ip)
        _REGISTER.hit(ip)


class BindLimiter:
    """Gắn biển: chỉ đếm LẦN NHẬP SAI mã đăng ký theo tài khoản — chống dò 8 chữ số (M6a)."""

    @staticmethod
    def check(username: str):
        _BIND.check(username)

    @staticmethod
    def fail(username: str):
        _BIND.hit(username)


class StationLimiter:
    """§11: hạn mức request/phút/trạm THEO NHÓM (STATION-a).

    Mỗi nhóm (violation/telemetry/frame) có bộ đếm và cửa sổ 60 s riêng — khung hình
    không chiếm hạn mức của vi phạm. Vượt ngưỡng → 429 kèm `Retry-After` (giây còn lại).
    """

    WINDOW_S = 60

    @staticmethod
    def check(station_id: str, group: str):
        limit = config.STATION_RATE_LIMITS[group]
        hits = STATION_HITS.setdefault(group, {})
        now = time.time()
        window, count = hits.get(station_id, (now, 0))
        if now - window >= StationLimiter.WINDOW_S:
            window, count = now, 0
        count += 1
        hits[station_id] = (window, count)
        _purge_stale(hits, now, 120)
        if count > limit:
            # Retry-After = giây còn lại của cửa sổ (làm tròn lên), tối thiểu 1.
            retry_after = max(1, math.ceil(StationLimiter.WINDOW_S - (now - window)))
            raise HTTPException(status_code=429, headers={'Retry-After': str(retry_after)},
                                detail={'error': {'code': 'RATE_LIMITED', 'message': 'Trạm gửi quá nhiều yêu cầu', 'detail': None}})
