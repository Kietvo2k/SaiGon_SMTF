"""
camera_manager.py – Quản lý nguồn hình (USB webcam / RTSP / file video)
Đặc điểm:
  - Thread riêng đọc frame liên tục → không bao giờ bị lag do inference
  - Tự động reconnect khi mất tín hiệu camera
  - Hỗ trợ USB webcam (index int), IP camera (RTSP URL) và file video cục bộ
  - File video phát theo FPS gốc và có thể tự lặp để làm camera mô phỏng
"""

import cv2
import sys
import os
import threading
import time
import logging

logger = logging.getLogger(__name__)


class CameraManager:
    """
    Quản lý camera với buffer frame riêng.
    Dùng thread nền để liên tục đọc frame → inference thread luôn có frame mới nhất.
    """

    def __init__(self, source=0, width=1280, height=720, fps=30,
                 reconnect_delay=3.0, loop_video=True, video_fps=None, video_stride=1):
        """
        source: int (index webcam USB), RTSP URL hoặc đường dẫn file video
                Ví dụ: 0, 1, 'rtsp://...', '2.mp4'
        width/height: độ phân giải mong muốn (0 = giữ nguyên camera)
        fps: FPS mong muốn
        reconnect_delay: giây chờ trước khi thử kết nối lại
        """
        self.source = source
        self.width = width
        self.height = height
        self.fps = fps
        self.reconnect_delay = reconnect_delay
        self.loop_video = loop_video
        self.video_fps = video_fps
        self.video_stride = max(1, int(video_stride or 1))
        self._is_video_file = isinstance(source, str) and os.path.isfile(source)
        self._video_fps = 0.0
        self._next_video_frame_at = None

        self._cap = None
        self._frame = None
        self._lock = threading.Lock()
        self._frame_cond = threading.Condition(self._lock)
        self._video_frame_ready = False
        self._running = False
        self._thread = None
        self._connected = False
        self._frame_count = 0
        self._last_frame_time = 0.0

    # ------------------------------------------------------------------
    def _open_camera(self):
        """Mở camera và cấu hình độ phân giải / FPS."""
        if self._is_video_file:
            cap = cv2.VideoCapture(self.source)
        elif isinstance(self.source, int):
            # USB webcam. CAP_DSHOW chi co tren Windows; Linux (Jetson) dung backend mac dinh (V4L2).
            if sys.platform == "win32":
                cap = cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
                if not cap.isOpened():
                    cap = cv2.VideoCapture(self.source)
            else:
                cap = cv2.VideoCapture(self.source)
        else:
            # IP camera / RTSP
            cap = cv2.VideoCapture(self.source)

        if not cap.isOpened():
            return None

        if self._is_video_file:
            # Không ép FPS/độ phân giải của file: phát theo tốc độ bản gốc.
            self._video_fps = self.video_fps or cap.get(cv2.CAP_PROP_FPS) or 25.0
            if self._video_fps <= 0 or self._video_fps > 240:
                self._video_fps = 25.0
            self._next_video_frame_at = time.monotonic()
            logger.info("Mở video mô phỏng: %s (%.2f FPS, loop=%s)",
                        self.source, self._video_fps, self.loop_video)
        else:
            # Đặt độ phân giải cho camera/RTSP, không áp dụng vào file video.
            if self.width > 0:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            if self.height > 0:
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            if self.fps > 0:
                cap.set(cv2.CAP_PROP_FPS, self.fps)

        # Giảm buffer nội bộ của OpenCV → lấy frame mới nhất, không bị trễ
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        return cap

    # ------------------------------------------------------------------
    def _read_loop(self):
        """Vòng lặp nền: liên tục đọc frame từ camera."""
        while self._running:
            # Kết nối lần đầu hoặc sau khi mất kết nối
            if self._cap is None or not self._cap.isOpened():
                self._connected = False
                # Local video files do not need a network reconnect backoff.
                retry_delay = 0.0 if self._is_video_file else self.reconnect_delay
                if retry_delay > 0:
                    logger.warning("Camera mất kết nối, đang thử lại sau %.1fs...", retry_delay)
                    time.sleep(retry_delay)

                self._cap = self._open_camera()
                if self._cap is None:
                    continue

                # Camera thật cần ổn định; video phải giữ frame đầu tiên.
                if not self._is_video_file:
                    for _ in range(5):
                        self._cap.read()

                self._connected = True
                logger.info("Camera kết nối thành công: %s", self.source)

            # Không đọc file ở tốc độ tối đa của CPU: giữ nhịp FPS gốc để
            # tracker và lệnh COUNT phản ánh thời gian thật.
            # Khác với camera/RTSP, file video phải được consumer xử lý tuần tự.
            # Nếu ghi đè "frame mới nhất" thì CPU chậm sẽ làm tracker mất lịch sử
            # ngay tại vạch dừng và bằng chứng không còn đáng tin.
            if self._is_video_file:
                with self._frame_cond:
                    while self._running and self._video_frame_ready:
                        self._frame_cond.wait(timeout=0.2)
                    if not self._running:
                        break
            if self._is_video_file and self._next_video_frame_at is not None:
                now = time.monotonic()
                wait = self._next_video_frame_at - now
                if wait > 0:
                    time.sleep(min(wait, 0.1))
                    continue
                self._next_video_frame_at = max(
                    self._next_video_frame_at + (1.0 / self._video_fps), now)

            if self._is_video_file and self.video_stride > 1:
                for _ in range(self.video_stride - 1):
                    if not self._cap.grab():
                        break
            ret, frame = self._cap.read()
            if not ret or frame is None:
                if self._is_video_file and self.loop_video:
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self._next_video_frame_at = time.monotonic()
                    logger.info("Video mô phỏng kết thúc; phát lại từ đầu: %s", self.source)
                    continue
                if self._is_video_file:
                    logger.info("Video mô phỏng đã kết thúc: %s", self.source)
                    self._connected = False
                    self._running = False
                    break
                self._cap.release()
                self._cap = None
                self._connected = False
                continue

            with self._frame_cond:
                self._frame = frame
                self._frame_count += 1
                self._last_frame_time = time.time()
                if self._is_video_file:
                    self._video_frame_ready = True
                self._frame_cond.notify_all()

    # ------------------------------------------------------------------
    def start(self):
        """Bắt đầu thread đọc camera."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True, name="CameraThread")
        self._thread.start()

        # Chờ frame đầu tiên (tối đa 45 giây — Nano tải nặng frame đầu về chậm)
        deadline = time.time() + 45
        while time.time() < deadline:
            if self._frame is not None:
                break
            time.sleep(0.1)

        if self._frame is None:
            logger.warning("Không nhận được frame sau 10s. Kiểm tra lại camera.")
        else:
            logger.info("Camera sẵn sàng. Độ phân giải: %dx%d",
                        self._frame.shape[1], self._frame.shape[0])

    # ------------------------------------------------------------------
    def read(self):
        """
        Trả về frame mới nhất (copy).
        Trả về None nếu chưa có frame.
        """
        with self._frame_cond:
            if self._frame is None:
                return None
            if self._is_video_file:
                if not self._video_frame_ready:
                    return None
                self._video_frame_ready = False
                self._frame_cond.notify_all()
            return self._frame.copy()

    def peek(self):
        """Xem frame hiện tại mà không đánh dấu đã tiêu thụ (dùng cho probe/warm-up)."""
        with self._frame_cond:
            return None if self._frame is None else self._frame.copy()

    # ------------------------------------------------------------------
    def is_connected(self):
        return self._connected

    def is_video_file(self):
        return self._is_video_file

    def frame_count(self):
        return self._frame_count

    def get_fps(self):
        """Return the effective source FPS for video recording/timing."""
        if self._is_video_file and self._video_fps > 0:
            return float(self._video_fps)
        if self._cap is None:
            return 0.0
        value = float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0)
        return value if 0.0 < value <= 240.0 else 0.0

    def fps_actual(self):
        """FPS thực tế (ước tính dựa trên thời gian frame cuối)."""
        # Đây chỉ là xấp xỉ đơn giản
        return self.get_fps()

    # ------------------------------------------------------------------
    def stop(self):
        """Dừng thread và giải phóng camera."""
        self._running = False
        with self._frame_cond:
            self._frame_cond.notify_all()
        if self._thread is not None:
            self._thread.join(timeout=5)
        if self._cap is not None:
            self._cap.release()
        logger.info("Camera đã đóng.")

    # ------------------------------------------------------------------
    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()


# ======================================================================
# Chạy thử độc lập – python camera_manager.py
# ======================================================================
if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    ap = argparse.ArgumentParser(description="Test CameraManager")
    ap.add_argument("--source", default="0",
                    help="Index webcam (0,1,...) hoặc RTSP URL")
    args = ap.parse_args()

    # Chuyển source về int nếu là số
    source = args.source
    try:
        source = int(source)
    except ValueError:
        pass  # giữ nguyên string (RTSP)

    with CameraManager(source=source, width=1280, height=720) as cam:
        print("Nhấn 'q' để thoát")
        while True:
            frame = cam.read()
            if frame is None:
                print("Chờ camera...", end="\r")
                time.sleep(0.1)
                continue

            cv2.putText(frame, f"Frame #{cam.frame_count()} | Connected: {cam.is_connected()}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.imshow("Camera Test", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    cv2.destroyAllWindows()
