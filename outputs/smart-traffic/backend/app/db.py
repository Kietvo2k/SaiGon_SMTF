import sqlite3
from contextlib import contextmanager

from app import config
from app.models import TABLES


def get_conn():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


@contextmanager
def connect():
    """Kết nối ghi an toàn: commit khi thành công, rollback + luôn đóng khi lỗi.

    Mọi handler ghi DB phải dùng `with connect() as conn:` để không để khóa ghi SQLite
    treo khi có exception giữa chừng (§4.5, review bảo mật).
    """
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(conn):
    for ddl in TABLES:
        conn.execute(ddl)
    conn.commit()
