from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.auth import LoginLimiter, make_token, require_role, verify_password
from app.db import get_conn
from app.schemas import LoginIn

app = FastAPI(title='SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc', version='32a')
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=['*'], allow_headers=['*'])


@app.post('/api/v1/auth/login')
def login(body: LoginIn, request: Request):
    LoginLimiter.check(request.client.host if request.client else '0.0.0.0')
    conn = get_conn()
    row = conn.execute('SELECT * FROM users WHERE username=? AND active=1', (body.username,)).fetchone()
    if not row or not verify_password(body.password, row['password_hash']):
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Sai tài khoản hoặc mật khẩu', 'detail': None}})
    return {'access_token': make_token(row), 'token_type': 'bearer', 'expires_in': config.JWT_TTL_S,
            'role': row['role'], 'display_name': row['display_name']}


@app.post('/api/v1/auth/logout')
def logout():
    return {'ok': True}


@app.get('/api/v1/auth/me')
def me(claims=Depends(require_role('citizen', 'officer', 'commander', 'admin', 'station'))):
    conn = get_conn()
    row = conn.execute('SELECT id, username, role, display_name FROM users WHERE username=?', (claims['sub'],)).fetchone()
    plates = [r['plate'] for r in conn.execute('SELECT plate FROM vehicle_ownerships WHERE user_id=?', (row['id'],))]
    return {'id': row['id'], 'username': row['username'], 'role': row['role'],
            'display_name': row['display_name'], 'plates': plates}
