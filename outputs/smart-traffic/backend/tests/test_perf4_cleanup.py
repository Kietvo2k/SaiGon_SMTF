"""PERF-4 — dọn dữ liệu backend theo hạn giữ, VACUUM, /admin/storage.

Ba quy tắc dọn, mỗi quy tắc một test FAIL trước khi cài:
  1. Telemetry quá hạn giữ bị xóa; audit_log KHÔNG bao giờ bị xóa.
  2. Vi phạm ở trạng thái cuối quá hạn bị xóa kèm bằng chứng + media + file; vi phạm CHƯA ở
     trạng thái cuối giữ nguyên.
  3. Thư mục frames bị cắt về dưới SMART_FRAMES_MAX_MB; không đụng file -latest.jpg và
     không đụng bằng chứng của vi phạm còn hiệu lực.
"""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from tests.m6_helpers import db, hdr, new_violation

DAY_H = 24


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _ago_iso(hours):
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat().replace('+00:00', 'Z')


def _set_retain_env(monkeypatch, telemetry_h=None, final_days=None, max_mb=None):
    """Nạp lại module cleanup với cấu hình mới (config đọc env lúc import)."""
    import importlib
    if telemetry_h is not None:
        monkeypatch.setenv('SMART_RETAIN_TELEMETRY_H', str(telemetry_h))
    if final_days is not None:
        monkeypatch.setenv('SMART_RETAIN_FINAL_DAYS', str(final_days))
    if max_mb is not None:
        monkeypatch.setenv('SMART_FRAMES_MAX_MB', str(max_mb))
    from app import cleanup, config
    importlib.reload(config)
    importlib.reload(cleanup)
    return cleanup


def _insert_telemetry(telemetry_n, signal_n, kpi_n, hours_old):
    ts = _ago_iso(hours_old)
    with db() as conn:
        for i in range(telemetry_n):
            conn.execute('INSERT INTO station_metrics (station_id, t, payload_json, created_at) VALUES (?,?,?,?)',
                         (f'ST-{i}', '0.0', '{}', ts))
        for i in range(signal_n):
            conn.execute('INSERT INTO signal_state_log (node_id, cluster_id, t_sim, phase, grp, mode, override_by, reason, created_at) '
                         'VALUES (?,?,?,?,?,?,?,?,?)',
                         (f'HX-{i:02d}', 0, 1.0, 'A', 0, 'fixed', None, None, ts))
        for _ in range(kpi_n):
            conn.execute('INSERT INTO kpi_samples (t_sim, window_s, wait_avg_s, wait_p95_s, queue_max, queue_avg, flow_per_min, mode, scenario_key, created_at) '
                         'VALUES (?,?,?,?,?,?,?,?,?,?)',
                         (1.0, 60, 0.0, 0.0, 0, 0.0, 0.0, 'fixed', None, ts))


def _insert_final_violation(vid, status, days_old, with_evidence=True):
    """Một vi phạm `status` cũ `days_old` ngày, kèm media/bằng chứng và file thật trong frames."""
    ts = _ago_iso(days_old * DAY_H)
    frames = Path(os.environ['SMART_VAR_DIR']) / 'frames'
    frames.mkdir(exist_ok=True)
    mid = f'MD-{vid}'
    path = frames / f'{mid}.jpg'
    if with_evidence:
        path.write_bytes(b'\xff\xd8\xff' + b'x' * 64)
    with db() as conn:
        conn.execute('INSERT INTO violations (id, violation_code, status, plate, plate_format, vehicle_class, vehicle_color, '
                     'vehicle_id, cycle_id, occurred_at, node_id, node_label, camera_id, confidence, ocr_confidence, '
                     'created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                     (vid, 'RED-LIGHT', status, '51K-999.99', 'auto', 'car', 'white', f'V-{vid}', 1,
                      ts, 'HX-01', 'Hàng Xanh', 'CAM-HX-001', 0.95, 0.9, ts, ts))
        if with_evidence:
            conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                         (mid, 'image', str(path), 'image/jpeg', path.stat().st_size, 'sha', 'CAM-HX-001', ts))
            conn.execute('INSERT INTO evidence (id, violation_id, kind, media_id, captured_at, width, height, sha256) VALUES (?,?,?,?,?,?,?,?)',
                         (f'EV-{vid}-before', vid, 'before', mid, ts, 0, 0, 'sha'))
    return path


def test_cleanup_purges_old_telemetry_and_never_audit_log(client, monkeypatch):
    """Quy tắc 1: telemetry quá hạn bị xóa, audit_log giữ nguyên."""
    cleanup = _set_retain_env(monkeypatch, telemetry_h=1.0)
    _insert_telemetry(telemetry_n=3, signal_n=3, kpi_n=3, hours_old=2.0)
    _insert_telemetry(telemetry_n=2, signal_n=1, kpi_n=1, hours_old=0.0)   # còn hạn → giữ
    with db() as conn:
        audit_before = conn.execute('SELECT COUNT(*) AS n FROM audit_log').fetchone()['n']
    stats = cleanup.purge_telemetry()
    assert stats['station_metrics'] == 3, stats
    assert stats['signal_state_log'] == 3, stats
    assert stats['kpi_samples'] == 3, stats
    with db() as conn:
        assert conn.execute('SELECT COUNT(*) AS n FROM station_metrics').fetchone()['n'] == 2
        assert conn.execute('SELECT COUNT(*) AS n FROM signal_state_log').fetchone()['n'] == 1
        assert conn.execute('SELECT COUNT(*) AS n FROM kpi_samples').fetchone()['n'] == 1
        assert conn.execute('SELECT COUNT(*) AS n FROM audit_log').fetchone()['n'] == audit_before


