# Bảng VMS (M6c): danh sách bảng cố định, lọc nội dung và trạng thái trạm đã báo.
# Module riêng để `station.py` và `officer.py` cùng dùng mà không import vòng.
import unicodedata

from app.audit import now_iso

VMS_IDS = ('VMS-01', 'VMS-02', 'VMS-03', 'VMS-04')
VMS_MODES = ('auto', 'manual')
TEXT_MAX = 60   # ký tự, sau khi đã lọc ký tự điều khiển

# vms_id → {text, mode, reported_at}: trạng thái bảng do TRẠM báo qua /station/metrics (trường `vms`).
STATION_VMS = {}


def clean_text(raw: str) -> str:
    """Bỏ ký tự điều khiển (Cc → khoảng trắng) và ký tự định dạng vô hình (Cf → xóa), gọn khoảng trắng."""
    out = []
    for ch in str(raw):
        cat = unicodedata.category(ch)
        if cat == 'Cc':
            out.append(' ')
        elif cat != 'Cf':
            out.append(ch)
    return ' '.join(''.join(out).split())


def report_from_station(items) -> None:
    """Thay toàn bộ trạng thái VMS đã báo bằng danh sách trạm gửi (mục sai/ngoài danh sách bị bỏ qua)."""
    if not isinstance(items, list):
        return
    fresh = {}
    stamp = now_iso()
    for it in items[: len(VMS_IDS)]:
        if not isinstance(it, dict) or it.get('vms_id') not in VMS_IDS:
            continue
        mode = it.get('mode') if it.get('mode') in VMS_MODES else 'auto'
        fresh[it['vms_id']] = {'text': clean_text(it.get('text') or '')[:TEXT_MAX], 'mode': mode, 'reported_at': stamp}
    STATION_VMS.clear()
    STATION_VMS.update(fresh)
