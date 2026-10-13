from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import config
from app.auth import DUMMY_HASH, LoginLimiter, make_token, require_role, verify_password
from app.db import connect
from app.errors import err
from app.routers import citizen as citizen_router
from app.routers import media as media_router
from app.routers import officer as officer_router
from app.routers import station as station_router
from app.schemas import LoginIn
from app.ws import ws_handler

app = FastAPI(title='SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc', version='32a')
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=['*'], allow_headers=['*'])

_CODE_BY_STATUS = {400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
                   409: 'CONFLICT', 413: 'TOO_LARGE', 422: 'VALIDATION', 429: 'RATE_LIMITED'}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # §4.5: lỗi thống nhất {"error": {code, message, detail}} — không bọc trong "detail".
    if isinstance(exc.detail, dict) and 'error' in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    code = _CODE_BY_STATUS.get(exc.status_code, 'ERROR')
    return JSONResponse(status_code=exc.status_code, content=err(code, str(exc.detail)))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content=err('VALIDATION', 'Dữ liệu không hợp lệ', jsonable_encoder(exc.errors())))


@app.post('/api/v1/auth/login')
def login(body: LoginIn, request: Request):
    LoginLimiter.check(request.client.host if request.client else '0.0.0.0')
    with connect() as conn:
        row = conn.execute('SELECT * FROM users WHERE username=? AND active=1', (body.username,)).fetchone()
    # §11: khi không có user vẫn chạy bcrypt với hash giả để thời gian phản hồi không lộ user tồn tại.
    if not row:
        verify_password(body.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Sai tài khoản hoặc mật khẩu', 'detail': None}})
    if not verify_password(body.password, row['password_hash']):
        raise HTTPException(status_code=401, detail={'error': {'code': 'UNAUTHORIZED', 'message': 'Sai tài khoản hoặc mật khẩu', 'detail': None}})
    return {'access_token': make_token(row), 'token_type': 'bearer', 'expires_in': config.JWT_TTL_S,
            'role': row['role'], 'display_name': row['display_name']}


@app.post('/api/v1/auth/logout')
def logout():
    return {'ok': True}


@app.get('/api/v1/auth/me')
def me(claims=Depends(require_role('citizen', 'officer', 'commander', 'admin', 'station'))):
    with connect() as conn:
        row = conn.execute('SELECT id, username, role, display_name FROM users WHERE username=?', (claims['sub'],)).fetchone()
        plates = [r['plate'] for r in conn.execute('SELECT plate FROM vehicle_ownerships WHERE user_id=?', (row['id'],))]
    return {'id': row['id'], 'username': row['username'], 'role': row['role'],
            'display_name': row['display_name'], 'plates': plates}


app.include_router(station_router.router)
app.include_router(officer_router.router)
app.include_router(citizen_router.router)
app.include_router(media_router.router)


@app.websocket('/ws/v1')
async def ws_endpoint(websocket: WebSocket):
    await ws_handler(websocket)
