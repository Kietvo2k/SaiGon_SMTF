"""
vehicle_counter.py – Đếm xe đi qua vạch đếm theo track_id
Đặc điểm:
  - Mỗi track_id chỉ đếm 1 lần khi tâm xe CẮT QUA vạch (theo cả 2 chiều)
  - Dựa vào lịch sử vị trí tâm xe để phát hiện thời điểm cắt vạch
  - Tự dọn track không còn xuất hiện
  - reset() để xóa bộ đếm tích lũy sau mỗi chu kỳ gửi Jetson Nano
"""

import time
import logging

logger = logging.getLogger(__name__)


class VehicleCounter:
    """
    Đếm số xe đi qua một vạch ngang (Y cố định) trên 1 tuyến.
    """

    MAX_IDLE_SEC = 3.0  # giây không thấy track → xóa khỏi bộ nhớ

    def __init__(self, count_line_y, max_idle_sec=None):
        self.count_line_y = count_line_y
        self.max_idle_sec = (self.MAX_IDLE_SEC if max_idle_sec is None
                             else max(1.0, float(max_idle_sec)))
        self._prev_cy   = {}   # {track_id: cy lần trước}
        self._counted   = set()  # track_id đã đếm (không đếm lại)
        self._last_seen = {}   # {track_id: timestamp}
        self._total     = 0    # tổng tích lũy (reset mỗi chu kỳ)

    # ------------------------------------------------------------------
    def update(self, track_id, box):
        """
        Cập nhật vị trí 1 xe. Trả về True nếu xe VỪA cắt vạch (đếm mới).
        box: [x1, y1, x2, y2]
        """
        x1, y1, x2, y2 = box
        cy = (y1 + y2) / 2
        self._last_seen[track_id] = time.time()

        prev = self._prev_cy.get(track_id)
        self._prev_cy[track_id] = cy

        if prev is None or track_id in self._counted:
            return False

        line = self.count_line_y
        # Cắt vạch: vị trí trước và hiện tại nằm 2 phía của vạch
        crossed = (prev < line <= cy) or (prev > line >= cy)
        if crossed:
            self._counted.add(track_id)
            self._total += 1
            return True
        return False

    # ------------------------------------------------------------------
    def cleanup(self, active_ids):
        """Xóa track không còn hoạt động (giải phóng bộ nhớ)."""
        now = time.time()
        dead = [tid for tid, ts in self._last_seen.items()
                if tid not in active_ids and now - ts > self.max_idle_sec]
        for tid in dead:
            self._prev_cy.pop(tid, None)
            self._last_seen.pop(tid, None)
            self._counted.discard(tid)

    # ------------------------------------------------------------------
    def count(self):
        """Số xe đếm được từ lần reset gần nhất."""
        return self._total

    def reset(self):
        """Đặt lại bộ đếm tích lũy (gọi sau khi gửi số liệu cho Jetson Nano)."""
        self._total = 0
