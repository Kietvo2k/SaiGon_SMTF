import importlib
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def client():
    tmp = Path(tempfile.mkdtemp(prefix='smart-traffic-test-'))
    os.environ['SMART_DB_PATH'] = str(tmp / 'test.db')
    os.environ['SMART_VAR_DIR'] = str(tmp)
    # config đọc env lúc import → PHẢI reload để mỗi test dùng DB/VAR_DIR riêng (cách ly test).
    from app import config
    importlib.reload(config)
    from app.db import init_db, get_conn
    from app.seed.run_seed import run_seed
    conn = get_conn()
    init_db(conn)
    conn.close()
    run_seed()
    from app import auth
    auth.reset_limits()          # bộ đếm rate-limit là biến module — reset giữa các test
    from app.main import app
    from fastapi.testclient import TestClient
    return TestClient(app)
