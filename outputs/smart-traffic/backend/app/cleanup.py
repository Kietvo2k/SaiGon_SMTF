"""PERF-4 — dọn dữ liệu backend để DB và var/frames không tăng mãi khi chạy 24/7.

Ba nhóm dọn, cấu hình qua biến môi trường (mặc định trong `config`):
  1. Telemetry quá hạn (`RETAIN_TELEMETRY_H`): `station_metrics`, `signal_state_log`, `kpi_samples`.
  2. Vi phạm ở trạng thái cuối (`RETAIN_FINAL_DAYS`) + bằng chứng + media + file của chúng.
  3. Thư mục `var/frames/` cắt về dưới `FRAMES_MAX_MB`.

Nguyên tắc: GHI FILE TRƯỚC, XÓA DB SAU — chỉ xóa file khi bản ghi DB đã commit thành công
(tránh mất dữ liệu nghiệp vụ khi transaction lỗi).

`audit_log` KHÔNG BAO GIỜ bị xóa: đó là nhật ký thao tác của cán bộ, bắt buộc truy vết
(mọi thao tác duyệt/gỡ/nộp phạt vi phạm đều ghi audit_log; xóa nó là mất dấu vết nghiệp vụ).
"""
import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app import config
from app.db import get_conn

TELEMETRY_TABLES = ('station_metrics', 'signal_state_log', 'kpi_samples')
_LATEST_SUFFIX = '-latest.jpg'   # khung mới nhất mỗi camera: KHÔNG xóa
_NO_KEEP_ROWS = 1000             # trần dự phòng cho bảng telemetry không có cột thời gian


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _ago_iso(**kw) -> str:
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat().replace('+00:00', 'Z')


def _connect():
    """Kết nối riêng cho tác vụ nền (đóng khi xong)."""
    return get_conn()


def _time_column(conn, table: str):
    """Cột thời gian thực của bảng, hoặc None. `created_at` là chuỗi ISO UTC nên so sánh
    bằng `datetime(...)` cho đúng cả hai kiểu viết (ISO có 'Z' và ISO thuần)."""
    cols = {r['name'] for r in conn.execute(f'PRAGMA table_info({table})')}
    for c in ('created_at', 'ts', 'captured_at', 'occurred_at'):
        if c in cols:
            return c
    return None


def _resolve_media_path(raw: str) -> Path:
    """`media_assets.path` do app ghi là đường dẫn tuyệt đối (station.py:140,174); dữ liệu
    nhập tay/cũ có thể là đường dẫn tương đối so với VAR_DIR → thử cả hai."""
    p = Path(raw)
    if p.is_absolute() or p.exists():
        return p
    cand = config.VAR_DIR / p
    return cand if cand.exists() else p


# ---------------------------------------------------------------- telemetry


def purge_telemetry() -> dict:
    """Xóa telemetry quá hạn; trả về số dòng đã xóa theo bảng."""
    stats = {t: 0 for t in TELEMETRY_TABLES}
    if config.RETAIN_TELEMETRY_H <= 0:
        return stats
    cutoff = _ago_iso(hours=config.RETAIN_TELEMETRY_H)
    conn = _connect()
    try:
        for table in TELEMETRY_TABLES:
            col = _time_column(conn, table)
            if col is None:
                # Bảng không có cột thời gian → chặn theo số dòng (id tăng dần theo thời gian).
                cur = conn.execute(f'DELETE FROM {table} WHERE id <= (SELECT MAX(id) FROM {table}) - ?',
                                   (_NO_KEEP_ROWS,))
            else:
                # Cột thời gian NULL = dữ liệu cũ không có mốc (như kpi_samples trước PERF-4) →
                # coi là quá hạn, xóa luôn; bản ghi mới luôn có created_at nên không false-positive.
                cur = conn.execute(f'DELETE FROM {table} WHERE {col} IS NULL OR datetime({col}) < datetime(?)',
                                   (cutoff,))
            stats[table] = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return stats


# ------------------------------------------------- vi phạm ở trạng thái cuối


