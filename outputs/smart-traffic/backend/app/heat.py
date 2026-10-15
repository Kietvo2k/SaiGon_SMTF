"""Bản đồ nhiệt và cảnh báo kẹt khu Bắc (M4c, đặc tả §4.5/§4.6).

Trạm gửi `POST /station/heat`. Backend:
  - giữ bản mới nhất trong bộ nhớ (nhớ cả thời điểm nhận để biết dữ liệu đã cũ);
  - lưu một bản vào `heat_snapshots` mỗi 5 phút giờ sim, giữ tối đa 288 bản (lịch sử theo giờ);
  - phát `heat.update` cho cán bộ, và `alert.congestion` khi có cảnh báo MỚI với xác suất ≥ 0,6
    (cán bộ nhận bản đầy đủ, công dân nhận bản công khai);
  - `GET /public/alerts` chỉ trả tên đường, mức, xác suất làm tròn và số phút; không trả cạnh, độ tin cậy,
    t_sim hay bản đồ nhiệt. Dữ liệu quá `ALERT_TTL_S` giây không còn được coi là cảnh báo.
"""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from app import config
from app.db import connect
from app.ws import broadcast

ALERT_PROB = 0.6              # ngưỡng cảnh báo kẹt (trùng alerts32 trong forecast-32.js)
SNAPSHOT_EVERY_S = 300.0      # mỗi 5 phút giờ sim một bản lịch sử
SNAPSHOT_KEEP = 288           # 24 giờ × 12 bản/giờ
ALERT_TTL_S = 120             # trạm im lặng quá 2 phút thì không còn cảnh báo công khai
OFFICER_ROLES = ['officer', 'commander', 'admin']
LEVEL_LABELS = ['Thông thoáng', 'Đông nhẹ', 'Đông', 'Ùn ứ', 'Kẹt nặng']   # 5 nấc, khớp HEAT_COLORS_32
UNNAMED_ROAD = 'Đường không tên'
ROAD_FILE = Path('web') / 'public' / 'north-roads-32.json'

_STATE = {'latest': None, 'last_saved_t': None, 'alert_edges': set()}
_NAMES = None   # cache: cạnh → tên đường (đọc từ north-roads-32.json, dữ liệu tĩnh)


def reset():
    """Xóa trạng thái bộ nhớ (chỉ dùng trong test: mỗi test một trạng thái riêng)."""
    _STATE['latest'] = None
    _STATE['last_saved_t'] = None
    _STATE['alert_edges'] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def band_of(level) -> int:
    """Nấc màu 0–4 theo colorOf(level) của heat-32.js: floor(level × 5), kẹp vào [0, 4]."""
    v = float(level)
    if not math.isfinite(v) or v <= 0:
        return 0
    return min(len(LEVEL_LABELS) - 1, int(v * len(LEVEL_LABELS)))


def hour_of(t_sim: float, day_start_hour: float) -> int:
    return int(math.floor((float(t_sim) / 3600.0 + float(day_start_hour)) % 24))


def road_names() -> dict:
    """Tên đường theo chỉ số cạnh, lấy từ north-roads-32.json (cùng nguồn với bản đồ web).

    Không có file hoặc file hỏng → rỗng; khi đó cảnh báo vẫn có, chỉ hiện tên mặc định.
    """
    global _NAMES
    if _NAMES is None:
        names = {}
        try:
            doc = json.loads((config.ROOT_DIR / ROAD_FILE).read_text(encoding='utf-8'))
            for e in doc.get('edges', []):
                names[int(e['edge'])] = str(e.get('name') or '')
        except (OSError, ValueError, KeyError, TypeError):
            names = {}
        _NAMES = names
    return _NAMES


def display_name(edge: int) -> str:
    return road_names().get(int(edge)) or UNNAMED_ROAD


def _alert_row(a: dict) -> dict:
    """Cảnh báo đầy đủ cho cán bộ."""
    return {'edge': int(a['edge']), 'name': display_name(a['edge']), 'prob': float(a['prob']),
            'reliability': float(a['reliability']), 'horizon_min': float(a['horizon_min']),
            'level': float(a['level']), 'band': band_of(a['level'])}


def public_alert(a: dict) -> dict:
    """Cảnh báo công khai: tên đường, mức (nấc 0–4 và nhãn), xác suất làm tròn %, số phút."""
    band = band_of(a['level'])
    return {'name': display_name(a['edge']), 'level': band, 'level_label': LEVEL_LABELS[band],
            'prob_pct': int(round(float(a['prob']) * 100)), 'horizon_min': int(round(float(a['horizon_min'])))}


def _snapshot_due(t_sim: float) -> bool:
    last = _STATE['last_saved_t']
    return last is None or t_sim < last or t_sim - last >= SNAPSHOT_EVERY_S


