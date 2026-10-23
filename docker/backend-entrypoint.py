"""Khởi tạo idempotent trước khi mở API; volume giữ DB, JWT và khung hình."""
import os

from app.db import get_conn, init_db
from app.seed.run_seed import run_seed

conn = get_conn()
try:
    init_db(conn)
finally:
    conn.close()
run_seed()
os.execvp('python', ['python', '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8900'])