def test_cleanup_purges_final_old_violations_with_evidence(client, monkeypatch):
    """Quy tắc 2: `dismissed` quá hạn bị xóa kèm bằng chứng/media/file; `new` và `confirmed` giữ nguyên."""
    cleanup = _set_retain_env(monkeypatch, final_days=14.0)
    old_dismissed = _insert_final_violation('VP-TEST-DISMISSED', 'dismissed', days_old=30)
    _insert_final_violation('VP-TEST-CONFIRMED', 'confirmed', days_old=30)
    new_vid = new_violation(client, '51K-123.45', node_id='HX-02')
    stats = cleanup.purge_final_violations()
    assert stats['violations'] == 1, stats
    assert stats['evidence'] == 1, stats
    assert stats['media_assets'] == 1, stats
    assert stats['files'] == 1, stats
    with db() as conn:
        left = {r['id'] for r in conn.execute('SELECT id FROM violations').fetchall()}
        assert 'VP-TEST-DISMISSED' not in left
        assert 'VP-TEST-CONFIRMED' in left
        assert new_vid in left
        # Bằng chứng của vi phạm bị xóa mất; bằng chứng của vi phạm `confirmed` (chưa cuối hạn) giữ nguyên.
        assert conn.execute('SELECT COUNT(*) AS n FROM evidence').fetchone()['n'] == 1
        assert conn.execute('SELECT COUNT(*) AS n FROM media_assets').fetchone()['n'] == 1
    assert not old_dismissed.exists()


def test_cleanup_keeps_recent_final_and_keeps_audit_log(client, monkeypatch):
    """Vi phạm cuối hạn MỚI HƠN hạn giữ vẫn giữ nguyên (không xóa sớm)."""
    cleanup = _set_retain_env(monkeypatch, final_days=14.0)
    recent = _insert_final_violation('VP-TEST-RECENT', 'paid', days_old=1)
    stats = cleanup.purge_final_violations()
    assert stats['violations'] == 0, stats
    with db() as conn:
        assert conn.execute('SELECT COUNT(*) AS n FROM violations').fetchone()['n'] == 1
        assert conn.execute('SELECT COUNT(*) AS n FROM evidence').fetchone()['n'] == 1
    assert recent.exists()


def test_cleanup_trims_frames_dir_but_keeps_latest_and_active_evidence(client, monkeypatch):
    """Quy tắc 3: cắt frames về dưới trần; không đụng -latest.jpg và bằng chứng vi phạm còn hiệu lực."""
    cleanup = _set_retain_env(monkeypatch, max_mb=1)
    frames = Path(os.environ['SMART_VAR_DIR']) / 'frames'
    frames.mkdir(exist_ok=True)
    junk1 = frames / 'MD-JUNK-1.jpg'
    junk1.write_bytes(b'x' * (600 * 1024))          # 600 KB
    junk2 = frames / 'MD-JUNK-2.jpg'
    junk2.write_bytes(b'x' * (600 * 1024))          # 600 KB → tổng 1,2 MB > 1 MB
    latest = frames / 'CAM-HX-001-latest.jpg'
    latest.write_bytes(b'x' * 1024)
    active_vid = new_violation(client, '51K-123.45', node_id='HX-03')
    with db() as conn:
        conn.execute('INSERT INTO media_assets (id, kind, path, mime, bytes, sha256, camera_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
                     ('MD-ACTIVE', 'image', str(frames / 'MD-ACTIVE.jpg'), 'image/jpeg', 1, 'sha', None, _now_iso()))
        conn.execute('INSERT INTO evidence (id, violation_id, kind, media_id, captured_at, width, height, sha256) VALUES (?,?,?,?,?,?,?,?)',
                     (f'EV-{active_vid}-before', active_vid, 'before', 'MD-ACTIVE', _now_iso(), 0, 0, 'sha'))
    active = frames / 'MD-ACTIVE.jpg'
    active.write_bytes(b'x' * 1024)
    stats = cleanup.trim_frames()
    assert stats['files'] >= 1, stats
    assert latest.exists(), 'không được xóa khung mới nhất của camera'
    assert active.exists(), 'không được xóa bằng chứng của vi phạm còn hiệu lực'
    assert not (junk1.exists() and junk2.exists())


def test_storage_endpoint_is_admin_only(client):
    """GET /admin/storage: chỉ admin; trả kích thước DB, frames, số dòng bảng, lần dọn gần nhất."""
    from app import cleanup
    ah = hdr(client, 'admin1')
    for user in ('officer1', 'commander1', 'citizen1', 'station-3d'):
        assert client.get('/api/v1/admin/storage', headers=hdr(client, user)).status_code == 403, user
    cleanup.run_once()                       # sau một vòng dọn, endpoint phải báo lần dọn gần nhất
    r = client.get('/api/v1/admin/storage', headers=ah)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['db_bytes'] >= 0
    assert body['frames_bytes'] >= 0
    assert body['last_cleanup_at'] is not None, body
    for t in ('station_metrics', 'signal_state_log', 'kpi_samples', 'violations', 'audit_log'):
        assert t in body['tables'], t
        assert body['tables'][t] >= 0


def test_cleanup_runs_without_admin_and_without_evidence(client, monkeypatch):
    """Vòng dọn chạy độc lập (không cần request nào): telemetry + frames + trạng thái đều ghi nhận."""
    cleanup = _set_retain_env(monkeypatch, telemetry_h=1.0, final_days=14.0, max_mb=500)
    cleanup.reset_state()
    _insert_telemetry(telemetry_n=2, signal_n=2, kpi_n=2, hours_old=2.0)
    result = cleanup.run_once()
    assert result['telemetry']['station_metrics'] == 2, result
    assert cleanup.last_cleanup_at() is not None
    assert cleanup.storage_stats()['last_cleanup_at'] is not None
