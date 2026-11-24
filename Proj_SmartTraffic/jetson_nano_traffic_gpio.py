"""
jetson_nano_traffic_gpio.py
Bộ điều khiển đèn giao thông ngã tư 2 pha (dọc / ngang) CHẠY TRÊN Jetson Nano,
dùng chân GPIO 40-pin của Nano làm bộ điều khiển phần cứng chính.

File độc lập với các controller cũ (`arduino_mega_ethernet.ino`,
`esp32s3_traffic_wifi.ino`). Giao thức TCP-JSON dùng port 8080:
    python main.py --jetson <IP_JETSON_NANO>

Vai trò: điều khiển đèn LED 3 màu 2 trục + (tùy chọn)
LED 7 đoạn đếm ngược qua 74HC595, thời gian xanh THÍCH ỨNG theo số xe laptop
gửi về.

Giao thức TCP (port 8080), mỗi lệnh 1 dòng JSON kết thúc '\n':
  Laptop -> Jetson:
    {"cmd":"COUNT","vertical":<int>,"horizontal":<int>}
    {"cmd":"PING"}   {"cmd":"STATS"}
    {"cmd":"DEMO_RED","seconds":<1..120>}
    {"cmd":"VIOLATION","plate":"...","type":"...","ts":"..."}
  Jetson -> Laptop:
    {"status":"LIGHT","vertical":"red|green|yellow","horizontal":"...",
     "t_v":<s>,"t_h":<s>,"g_v":<s>,"g_h":<s>,"c_v":<n>,"c_h":<n>}
    {"status":"PONG"}
    {"status":"OK","violations":N}

PHẦN CỨNG (Jetson Nano 40-pin header, đánh số BOARD = số chân vật lý):
  V_RED=29  V_YELLOW=31 V_GREEN=33   (trục dọc Bắc-Nam)
  H_RED=35  H_YELLOW=37 H_GREEN=38   (trục ngang Đông-Tây)
  BUZZER=40 RELAY=32   STATUS=36
  74HC595 (LED 7 đoạn, TÙY CHỌN, giống 2 bản khác):
    Trục dọc:   DATA=7  CLOCK=11 LATCH=12
    Trục ngang: DATA=13 CLOCK=15 LATCH=16
  Đổi số chân trong PIN_MAP/SEG_PIN_MAP dưới nếu dây đấu thật khác.
  Nano GPIO là logic 3.3V. DATA/CLOCK/LATCH chỉ nối trực tiếp với 74HC595
  chạy 3.3V; đèn, relay và còi phải qua ULN2803A/MOSFET driver, không nối
  tải hoặc nguồn 5/12V trực tiếp vào GPIO.

CÀI ĐẶT: pip3 install Jetson.GPIO (có sẵn trên JetPack).
CHẠY (cần quyền root để dùng GPIO): sudo python3 jetson_nano_traffic_gpio.py
Tham số: --port 8080 (đổi port TCP nếu cần), --no-7seg (tắt LED 7 đoạn).

Nếu chạy trên máy KHÔNG PHẢI Jetson (ví dụ đọc/sửa code trên laptop trước khi
đem qua Nano), script tự chuyển sang GPIO_STUB (chỉ log, không điều khiển
phần cứng thật) để không crash vì thiếu thư viện Jetson.GPIO.
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Python 3.7+; Jetson JetPack dùng 3.6 không có hàm này

import json
import socket
import threading
import time
import logging
import argparse
import signal

logging.basicConfig(level=logging.INFO,
                     format="%(asctime)s | %(levelname)-8s | %(message)s",
                     datefmt="%H:%M:%S")
logger = logging.getLogger("jetson_traffic")


# ======================================================================
# GPIO: dùng Jetson.GPIO thật nếu có, không thì STUB (chỉ log) để chạy
# thử code trên máy không phải Nano mà không bị lỗi import.
# ======================================================================
try:
    import Jetson.GPIO as GPIO
    GPIO_REAL = True
except ImportError:
    GPIO_REAL = False

    class _GpioStub:
        BOARD = "BOARD"
        OUT = "OUT"
        HIGH = 1
        LOW = 0

        def setmode(self, *a, **k): pass
        def setwarnings(self, *a, **k): pass
        def setup(self, pin, mode, initial=None):
            logger.debug("[GPIO-STUB] setup pin=%s", pin)
        def output(self, pin, value):
            logger.debug("[GPIO-STUB] pin=%s -> %s", pin, value)
        def cleanup(self, *a, **k): pass

    GPIO = _GpioStub()
    logger.warning("Jetson.GPIO không có sẵn - chạy ở chế độ STUB (chỉ log, "
                    "không điều khiển phần cứng thật). Cài Jetson.GPIO trên "
                    "Nano thật để dùng GPIO thật.")


# ======================================================================
# CHÂN ĐÈN 2 TRỤC (số chân BOARD = số chân vật lý trên header 40-pin)
# ======================================================================
PIN_MAP = {
    "V_RED": 29, "V_YELLOW": 31, "V_GREEN": 33,
    "H_RED": 35, "H_YELLOW": 37, "H_GREEN": 38,
}
PIN_BUZZER = 40
PIN_RELAY  = 32
PIN_STATUS = 36

# LED 7 đoạn 74HC595 (tùy chọn)
SEG_PIN_MAP = {
    "DATA_V": 7,  "CLOCK_V": 11, "LATCH_V": 12,
    "DATA_H": 13, "CLOCK_H": 15, "LATCH_H": 16,
}

# This deployment assumes active-HIGH, low-side ULN2803A/MOSFET drivers.
# Never connect relay coils, buzzers, or 5/12V lamps directly to a GPIO pin.
# Set a pin to False only when its verified driver is active-low.
OUTPUT_ACTIVE_HIGH = {pin: True for pin in (
    *PIN_MAP.values(), PIN_BUZZER, PIN_RELAY, PIN_STATUS,
)}


def _output_level(pin, active):
    """Map a logical load state to its configured electrical level."""
    active_high = OUTPUT_ACTIVE_HIGH.get(pin, True)
    return GPIO.HIGH if bool(active) == active_high else GPIO.LOW


def set_output(pin, active):
    """Write a logical load state through the configured driver polarity."""
    GPIO.output(pin, _output_level(pin, active))
# Mã LED 7 đoạn anode chung (0-9), đảo bit
DIGIT_CODE = [
    ~0b00111111 & 0xFF, ~0b00000110 & 0xFF, ~0b01011011 & 0xFF, ~0b01001111 & 0xFF,
    ~0b01100110 & 0xFF, ~0b01101101 & 0xFF, ~0b01111101 & 0xFF, ~0b00000111 & 0xFF,
    ~0b01111111 & 0xFF, ~0b01101111 & 0xFF,
]

# ======================================================================
# THAM SỐ ĐÈN
# ======================================================================
T_YELLOW     = 3    # giây đèn vàng
T_GREEN_MIN  = 5    # xanh tối thiểu
T_GREEN_MAX  = 25   # xanh tối đa
T_GREEN_BASE = 10   # xanh mặc định khi cân bằng
ALERT_SEC    = 3.0  # còi kêu 3s mỗi vi phạm
DEMO_RED_MAX_SEC = 120  # giới hạn giữ all-red cho demo video

# Pha đèn
ALL_RED_SEC = 1.0
MAX_LINE_BYTES = 4096
V_GO, V_YEL, H_GO, H_YEL, ALL_RED = "V_GO", "V_YEL", "H_GO", "H_YEL", "ALL_RED"


def shift_out(data_pin, clock_pin, value):
    """Bit-banging 74HC595, MSB first."""
    for i in range(7, -1, -1):
        bit = (value >> i) & 1
        GPIO.output(clock_pin, GPIO.LOW)
        GPIO.output(data_pin, GPIO.HIGH if bit else GPIO.LOW)
        GPIO.output(clock_pin, GPIO.HIGH)


class TrafficController:
    """Máy trạng thái đèn 2 trục + tính thời gian xanh thích ứng."""

    def __init__(self, use_7seg=True):
        self.use_7seg = use_7seg
        self.phase = ALL_RED
        self.phase_start = time.monotonic()
        self.phase_duration = ALL_RED_SEC
        self.next_phase = V_GO

        self.count_v = 0
        self.count_h = 0
        self.green_v = T_GREEN_BASE
        self.green_h = T_GREEN_BASE

        self.violation_count = 0
        self.buzzer_off_at = None
        self.demo_red = False

        self._lock = threading.Lock()
        self._setup_gpio()
        self._enter_phase(ALL_RED)
        set_output(PIN_STATUS, True)

    # ------------------------------------------------------------------
    def _setup_gpio(self):
        GPIO.setmode(GPIO.BOARD)
        GPIO.setwarnings(False)
        for pin in PIN_MAP.values():
            GPIO.setup(pin, GPIO.OUT, initial=_output_level(pin, False))
        GPIO.setup(PIN_BUZZER, GPIO.OUT, initial=_output_level(PIN_BUZZER, False))
        GPIO.setup(PIN_RELAY, GPIO.OUT, initial=_output_level(PIN_RELAY, False))
        GPIO.setup(PIN_STATUS, GPIO.OUT, initial=_output_level(PIN_STATUS, False))
        if self.use_7seg:
            for pin in SEG_PIN_MAP.values():
                GPIO.setup(pin, GPIO.OUT, initial=GPIO.LOW)

    def safe_off(self):
        """De-energize every externally driven load before releasing GPIO."""
        with self._lock:
            self._set_lights(0, 0, 0, 0, 0, 0)
            set_output(PIN_BUZZER, False)
            set_output(PIN_RELAY, False)
            set_output(PIN_STATUS, False)
            self.buzzer_off_at = None
            if self.use_7seg:
                self._blank_7seg()

    def cleanup(self):
        try:
            self.safe_off()
        except Exception:
            logger.exception("Could not drive GPIO to the safe state")
        finally:
            try:
                GPIO.cleanup()
            except Exception:
                logger.exception("GPIO cleanup failed")

    # ------------------------------------------------------------------
    def _set_lights(self, v_r, v_y, v_g, h_r, h_y, h_g):
        set_output(PIN_MAP["V_RED"], v_r)
        set_output(PIN_MAP["V_YELLOW"], v_y)
        set_output(PIN_MAP["V_GREEN"], v_g)
        set_output(PIN_MAP["H_RED"], h_r)
        set_output(PIN_MAP["H_YELLOW"], h_y)
        set_output(PIN_MAP["H_GREEN"], h_g)

    def v_state(self):
        if self.phase == V_GO:
            return "green"
        if self.phase == V_YEL:
            return "yellow"
        return "red"

    def h_state(self):
        if self.phase == H_GO:
            return "green"
        if self.phase == H_YEL:
            return "yellow"
        return "red"

    # ------------------------------------------------------------------
    def compute_green_times(self):
        """Chia tỉ lệ thời gian xanh theo số xe, kẹp [MIN, MAX],
        không xe thì về mức BASE cân bằng."""
        total = self.count_v + self.count_h
        if total <= 0:
            self.green_v = T_GREEN_BASE
            self.green_h = T_GREEN_BASE
            return
        budget = 2 * T_GREEN_BASE
        g_v = int(budget * self.count_v / total)
        g_h = budget - g_v
        g_v = max(T_GREEN_MIN, min(T_GREEN_MAX, g_v))
        g_h = max(T_GREEN_MIN, min(T_GREEN_MAX, g_h))
        self.green_v = g_v
        self.green_h = g_h

    # ------------------------------------------------------------------
    def _enter_phase(self, phase, duration=None):
        self.phase = phase
        self.phase_start = time.monotonic()
        if phase == ALL_RED:
            self._set_lights(1, 0, 0, 1, 0, 0)
            self.phase_duration = ALL_RED_SEC if duration is None else float(duration)
        elif phase == V_GO:
            self.demo_red = False
            self._set_lights(0, 0, 1, 1, 0, 0)
            self.phase_duration = self.green_v
        elif phase == V_YEL:
            self.demo_red = False
            self._set_lights(0, 1, 0, 1, 0, 0)
            self.phase_duration = T_YELLOW
        elif phase == H_GO:
            self.demo_red = False
            self._set_lights(1, 0, 0, 0, 0, 1)
            self.phase_duration = self.green_h
        elif phase == H_YEL:
            self.demo_red = False
            self._set_lights(1, 0, 0, 0, 1, 0)
            self.phase_duration = T_YELLOW
        logger.info("[PHA] V=%s H=%s dur=%.1fs", self.v_state(), self.h_state(),
                    self.phase_duration)

    def advance_phase(self):
        if self.phase == V_GO:
            self._enter_phase(V_YEL)
        elif self.phase == V_YEL:
            self.compute_green_times()
            self.next_phase = H_GO
            self._enter_phase(ALL_RED)
        elif self.phase == H_GO:
            self._enter_phase(H_YEL)
        elif self.phase == H_YEL:
            self.compute_green_times()
            self.next_phase = V_GO
            self._enter_phase(ALL_RED)
        elif self.phase == ALL_RED:
            self._enter_phase(self.next_phase)

    # ------------------------------------------------------------------
    def _remaining(self):
        elapsed = time.monotonic() - self.phase_start
        remain = self.phase_duration - int(elapsed)
        return max(0, remain)

    def tick(self):
        """Gọi liên tục trong loop chính: cập nhật LED 7 đoạn + chuyển pha
        khi hết giờ + tắt còi/relay sau ALERT_SEC. Trả về True nếu vừa
        chuyển pha (để bên ngoài biết cần pushLight ngay)."""
        with self._lock:
            if self.buzzer_off_at is not None and time.monotonic() >= self.buzzer_off_at:
                set_output(PIN_BUZZER, False)
                set_output(PIN_RELAY, False)
                self.buzzer_off_at = None

            remain = self._remaining()
            if self.use_7seg:
                if self.phase in (V_GO, V_YEL):
                    self._show_countdown(remain, remain + (T_YELLOW if self.phase == V_GO else 0))
                elif self.phase in (H_GO, H_YEL):
                    self._show_countdown(remain + (T_YELLOW if self.phase == H_GO else 0), remain)
                else:
                    self._show_countdown(0, 0)

            elapsed = time.monotonic() - self.phase_start
            if elapsed >= self.phase_duration:
                self.advance_phase()
                return True
            return False

    def _show_countdown(self, t_v, t_h):
        if not self.use_7seg:
            return
        t_v = max(0, min(99, t_v))
        t_h = max(0, min(99, t_h))
        self._display_number(t_v, SEG_PIN_MAP["DATA_V"], SEG_PIN_MAP["CLOCK_V"], SEG_PIN_MAP["LATCH_V"])
        self._display_number(t_h, SEG_PIN_MAP["DATA_H"], SEG_PIN_MAP["CLOCK_H"], SEG_PIN_MAP["LATCH_H"])

    def _display_number(self, number, data_pin, clock_pin, latch_pin):
        tens, ones = divmod(number, 10)
        GPIO.output(latch_pin, GPIO.LOW)
        shift_out(data_pin, clock_pin, DIGIT_CODE[ones])
        shift_out(data_pin, clock_pin, DIGIT_CODE[tens])
        GPIO.output(latch_pin, GPIO.HIGH)

    def _blank_7seg(self):
        """Blank both chained 74HC595 digits on each axis (common-anode)."""
        for axis in ("V", "H"):
            data_pin = SEG_PIN_MAP["DATA_" + axis]
            clock_pin = SEG_PIN_MAP["CLOCK_" + axis]
            latch_pin = SEG_PIN_MAP["LATCH_" + axis]
            GPIO.output(latch_pin, GPIO.LOW)
            shift_out(data_pin, clock_pin, 0xFF)
            shift_out(data_pin, clock_pin, 0xFF)
            GPIO.output(latch_pin, GPIO.HIGH)

    # ------------------------------------------------------------------
    def set_count(self, v, h):
        with self._lock:
            self.count_v = int(v)
            self.count_h = int(h)

    def hold_all_red(self, seconds):
        """Giữ cả hai hướng đỏ trong một khoảng demo an toàn, rồi tự tiếp tục chu kỳ."""
        seconds = max(1, min(DEMO_RED_MAX_SEC, int(seconds)))
        with self._lock:
            self.next_phase = V_GO
            self.demo_red = True
            self._enter_phase(ALL_RED, duration=seconds)
        return seconds

    def register_violation(self):
        with self._lock:
            self.violation_count += 1
            set_output(PIN_BUZZER, True)
            set_output(PIN_RELAY, True)
            self.buzzer_off_at = time.monotonic() + ALERT_SEC
            return self.violation_count

    def light_snapshot(self):
        """Trả về dict để đóng gói JSON LIGHT."""
        with self._lock:
            remain = self._remaining()
            if self.phase == V_GO:
                t_v, t_h = remain, remain + T_YELLOW
            elif self.phase == V_YEL:
                t_v, t_h = remain, remain
            elif self.phase == H_GO:
                t_h, t_v = remain, remain + T_YELLOW
            elif self.phase == H_YEL:
                t_h, t_v = remain, remain
            else:
                t_v, t_h = 0, 0
            return {
                "status": "LIGHT",
                "vertical": self.v_state(), "horizontal": self.h_state(),
                "t_v": t_v, "t_h": t_h,
                "g_v": self.green_v, "g_h": self.green_h,
                "c_v": self.count_v, "c_h": self.count_h,
                "demo_red": self.demo_red,
            }


# ======================================================================
# TCP SERVER (port 8080, JSON + '\n')
# ======================================================================
class ClientHandler(threading.Thread):
    """1 thread mỗi client kết nối. Đọc dòng JSON, trả lời, và giữ lại
    làm 'active client' để server đẩy LIGHT ngay khi đổi pha."""

    def __init__(self, sock, addr, controller: TrafficController, server_state):
        super().__init__(daemon=True)
        self.sock = sock
        self.addr = addr
        self.controller = controller
        self.server_state = server_state  # dict chia sẻ {"active_sock": ...}
        self._running = True

    def send_json(self, obj):
        try:
            self.sock.sendall((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))
            return True
        except (OSError, socket.error):
            return False

    def run(self):
        logger.info("Client kết nối: %s", self.addr)
        self.server_state["active_handler"] = self
        buf = ""
        self.sock.settimeout(1.0)
        try:
            while self._running:
                try:
                    data = self.sock.recv(512)
                except socket.timeout:
                    continue
                if not data:
                    break
                buf += data.decode("utf-8", errors="replace")
                if len(buf) > MAX_LINE_BYTES:
                    self.send_json({"status": "ERR", "msg": "line too long"})
                    break
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    self._handle_line(line.strip())
        except (OSError, socket.error) as e:
            logger.warning("Client %s lỗi: %s", self.addr, e)
        finally:
            try:
                self.sock.close()
            except Exception:
                pass
            if self.server_state.get("active_handler") is self:
                self.server_state["active_handler"] = None
            logger.info("Client rời: %s", self.addr)

    def _handle_line(self, line):
        if not line:
            return
        if self.server_state.get("stopping"):
            self.send_json({"status": "ERR", "msg": "controller stopping"})
            return
        try:
            msg = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            return
        if not isinstance(msg, dict):
            self.send_json({"status": "ERR", "msg": "JSON object required"})
            return
        cmd = msg.get("cmd", "")

        if cmd == "PING":
            self.send_json({"status": "PONG"})
            self.send_json(self.controller.light_snapshot())

        elif cmd == "COUNT":
            try:
                v = max(0, min(100000, int(msg.get("vertical", 0))))
                h = max(0, min(100000, int(msg.get("horizontal", 0))))
            except (TypeError, ValueError):
                self.send_json({"status": "ERR", "msg": "invalid count"})
                return
            self.controller.set_count(v, h)
            logger.info("[COUNT] doc=%s ngang=%s", v, h)
            self.send_json({"status": "OK", "vertical": v, "horizontal": h})

        elif cmd == "DEMO_RED":
            try:
                seconds = self.controller.hold_all_red(msg.get("seconds", 15))
            except (TypeError, ValueError):
                self.send_json({"status": "ERR", "msg": "invalid demo-red seconds"})
                return
            logger.warning("[DEMO] Giữ cả hai hướng đỏ trong %ss", seconds)
            self.send_json({"status": "OK", "demo_red": seconds})
            self.send_json(self.controller.light_snapshot())

        elif cmd == "VIOLATION":
            n = self.controller.register_violation()
            plate = msg.get("plate", "")
            logger.info("[VI PHAM] #%d bien=%s", n, plate)
            self.send_json({"status": "OK", "violations": n})

        elif cmd == "STATS":
            snap = self.controller.light_snapshot()
            self.send_json({"status": "OK", "violations": self.controller.violation_count,
                             "vertical": snap["vertical"], "horizontal": snap["horizontal"]})

        else:
            self.send_json({"status": "ERR", "msg": "unknown cmd"})

    def stop(self):
        self._running = False
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except (OSError, socket.error):
            pass


def phase_ticker(controller: TrafficController, server_state: dict,
                 stop_event: threading.Event, error_state: dict):
    """Tick the controller and request a service restart on a fatal GPIO error."""
    try:
        while not stop_event.is_set():
            changed = controller.tick()
            if changed:
                handler = server_state.get("active_handler")
                if handler is not None:
                    handler.send_json(controller.light_snapshot())
            stop_event.wait(0.2)
    except Exception as exc:
        error_state["exception"] = exc
        logger.exception("Fatal error in traffic phase ticker")
        stop_event.set()


def run_server(port, use_7seg):
    stop_event = threading.Event()
    shutdown_requested = threading.Event()
    error_state = {"exception": None}
    server_state = {"active_handler": None, "stopping": False}
    controller = None
    ticker = None
    srv = None

    def request_shutdown(signum, _frame):
        logger.info("Received signal %s; entering safe shutdown", signum)
        shutdown_requested.set()
        stop_event.set()

    old_handlers = {}
    for signum in (signal.SIGINT, signal.SIGTERM):
        old_handlers[signum] = signal.getsignal(signum)
        signal.signal(signum, request_shutdown)
    try:
        controller = TrafficController(use_7seg=use_7seg)
        ticker = threading.Thread(target=phase_ticker,
                                  args=(controller, server_state, stop_event, error_state),
                                  daemon=True)
        ticker.start()

        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.settimeout(0.5)
        srv.bind(("0.0.0.0", port))
        srv.listen(5)
        logger.info("[NET] TCP server tại 0.0.0.0:%d (GPIO %s)", port,
                    "THẬT" if GPIO_REAL else "STUB - chưa có Jetson.GPIO")

        while not shutdown_requested.is_set() and not stop_event.is_set():
            try:
                sock, addr = srv.accept()
            except socket.timeout:
                continue
            ClientHandler(sock, addr, controller, server_state).start()

        if error_state["exception"] is not None:
            raise RuntimeError("Traffic phase ticker stopped") from error_state["exception"]
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt; entering safe shutdown")
    finally:
        server_state["stopping"] = True
        stop_event.set()
        handler = server_state.get("active_handler")
        if handler is not None:
            handler.stop()
        if srv is not None:
            try:
                srv.close()
            except OSError:
                pass
        if ticker is not None:
            ticker.join(timeout=2.0)
        if controller is not None:
            controller.cleanup()
        for signum, old_handler in old_handlers.items():
            signal.signal(signum, old_handler)


def main():
    ap = argparse.ArgumentParser(description="Bộ điều khiển đèn giao thông chạy trên Jetson Nano GPIO")
    ap.add_argument("--port", type=int, default=8080, help="Port TCP (mặc định 8080)")
    ap.add_argument("--no-7seg", action="store_true", help="Tắt LED 7 đoạn 74HC595")
    args = ap.parse_args()
    run_server(args.port, use_7seg=not args.no_7seg)


if __name__ == "__main__":
    main()