def save_snapshot(conn, t_sim, day_start_hour, levels, alerts, created_at):
    """Ghi một bản lịch sử và cắt bớt để chỉ giữ `SNAPSHOT_KEEP` bản mới nhất."""
    n = len(levels)
    mean = sum(lv for _, lv in levels) / n if n else 0.0
    peak = max((lv for _, lv in levels), default=0.0)
    conn.execute('INSERT INTO heat_snapshots (t_sim, hour, mean_level, max_level, n_cells, n_alerts, levels_json, alerts_json, created_at) '
                 'VALUES (?,?,?,?,?,?,?,?,?)',
                 (float(t_sim), hour_of(t_sim, day_start_hour), mean, peak, n, len(alerts),
                  json.dumps(levels, separators=(',', ':')), json.dumps(alerts, ensure_ascii=False), created_at))
    conn.execute('DELETE FROM heat_snapshots WHERE id NOT IN (SELECT id FROM heat_snapshots ORDER BY id DESC LIMIT ?)',
                 (SNAPSHOT_KEEP,))


async def ingest(body) -> dict:
    """Nhận một bản đồ nhiệt từ trạm: lưu, ghi lịch sử nếu đến hạn, phát WS. Trả về số liệu để trạm kiểm tra."""
    levels = sorted({int(e): float(lv) for e, lv in body.levels}.items())   # trùng cạnh: lấy giá trị cuối
    alerts = [a.model_dump() for a in body.alerts]
    t_sim = float(body.t_sim)
    now_iso = _now_iso()
    saved = False
    if _snapshot_due(t_sim):
        with connect() as conn:
            save_snapshot(conn, t_sim, body.day_start_hour, levels, alerts, now_iso)
        _STATE['last_saved_t'] = t_sim
        saved = True
    hot = [a for a in alerts if a['prob'] >= ALERT_PROB]
    prev = _STATE['alert_edges']
    new_alerts = [a for a in hot if int(a['edge']) not in prev]
    _STATE['alert_edges'] = {int(a['edge']) for a in hot}
    _STATE['latest'] = {'t_sim': t_sim, 'day_start_hour': float(body.day_start_hour), 'levels': levels,
                        'alerts': alerts, 'updated_at': now_iso,
                        'received_ts': datetime.now(timezone.utc).timestamp()}
    await broadcast('heat.update', {'t_sim': t_sim, 'updated_at': now_iso,
                                    'levels': [[e, lv] for e, lv in levels],
                                    'alerts': [_alert_row(a) for a in alerts]},
                    to_roles=OFFICER_ROLES)
    for a in new_alerts:
        await broadcast('alert.congestion', _alert_row(a), to_roles=OFFICER_ROLES)
        await broadcast('alert.congestion', public_alert(a), to_roles=['citizen'])
    return {'saved': saved, 'new_alerts': len(new_alerts)}


def _latest_from_db(conn):
    """Sau khi máy chủ khởi động lại, bộ nhớ trống: lấy bản lịch sử mới nhất làm trạng thái ban đầu."""
    row = conn.execute('SELECT t_sim, levels_json, alerts_json, created_at FROM heat_snapshots ORDER BY id DESC LIMIT 1').fetchone()
    if not row:
        return None
    try:
        received = datetime.fromisoformat(row['created_at'].replace('Z', '+00:00')).timestamp()
    except (ValueError, AttributeError):
        received = 0.0
    return {'t_sim': row['t_sim'], 'day_start_hour': 0.0, 'levels': json.loads(row['levels_json'] or '[]'),
            'alerts': json.loads(row['alerts_json'] or '[]'), 'updated_at': row['created_at'], 'received_ts': received}


def _current(conn):
    return _STATE['latest'] or _latest_from_db(conn)


def _fresh(st, now_ts: float) -> bool:
    return st is not None and now_ts - float(st['received_ts']) <= ALERT_TTL_S


def hourly_means(conn) -> list:
    """Mức nhiệt trung bình theo từng giờ trong ngày, từ lịch sử (24 phần tử; giờ chưa có dữ liệu → null)."""
    rows = conn.execute('SELECT hour, AVG(mean_level) AS mean_level, COUNT(*) AS samples FROM heat_snapshots GROUP BY hour').fetchall()
    by_hour = {r['hour']: r for r in rows}
    out = []
    for h in range(24):
        r = by_hour.get(h)
        out.append({'hour': h, 'mean_level': round(r['mean_level'], 4) if r else None, 'samples': r['samples'] if r else 0})
    return out


def officer_view(conn) -> dict:
    st = _current(conn)
    now_ts = datetime.now(timezone.utc).timestamp()
    total = conn.execute('SELECT COUNT(*) AS n FROM heat_snapshots').fetchone()['n']
    if st is None:
        return {'t_sim': None, 'updated_at': None, 'stale': True, 'levels': [], 'alerts': [],
                'hourly': hourly_means(conn), 'history_count': total, 'bands': LEVEL_LABELS}
    return {'t_sim': st['t_sim'], 'updated_at': st['updated_at'], 'stale': not _fresh(st, now_ts),
            'levels': [[e, lv] for e, lv in st['levels']],
            'alerts': [_alert_row(a) for a in st['alerts']],
            'hourly': hourly_means(conn), 'history_count': total, 'bands': LEVEL_LABELS}


def public_view(conn) -> dict:
    st = _current(conn)
    now_ts = datetime.now(timezone.utc).timestamp()
    if not _fresh(st, now_ts):
        return {'items': [], 'total': 0, 'updated_at': st['updated_at'] if st else None}
    items = sorted((public_alert(a) for a in st['alerts'] if a['prob'] >= ALERT_PROB),
                   key=lambda r: (-r['prob_pct'], r['name']))
    return {'items': items, 'total': len(items), 'updated_at': st['updated_at']}
