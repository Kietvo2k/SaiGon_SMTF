import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]          # outputs/smart-traffic/backend
ROOT_DIR = Path(__file__).resolve().parents[2]          # outputs/smart-traffic
VAR_DIR = Path(os.environ.get('SMART_VAR_DIR', ROOT_DIR / 'var'))
VAR_DIR.mkdir(parents=True, exist_ok=True)
(VAR_DIR / 'frames').mkdir(exist_ok=True)
(VAR_DIR / 'logs').mkdir(exist_ok=True)
DB_PATH = Path(os.environ.get('SMART_DB_PATH', VAR_DIR / 'smart-traffic.db'))
JWT_SECRET_PATH = VAR_DIR / 'jwt-secret.txt'
JWT_TTL_S = 8 * 3600
LOGIN_RATE_LIMIT = 5          # lần/phút/IP
LOGIN_LOCK_S = 300            # khóa tạm 5 phút
UPLOAD_MAX_BYTES = 50 * 1024 * 1024
STATION_RATE_LIMIT = 200      # request/phút/station
BACKEND_PORT = int(os.environ.get('SMART_BACKEND_PORT', 8900))   # đọc env — agent chạy song song tự đổi cổng
STATIC_PORT = int(os.environ.get('PORT', 8821))
VITE_PORT = int(os.environ.get('VITE_PORT', 5173))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    'SMART_ALLOWED_ORIGINS',
    f'http://127.0.0.1:{STATIC_PORT},http://localhost:{STATIC_PORT},http://127.0.0.1:{VITE_PORT},http://localhost:{VITE_PORT}'
).split(',') if o.strip()]
