import base64
import os
import time

import bcrypt
import jwt
from fastapi import HTTPException, Request

from app import config

LOGIN_HITS = {}      # ip -> [epoch, count]
LOGIN_LOCKS = {}     # ip -> locked_until_epoch


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
        return jwt.decode(token, load_or_create_secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Token không hợp lệ', 'detail': None}})


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


class LoginLimiter:
    @staticmethod
    def check(ip: str):
        now = time.time()
        until = LOGIN_LOCKS.get(ip, 0)
        if now < until:
            raise HTTPException(status_code=429, detail={'error': {'code': 'RATE_LIMITED', 'message': 'Đăng nhập quá nhiều, thử lại sau 5 phút', 'detail': None}})
        window, count = LOGIN_HITS.get(ip, (now, 0))
        if now - window >= 60:
            window, count = now, 0
        count += 1
        LOGIN_HITS[ip] = (window, count)
        if count > config.LOGIN_RATE_LIMIT:
            LOGIN_LOCKS[ip] = now + config.LOGIN_LOCK_S
            raise HTTPException(status_code=429, detail={'error': {'code': 'RATE_LIMITED', 'message': 'Đăng nhập quá nhiều, thử lại sau 5 phút', 'detail': None}})
