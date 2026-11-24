"""
jetson_comm.py – TCP client giao tiếp với Jetson Nano GPIO qua Ethernet/Wi-Fi
Giao thức: JSON strings, mỗi lệnh kết thúc bằng newline '\n'

Lệnh gửi đi (Laptop AI → Jetson Nano):
  {"cmd":"PING"}
  {"cmd":"VIOLATION","plate":"51A12345","type":"car","ts":"20260713_235959"}
  {"cmd":"LIGHT_STATUS","state":"red"}
  {"cmd":"DEMO_RED","seconds":20}
  {"cmd":"STATS"}

Phản hồi từ Jetson Nano (Jetson Nano → Laptop AI):
  {"status":"PONG"}
  {"status":"OK","violations":5}
  {"status":"OK","light":"red","violations":3}
"""

import socket
import json
import threading
import time
import logging

logger = logging.getLogger(__name__)


class JetsonComm:
    """
    TCP client kết nối tới dịch vụ GPIO trên Jetson Nano (TCP server).
    Tự động reconnect khi mất kết nối.
    Thread-safe.
    """

    RECONNECT_DELAY = 5.0   # giây chờ giữa các lần thử kết nối
    SEND_TIMEOUT    = 3.0   # giây timeout khi gửi
    RECV_TIMEOUT    = 3.0   # giây timeout khi nhận
    LIGHT_STALE_SEC = 15.0  # quá thời gian này không dùng trạng thái đèn làm bằng chứng

    def __init__(self, host="192.168.16.210", port=8080, enabled=True):
        """
        host: IP của Jetson Nano chạy jetson-traffic-gpio.service
        port: port TCP server của Jetson Nano (mặc định 8080)
        enabled: False = chạy ở chế độ offline (không cần Jetson)
        """
        self.host    = host
        self.port    = port
        self.enabled = enabled

        self._sock   = None
        self._lock   = threading.Lock()
        self._connected = False
        self._running   = False
        self._thread    = None
        self._reader    = None
        self._total_sent = 0

        # Trạng thái đèn Jetson đẩy về (Jetson là bộ điều khiển chính).
        # g_v/g_h = thời gian xanh thích ứng; c_v/c_h = số xe Jetson dùng để tính.
        self._light = {
            "vertical": "unknown", "horizontal": "unknown",
            "t_v": 0, "t_h": 0,
            "g_v": 0, "g_h": 0, "c_v": 0, "c_h": 0,
            "demo_red": False,
        }
        self._recv_buf = ""
        self._light_updated_at = 0.0
        self._demo_request_at = 0.0
        self._last_error = ""

    # ------------------------------------------------------------------
    def start(self):
        """Bắt đầu thread kết nối nền."""
        if not self.enabled:
            logger.info("JetsonComm: chế độ OFFLINE (không kết nối Jetson)")
            return
        self._running = True
        self._thread = threading.Thread(target=self._connect_loop, daemon=True, name="JetsonCommThread")
        self._thread.start()
        self._reader = threading.Thread(target=self._reader_loop, daemon=True, name="JetsonReaderThread")
        self._reader.start()

    def stop(self):
        self._running = False
        self._mark_disconnected()
        if self._thread:
            self._thread.join(timeout=5)
        if self._reader:
            self._reader.join(timeout=5)
        logger.info("JetsonComm đã đóng.")

    # ------------------------------------------------------------------
    def _mark_disconnected(self, expected_sock=None):
        """Đóng kết nối hiện tại và bỏ trạng thái đèn cũ để không dùng nhầm."""
        with self._lock:
            if expected_sock is not None and self._sock not in (None, expected_sock):
                return
            sock = self._sock
            self._sock = None
            self._connected = False
            self._recv_buf = ""
            self._light.update({"vertical": "unknown", "horizontal": "unknown",
                                "t_v": 0, "t_h": 0, "demo_red": False})
            self._light_updated_at = 0.0
        if sock:
            try:
                sock.close()
            except (OSError, socket.error):
                pass

    # ------------------------------------------------------------------
    def _reader_loop(self):
        """Thread nền: đọc liên tục dòng JSON Jetson đẩy về (nhất là LIGHT)."""
        while self._running:
            sock = self._sock if self._connected else None
            if sock is None:
                time.sleep(0.2)
                continue
            try:
                data = sock.recv(512)
                if not data:
                    self._mark_disconnected(sock)
                    continue
                self._recv_buf += data.decode("utf-8", errors="replace")
                while "\n" in self._recv_buf:
                    line, self._recv_buf = self._recv_buf.split("\n", 1)
                    self._handle_incoming(line.strip())
            except socket.timeout:
                continue
            except (socket.error, OSError):
                self._mark_disconnected(sock)
                continue

    def _handle_incoming(self, line: str):
        """Parse 1 dòng JSON từ Jetson. Quan tâm status=LIGHT để cập nhật đèn."""
        if not line:
            return
        try:
            msg = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            return
        status = msg.get("status")
        if status == "LIGHT":
            with self._lock:
                for k in ("vertical", "horizontal"):
                    if k in msg:
                        self._light[k] = str(msg[k]).lower()
                for k in ("t_v", "t_h", "g_v", "g_h", "c_v", "c_h"):
                    if k in msg:
                        try:
                            self._light[k] = int(msg[k])
                        except (ValueError, TypeError):
                            pass
                if "demo_red" in msg:
                    self._light["demo_red"] = bool(msg["demo_red"])
                self._light_updated_at = time.monotonic()
                self._last_error = ""
            logger.debug("Đèn từ Jetson: %s", self._light)
        elif status == "ERR":
            with self._lock:
                self._last_error = str(msg.get("msg", "Jetson báo lỗi"))
            logger.error("Jetson từ chối lệnh: %s", self._last_error)

    # ------------------------------------------------------------------
    def _connect_loop(self):
        """Thread nền: liên tục thử kết nối tới Jetson Nano."""
        while self._running:
            if not self._connected:
                sock = None
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(5.0)
                    sock.connect((self.host, self.port))
                    sock.settimeout(self.RECV_TIMEOUT)
                    with self._lock:
                        self._sock = sock
                        self._connected = True
                    logger.info("Jetson Nano kết nối thành công: %s:%d", self.host, self.port)

                    # Ping xác nhận
                    self._send_raw({"cmd": "PING"})

                except (socket.error, OSError) as e:
                    logger.warning("Jetson Nano kết nối thất bại: %s – thử lại sau %.0fs", e, self.RECONNECT_DELAY)
                    self._mark_disconnected(sock)
                    time.sleep(self.RECONNECT_DELAY)
            else:
                # Gửi keepalive ping mỗi 10 giây
                time.sleep(10)
                if not self._running:
                    break
                ok = self._send_raw({"cmd": "PING"})
                if not ok:
                    logger.warning("Jetson Nano mất kết nối – đang thử lại...")

    # ------------------------------------------------------------------
    def _send_raw(self, data: dict) -> bool:
        """Gửi JSON + newline tới Jetson Nano. Trả về True nếu thành công."""
        if not self.enabled:
            return True
        try:
            msg = json.dumps(data, ensure_ascii=False) + "\n"
            with self._lock:
                sock = self._sock
                if sock is None:
                    return False
                sock.sendall(msg.encode("utf-8"))
                self._total_sent += 1
            return True
        except (socket.error, OSError) as e:
            # stop() có thể đóng socket khi thread keepalive vừa thức dậy;
            # đây là dọn dẹp bình thường, không phải lỗi Jetson.
            if self._running:
                logger.error("Gửi lệnh thất bại: %s", e)
            self._mark_disconnected(locals().get("sock"))
            return False

    # ------------------------------------------------------------------
    def send_violation(self, plate: str, vehicle_type: str, timestamp: str = None) -> bool:
        """
        Thông báo vi phạm tới Jetson Nano để kích còi/relay.
        plate: biển số xe (vd: "51A12345")
        vehicle_type: loại xe ("car", "motorcycle", ...)
        """
        if timestamp is None:
            timestamp = time.strftime("%Y%m%d_%H%M%S")

        data = {
            "cmd"   : "VIOLATION",
            "plate" : plate,
            "type"  : vehicle_type,
            "ts"    : timestamp,
        }
        ok = self._send_raw(data)
        if ok:
            logger.info("Gửi vi phạm → Jetson Nano: %s [%s]", plate, vehicle_type)
        return ok

    def send_count(self, vertical: int, horizontal: int) -> bool:
        """
        Gửi số xe đếm được mỗi trục cho Jetson để chỉnh thời gian đèn thích ứng.
        vertical  : số xe trục dọc (Bắc-Nam) trong chu kỳ vừa rồi
        horizontal: số xe trục ngang (Đông-Tây)
        """
        ok = self._send_raw({"cmd": "COUNT",
                             "vertical": int(vertical),
                             "horizontal": int(horizontal)})
        if ok:
            logger.info("Gửi COUNT → Jetson Nano: dọc=%d, ngang=%d", vertical, horizontal)
        return ok

    def send_light_status(self, state: str) -> bool:
        """Giữ giao thức cũ; Jetson tự điều khiển đèn, không nhận lệnh này."""
        return True

    def start_demo_red(self, seconds: int = 15) -> bool:
        """Gửi yêu cầu all-red; gọi wait_for_demo_red() trước khi ghi bằng chứng."""
        try:
            seconds = max(1, min(120, int(seconds)))
        except (TypeError, ValueError):
            return False
        with self._lock:
            # Bỏ snapshot cũ: chỉ LIGHT mới sau request này mới được xem là xác nhận.
            self._light["demo_red"] = False
            self._demo_request_at = time.monotonic()
            self._last_error = ""
        ok = self._send_raw({"cmd": "DEMO_RED", "seconds": seconds})
        if ok:
            logger.warning("Yêu cầu Jetson demo all-red trong %ss", seconds)
        return ok

    def wait_for_demo_red(self, timeout: float = 5.0) -> bool:
        """Chờ LIGHT mới xác nhận cả hai hướng đỏ trong khoảng timeout."""
        deadline = time.monotonic() + max(0.1, float(timeout))
        while time.monotonic() < deadline:
            with self._lock:
                fresh = self._light_updated_at >= self._demo_request_at > 0
                confirmed = (fresh and self._light.get("demo_red")
                             and self._light.get("vertical") == "red"
                             and self._light.get("horizontal") == "red")
                err = self._last_error
            if confirmed:
                logger.info("Jetson xác nhận DEMO ALL-RED.")
                return True
            if err:
                logger.error("Không xác nhận DEMO ALL-RED: %s", err)
                return False
            if not self.is_connected():
                break
            time.sleep(0.05)
        logger.error("Jetson không xác nhận DEMO ALL-RED trong %.1fs", timeout)
        return False

    def request_stats(self) -> bool:
        """Yêu cầu Jetson gửi thống kê hiện tại."""
        return self._send_raw({"cmd": "STATS"})

    # ------------------------------------------------------------------
    def _light_is_fresh_locked(self):
        return (self._light_updated_at > 0
                and time.monotonic() - self._light_updated_at <= self.LIGHT_STALE_SEC)

    def has_fresh_light(self):
        """True khi vừa nhận snapshot LIGHT đủ mới từ Jetson."""
        with self._lock:
            return self._connected and self._light_is_fresh_locked()

    def get_light(self, axis: str = "vertical") -> str:
        """Trạng thái đèn của trục ('vertical'|'horizontal') do Jetson đẩy về."""
        with self._lock:
            if not self._light_is_fresh_locked():
                return "unknown"
            return self._light.get(axis, "unknown")

    def get_light_time(self, axis: str = "vertical") -> int:
        """Giây còn lại của đèn trục đó (Jetson đẩy về, dùng hiển thị UI)."""
        with self._lock:
            if not self._light_is_fresh_locked():
                return 0
            return int(self._light.get("t_v" if axis == "vertical" else "t_h", 0))

    def get_green_time(self, axis: str = "vertical") -> int:
        """Thời gian xanh THÍCH ỨNG Jetson tính cho trục đó (giây). 0 nếu chưa có."""
        with self._lock:
            if not self._light_is_fresh_locked():
                return 0
            return int(self._light.get("g_v" if axis == "vertical" else "g_h", 0))

    def is_demo_red(self) -> bool:
        """True khi Jetson đang giữ all-red theo lệnh demo video."""
        with self._lock:
            return self._light_is_fresh_locked() and bool(self._light.get("demo_red", False))

    # ------------------------------------------------------------------
    def is_connected(self):
        with self._lock:
            return self._connected and self.enabled

    def total_sent(self):
        return self._total_sent

    # ------------------------------------------------------------------
    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()


# ======================================================================
# Chạy thử độc lập – python jetson_comm.py --host 192.168.16.210
# ======================================================================
def main():
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="192.168.16.210")
    ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()

    comm = JetsonComm(host=args.host, port=args.port)
    comm.start()

    time.sleep(2)
    print(f"Kết nối: {comm.is_connected()}")

    # Test gửi vi phạm
    comm.send_violation("51A12345", "car")
    time.sleep(1)
    comm.send_light_status("red")
    time.sleep(5)
    comm.stop()


if __name__ == "__main__":
    main()