def purge_final_violations() -> dict:
    """Xóa vi phạm ở trạng thái cuối quá hạn, kèm bằng chứng + media + file khung.

    KHÔNG xóa vi phạm chưa ở trạng thái cuối và KHÔNG xóa bằng chứng của chúng.
    XÓA FILE SAU KHI DB COMMIT THÀNH CÔNG.
    """
    stats = {'violations': 0, 'evidence': 0, 'media_assets': 0, 'files': 0}
    if config.RETAIN_FINAL_DAYS <= 0:
        return stats
    cutoff = _ago_iso(days=config.RETAIN_FINAL_DAYS)
    status_ph = ','.join('?' * len(config.FINAL_VIOLATION_STATUSES))
    conn = _connect()
    files_to_delete = []
    try:
        col = _time_column(conn, 'violations') or 'created_at'
        victims = [r['id'] for r in conn.execute(
            f'SELECT id FROM violations WHERE status IN ({status_ph}) AND datetime({col}) < datetime(?)',
            (*config.FINAL_VIOLATION_STATUSES, cutoff)).fetchall()]
        if victims:
            vid_ph = ','.join('?' * len(victims))
            # 1. Thu thập media và file TRƯỚC khi xóa DB (bằng chứng vi phạm khác có thể dùng chung media).
            media_ids = [r['media_id'] for r in conn.execute(
                f'SELECT DISTINCT media_id FROM evidence WHERE violation_id IN ({vid_ph}) AND media_id IS NOT NULL',
                victims).fetchall()]
            paths = []
            removable = []
            if media_ids:
                m_ph = ','.join('?' * len(media_ids))
                paths = {r['id']: r['path'] for r in conn.execute(
                    f'SELECT id, path FROM media_assets WHERE id IN ({m_ph})', media_ids).fetchall()}
                still_used = {r['media_id'] for r in conn.execute(
                    f'SELECT DISTINCT media_id FROM evidence WHERE violation_id NOT IN ({vid_ph}) AND media_id IS NOT NULL',
                    victims).fetchall()}
                removable = [m for m in media_ids if m in paths and m not in still_used]
                files_to_delete = [_resolve_media_path(paths[m]) for m in removable]
            # 2. Xóa trong một transaction: evidence trước (khóa FK ngoài tới media_assets),
            # rồi media còn mồ côi, rồi vi phạm.
            cur = conn.execute(f'DELETE FROM evidence WHERE violation_id IN ({vid_ph})', victims)
            stats['evidence'] = cur.rowcount
            if removable:
                cur = conn.execute(
                    f'DELETE FROM media_assets WHERE id IN ({",".join("?" * len(removable))})', removable)
                stats['media_assets'] = cur.rowcount
            cur = conn.execute(f'DELETE FROM violations WHERE id IN ({vid_ph})', victims)
            stats['violations'] = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    # 3. XÓA FILE SAU KHI DB COMMIT THÀNH CÔNG.
    for p in files_to_delete:
        try:
            if p.exists():
                p.unlink()
                stats['files'] += 1
        except OSError:
            pass   # file bị khóa/không tồn tại → bỏ qua, không làm hỏng vòng dọn
    return stats


# ------------------------------------------------------------------- frames


def _protected_media_ids(conn) -> set:
    """media_id của vi phạm CHƯA ở trạng thái cuối, hoặc đã cuối hạn nhưng còn trong hạn giữ
    → bằng chứng của chúng KHÔNG được xóa file."""
    keep = set()
    status_ph = ','.join('?' * len(config.FINAL_VIOLATION_STATUSES))
    col = _time_column(conn, 'violations') or 'created_at'
    rows = conn.execute(
        f'SELECT DISTINCT e.media_id AS media_id FROM evidence e JOIN violations v ON v.id = e.violation_id '
        f'WHERE e.media_id IS NOT NULL AND (v.status NOT IN ({status_ph}) OR datetime(v.{col}) >= datetime(?))',
        (*config.FINAL_VIOLATION_STATUSES, _ago_iso(days=config.RETAIN_FINAL_DAYS))).fetchall()
    return {r['media_id'] for r in rows}


def trim_frames() -> dict:
    """Cắt thư mục frames về dưới FRAMES_MAX_MB; giữ `-latest.jpg` và bằng chứng
    của vi phạm còn hiệu lực. Xóa file cũ nhất trước."""
    frames_dir = config.VAR_DIR / 'frames'
    if not frames_dir.is_dir() or config.FRAMES_MAX_MB <= 0:
        return {'files': 0, 'freed_bytes': 0}
    max_bytes = int(config.FRAMES_MAX_MB * 1024 * 1024)
    conn = _connect()
    try:
        protected_ids = _protected_media_ids(conn)
    finally:
        conn.close()
    # Tổng dung lượng tính trên MỌI file (kể cả file được giữ) vì chúng cũng chiếm chỗ.
    all_files = []
    for p in frames_dir.iterdir():
        if not p.is_file():
            continue
        try:
            st = p.stat()
        except OSError:
            continue
        all_files.append((p, st.st_size, st.st_mtime))
    total = sum(s for _, s, _ in all_files)
    removable = sorted((f for f in all_files
                        if not f[0].name.endswith(_LATEST_SUFFIX) and f[0].stem not in protected_ids),
                       key=lambda f: f[2])
    freed = deleted = 0
    for p, size, _ in removable:
        if total - freed <= max_bytes:
            break
        try:
            p.unlink()
        except OSError:
            continue
        freed += size
        deleted += 1
    return {'files': deleted, 'freed_bytes': freed}


