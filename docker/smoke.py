"""Kiểm tra HTTP, static whitelist và WS qua nginx đang chạy trên máy cục bộ.

Chạy: outputs/smart-traffic/backend/.venv/Scripts/python.exe docker/smoke.py
"""
import asyncio
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import websockets

BASE = 'http://127.0.0.1:8088'


def request(path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = Request(BASE + path, data=data, headers=headers)
    try:
        with urlopen(req, timeout=10) as res:
            return res.status, res.read(), res.headers
    except HTTPError as exc:
        return exc.code, exc.read(), exc.headers


def login(username):
    status, raw, _ = request('/api/v1/auth/login', {'username': username, 'password': 'SaiGon@2026'})
    assert status == 200, (username, status)
    return json.loads(raw)['access_token']


async def main():
    for path in ['/', '/index-officer.html', '/index-citizen.html', '/hcmc-poc/',
                 '/hcmc-poc/vendor/three186/three.webgpu.js', '/hcmc-poc/data/scene.js',
                 '/hcmc-poc/smart-app-32.js', '/hcmc-poc/station-client-32.js',
                 '/hcmc-poc/data/heat-history-32.json',
                 '/north-roads-32.json',
                 '/smart-traffic/backend/app/seed/node_map.json',
                 '/smart-traffic/backend/app/seed/cameras.json',
                 '/smart-traffic/backend/app/seed/plates.json']:
        assert request(path)[0] == 200, path
    for path in ['/smart-traffic/backend/app/seed/accounts.json', '/smart-traffic/backend/app/main.py',
                 '/smart-traffic/var/smart-traffic.db', '/hcmc-poc/serve.py', '/hcmc-poc/test/',
                 '/hcmc-poc/research/', '/.git/config', '/work/']:
        assert request(path)[0] == 404, path
    for path in ['/hcmc-poc/webgpu-materials-24.js?v=32a', '/hcmc-poc/smart-app-32.js?v=32a']:
        assert request(path)[2].get('Cache-Control') == 'no-cache', 'Runtime 3D cần revalidate sau rebuild: ' + path
    status, raw, _ = request('/api/v1/health')
    assert status == 200 and json.loads(raw)['ok'] is True
    officer, station = login('officer1'), login('station-3d')
    async with websockets.connect('ws://127.0.0.1:8088/ws/v1') as receiver:
        await receiver.send(json.dumps({'type': 'auth', 'token': officer}))
        async with websockets.connect('ws://127.0.0.1:8088/ws/v1') as sender:
            await sender.send(json.dumps({'type': 'auth', 'token': station}))
            await sender.send(json.dumps({'event': 'station.metrics', 'data': {'probe': 'docker-smoke'}}))
            event = json.loads(await asyncio.wait_for(receiver.recv(), timeout=5))
            assert event['event'] == 'station.metrics' and event['data']['probe'] == 'docker-smoke'
    status, _, _ = request('/api/v1/station/metrics', {'station_id': 'DOCKER-SMOKE', 't': 1, 'probe': 'docker-smoke'}, station)
    assert status == 200, status
    print('PASS: health, 13 static URLs, 8 blocked paths, officer/station login, authenticated WebSocket broadcast, SQLite metrics write')


asyncio.run(main())
