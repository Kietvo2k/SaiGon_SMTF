# Hub WebSocket theo vai trò — auth bằng tin nhắn đầu {"type":"auth","token"} trong 5 s.
import asyncio
import datetime
import json

from app.auth import decode_token

SEQ = 0
CLIENTS = []   # {ws, role, username}
# Allowlist chiều trạm → backend: CHỈ `station` gửi các event này. `cmd.*` KHÔNG nhận từ WS
# (chỉ sinh ở REST officer/commander/admin) nên không có đường leo quyền điều khiển đèn.
# `violation.detected` KHÔNG nằm trong đường WS: vi phạm chỉ vào qua `POST /station/violations`
# (tránh bản ghi ma không dedup/không gán status — review bảo mật).
STATION_EVENTS = {'station.heartbeat', 'station.metrics', 'station.frame', 'violation.evidence'}


def _next_seq():
    global SEQ
    SEQ += 1
    return SEQ


async def ws_handler(websocket):
    role = None
    close_code = 4401
    try:
        await websocket.accept()
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5)
        msg = json.loads(raw)
        if msg.get('type') != 'auth':
            return
        claims = decode_token(msg.get('token', ''))
        role = claims['role']
        close_code = 1000
        CLIENTS.append({'ws': websocket, 'role': role, 'username': claims['sub']})
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            event = payload.get('event')
            if not event:
                continue
            if role != 'station' or event not in STATION_EVENTS:
                # Không in nguyên payload/event do client gửi (tránh log injection).
                safe = ''.join(ch for ch in str(event)[:40] if ch.isprintable())
                print(f'[ws] bỏ qua event không hợp lệ: role={role} event={safe}', flush=True)
                continue
            await broadcast(event, payload.get('data', {}), to_roles=['officer', 'commander', 'admin'])
    except Exception:
        pass
    finally:
        CLIENTS[:] = [c for c in CLIENTS if c['ws'] is not websocket]
        try:
            await websocket.close(code=close_code)
        except Exception:
            pass


async def broadcast(event: str, data: dict, to_roles=None):
    payload = json.dumps({'event': event, 't': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
                          'seq': _next_seq(), 'data': data}, ensure_ascii=False)
    dead = []
    for c in CLIENTS:
        if to_roles is not None and c['role'] not in to_roles:
            continue
        try:
            await c['ws'].send_text(payload)
        except Exception:
            dead.append(c)
    for c in dead:
        CLIENTS[:] = [x for x in CLIENTS if x is not c]


def broadcast_sync(event: str, data: dict, to_roles=None):
    """CHỈ dùng khi thật sự ở thread/loop khác (ví dụ watchdog). Endpoint của app là `async def`
    và gọi thẳng `await broadcast(...)` — KHÔNG dùng hàm này trong request handler."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None
    return asyncio.run_coroutine_threadsafe(broadcast(event, data, to_roles), loop)