def vacuum() -> bool:
    """Chạy VACUUM để gộp file DB và giải phóng dung lượng đĩa (mỗi ngày một lần)."""
    conn = _connect()
    try:
        conn.execute('VACUUM')
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


# -------------------------------------------------------- trạng thái vòng dọn

_STATE = {'last_run': None, 'last_vacuum': None}


def _state_path() -> Path:
    return config.VAR_DIR / 'cleanup-state.json'


def _load_state():
    """Nạp lại lần dọn gần nhất từ VAR_DIR: tồn tại qua lần khởi động lại app (và qua
    `importlib.reload` trong test), nên /admin/storage luôn báo đúng thời điểm dọn thật."""
    try:
        data = json.loads(_state_path().read_text(encoding='utf-8'))
        if isinstance(data, dict):
            _STATE['last_run'] = data.get('last_run')
            _STATE['last_vacuum'] = data.get('last_vacuum')
    except (OSError, ValueError):
        pass


def _save_state():
    try:
        _state_path().write_text(json.dumps(_STATE, ensure_ascii=False), encoding='utf-8')
    except OSError:
        pass


def reset_state():
    """Reset trạng thái tác vụ nền (chỉ dùng trong test)."""
    _STATE['last_run'] = None
    _STATE['last_vacuum'] = None
    _save_state()


def last_cleanup_at():
    return _STATE['last_run']


def run_once() -> dict:
    """Chạy một vòng dọn đầy đủ (telemetry + final violations + frames) và ghi nhận mốc thời gian."""
    result = {
        'started_at': _now_iso(),
        'telemetry': purge_telemetry(),
        'violations': purge_final_violations(),
        'frames': trim_frames(),
    }
    _STATE['last_run'] = result['started_at']
    _save_state()
    return result


async def _cleanup_loop():
    """Vòng lặp nền: mỗi CLEANUP_INTERVAL_S dọn một lần; mỗi VACUUM_INTERVAL_S VACUUM một lần."""
    _load_state()
    while True:
        try:
            now = time.time()
            run_once()
            if _STATE['last_vacuum'] is None or (now - _STATE['last_vacuum']) >= config.VACUUM_INTERVAL_S:
                if vacuum():
                    _STATE['last_vacuum'] = now
                    _save_state()
        except Exception:
            pass   # vòng dọn nền không được làm sập app
        await asyncio.sleep(max(1.0, config.CLEANUP_INTERVAL_S))


# ------------------------------------------------------- thống kê lưu trữ


def dir_size(d: Path) -> int:
    total = 0
    if not d.is_dir():
        return 0
    for p in d.rglob('*'):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def storage_stats() -> dict:
    """Thống kê lưu trữ cho GET /admin/storage."""
    _load_state()
    db_bytes = config.DB_PATH.stat().st_size if config.DB_PATH.exists() else 0
    conn = _connect()
    try:
        tables = {}
        for t in ('station_metrics', 'signal_state_log', 'kpi_samples', 'violations',
                  'evidence', 'media_assets', 'audit_log', 'heat_snapshots'):
            try:
                tables[t] = conn.execute(f'SELECT COUNT(*) AS n FROM {t}').fetchone()['n']
            except Exception:
                tables[t] = None
    finally:
        conn.close()
    return {
        'db_bytes': db_bytes,
        'frames_bytes': dir_size(config.VAR_DIR / 'frames'),
        'frames_max_mb': config.FRAMES_MAX_MB,
        'retain_telemetry_h': config.RETAIN_TELEMETRY_H,
        'retain_final_days': config.RETAIN_FINAL_DAYS,
        'last_cleanup_at': _STATE['last_run'],
        'last_vacuum_at': _STATE['last_vacuum'],
        'tables': tables,
    }


_load_state()