import sqlite3
from app import config
from app.models import TABLES


def get_conn():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def init_db(conn):
    for ddl in TABLES:
        conn.execute(ddl)
    conn.commit()
