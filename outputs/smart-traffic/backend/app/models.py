TABLES = [
    """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('citizen','officer','commander','admin','station')),
        display_name TEXT, created_at TEXT, active INTEGER DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS citizen_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id), full_name TEXT, phone TEXT, email TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS plates_seed (
        slot INTEGER, gen INTEGER, vehicle_class TEXT, plate TEXT UNIQUE,
        color TEXT, owner_name TEXT, owner_phone TEXT, is_scenario INTEGER DEFAULT 0,
        registration_code TEXT,
        PRIMARY KEY (slot, gen, vehicle_class))""",   # PK (slot, gen, vehicle_class) — điểm tự quyết, xem Task 4; registration_code: M6a (migrate ở db.py)
    """CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plate TEXT REFERENCES plates_seed(plate),
        vehicle_class TEXT, color TEXT, owner_name TEXT,
        priority_kind TEXT DEFAULT 'none', slot INTEGER, gen INTEGER)""",
    """CREATE TABLE IF NOT EXISTS vehicle_ownerships (
        user_id INTEGER REFERENCES users(id), plate TEXT REFERENCES plates_seed(plate),
        created_at TEXT, PRIMARY KEY (user_id, plate))""",
    """CREATE TABLE IF NOT EXISTS violations (
        id TEXT PRIMARY KEY, violation_code TEXT, status TEXT, plate TEXT, plate_format TEXT,
        vehicle_class TEXT, vehicle_color TEXT, vehicle_id TEXT, cycle_id INTEGER,
        owner_name TEXT, owner_phone TEXT, is_scenario_plate INTEGER DEFAULT 0,
        occurred_at TEXT, node_id TEXT, node_osm_id INTEGER, node_label TEXT, camera_id TEXT,
        road_index INTEGER, lane_index INTEGER, signal_json TEXT, confidence REAL,
        ocr_confidence REAL, detection_json TEXT, penalty_json TEXT, sim_json TEXT,
        priority_flag INTEGER DEFAULT 0, priority_reason TEXT, review_json TEXT,
        reported_to_citizen INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY, violation_id TEXT REFERENCES violations(id), kind TEXT,
        media_id TEXT REFERENCES media_assets(id), captured_at TEXT, width INTEGER, height INTEGER, sha256 TEXT)""",
    """CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY, kind TEXT, path TEXT, mime TEXT, bytes INTEGER, sha256 TEXT,
        camera_id TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS complaints (
        id TEXT PRIMARY KEY, violation_id TEXT REFERENCES violations(id), user_id INTEGER REFERENCES users(id),
        message TEXT, status TEXT, resolution TEXT, created_at TEXT, resolved_at TEXT,
        kind TEXT, reason TEXT, resolved_by TEXT)""",   # kind/reason/resolved_by: M6a (migrate ở db.py)
    """CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), violation_id TEXT REFERENCES violations(id),
        kind TEXT, title TEXT, body TEXT, read_at TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY, violation_id TEXT REFERENCES violations(id), amount_vnd INTEGER,
        status TEXT, created_at TEXT, by_user INTEGER REFERENCES users(id))""",
    """CREATE TABLE IF NOT EXISTS signal_nodes (
        node_id TEXT PRIMARY KEY, osm_id INTEGER, label TEXT, cluster_id TEXT, x REAL, z REAL,
        camera_id TEXT REFERENCES cameras(camera_id), has_vms INTEGER DEFAULT 0, prefix TEXT)""",
    """CREATE TABLE IF NOT EXISTS cameras (
        camera_id TEXT PRIMARY KEY, node_id TEXT REFERENCES signal_nodes(node_id), x REAL, z REAL,
        height_m REAL, yaw_deg REAL, pitch_deg REAL, fov_deg REAL, range_m REAL, label TEXT)""",
    """CREATE TABLE IF NOT EXISTS signal_state_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, node_id TEXT, cluster_id TEXT, t_sim REAL,
        phase TEXT, grp INTEGER, mode TEXT, override_by TEXT, reason TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, role TEXT, action TEXT,
        target_type TEXT, target_id TEXT, from_state TEXT, to_state TEXT, reason TEXT,
        payload_json TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS kpi_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT, t_sim REAL, window_s REAL, wait_avg_s REAL,
        wait_p95_s REAL, queue_max REAL, queue_avg REAL, flow_per_min REAL, mode TEXT, scenario_key TEXT)""",
    """CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, segment_id TEXT, level TEXT, prob REAL, reliability REAL,
        message TEXT, t_sim REAL, created_at TEXT, cleared_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS vms_messages (
        id TEXT PRIMARY KEY, vms_id TEXT, lines_json TEXT, ttl_s INTEGER, active INTEGER,
        created_by INTEGER REFERENCES users(id), created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS station_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, station_id TEXT, t TEXT, payload_json TEXT, created_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS scenario_runs (
        id TEXT PRIMARY KEY, key TEXT, seed INTEGER, mode TEXT, params_json TEXT,
        result_json TEXT, started_at TEXT, finished_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS heat_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, t_sim REAL, hour INTEGER, mean_level REAL,
        max_level REAL, n_cells INTEGER, n_alerts INTEGER, levels_json TEXT, alerts_json TEXT,
        created_at TEXT)""",   # M4c: lịch sử bản đồ nhiệt (mỗi 5 phút sim, giữ 288 bản)
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_violations_dup ON violations(vehicle_id, node_id, cycle_id, violation_code)",
    "CREATE INDEX IF NOT EXISTS ix_violations_status ON violations(status, occurred_at)",
    "CREATE INDEX IF NOT EXISTS ix_violations_plate ON violations(plate, occurred_at)",
    "CREATE INDEX IF NOT EXISTS ix_violations_camera ON violations(camera_id, occurred_at)",
    "CREATE INDEX IF NOT EXISTS ix_cameras_node ON cameras(node_id)",
    "CREATE INDEX IF NOT EXISTS ix_kpi_t ON kpi_samples(t_sim)",
    "CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, read_at)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_violation ON complaints(violation_id)",
    "CREATE INDEX IF NOT EXISTS ix_complaints_status ON complaints(status, created_at)",
]

# Cột thêm sau M1: CREATE TABLE IF NOT EXISTS không thêm cột vào bảng đã có (DB dev cũ),
# nên init_db bổ sung các cột này bằng ALTER TABLE khi thiếu (idempotent).
MIGRATIONS = [
    ('plates_seed', 'registration_code', 'TEXT'),
    ('complaints', 'kind', 'TEXT'),
    ('complaints', 'reason', 'TEXT'),
    ('complaints', 'resolved_by', 'TEXT'),
]
