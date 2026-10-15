import sqlite3
from contextlib import contextmanager

from app import config
from app.models import MIGRATIONS, TABLES


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
    # M6c: `vms_messages` đổi lược đồ (M1 chỉ khai báo, chưa ghi dòng nào). Bảng cũ được đổi tên, không xóa.
    legacy = {r['name'] for r in conn.execute('PRAGMA table_info(vms_messages)')}
    if 'lines_json' in legacy:
        conn.execute('ALTER TABLE vms_messages RENAME TO vms_messages_m1')
    for ddl in TABLES:
        conn.execute(ddl)
    for table, column, decl in MIGRATIONS:
        cols = {r['name'] for r in conn.execute(f'PRAGMA table_info({table})')}
        if column not in cols:
            conn.execute(f'ALTER TABLE {table} ADD COLUMN {column} {decl}')
    conn.commit()
