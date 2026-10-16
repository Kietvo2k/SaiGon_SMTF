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
# §11 (tua ×10): hạn mức request/phút/trạm THEO NHÓM, mỗi nhóm một cửa sổ riêng — khung hình không chiếm
# hạn mức của vi phạm. violation: vi phạm, bằng chứng, media, nhịp sống; telemetry: metrics, heat; frame: khung stream.
STATION_RATE_LIMITS = {'violation': 300, 'telemetry': 60, 'frame': 150}
# §3.3/§11: cổng do lệnh chạy (uvicorn --port) quyết định; agent song song đổi cổng
# bằng `SMART_ALLOWED_ORIGINS`, KHÔNG suy CORS từ `PORT`.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    'SMART_ALLOWED_ORIGINS',
    'http://127.0.0.1:8821,http://localhost:8821,http://127.0.0.1:5173,http://localhost:5173'
).split(',') if o.strip()]
