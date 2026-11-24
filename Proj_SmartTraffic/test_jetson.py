"""
test_jetson.py – Kiểm tra kết nối TCP với Jetson Nano GPIO (bộ điều khiển đèn)

Gửi thử PING / COUNT / VIOLATION / STATS, rồi lắng nghe trạng thái đèn (LIGHT)
mà Jetson Nano chủ động đẩy về khi đổi pha.

Cách dùng:
  python test_jetson.py --host 192.168.16.210
  python test_jetson.py --host 192.168.16.210 --violation 51A12345
"""

import sys
import socket
import json
import time
import argparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _legacy_send_cmd(sock, cmd_dict):
    msg = json.dumps(cmd_dict) + "\n"
    sock.sendall(msg.encode("utf-8"))
    print(f"  → Gửi: {msg.strip()}")

    sock.settimeout(5.0)
    try:
        resp = b""
        while b"\n" not in resp:
            chunk = sock.recv(256)
            if not chunk:
                break
            resp += chunk
        print(f"  ← Nhận: {resp.decode('utf-8', errors='replace').strip()}")
    except socket.timeout:
        print("  ← (timeout – không nhận phản hồi)")


class JsonLineReader:
    """Preserve TCP line boundaries while asynchronous LIGHT messages arrive."""

    def __init__(self, sock):
        self.sock = sock
        self.buf = b""

    def read_line(self, timeout):
        deadline = time.monotonic() + timeout
        while True:
            if b"\n" in self.buf:
                line, self.buf = self.buf.split(b"\n", 1)
                return line.decode("utf-8", errors="replace").strip()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            self.sock.settimeout(remaining)
            try:
                chunk = self.sock.recv(256)
            except socket.timeout:
                return None
            if not chunk:
                return None
            self.buf += chunk


def _matches_response(msg, command):
    status = msg.get("status")
    if command == "PING":
        return status == "PONG"
    if command == "COUNT":
        return status == "OK" and "vertical" in msg and "horizontal" in msg
    if command in ("STATS", "VIOLATION"):
        return status == "OK" and "violations" in msg
    return False


def send_cmd(sock, reader, cmd_dict):
    msg = json.dumps(cmd_dict) + "\n"
    sock.sendall(msg.encode("utf-8"))
    print(f"  → Gửi: {msg.strip()}")

    command = cmd_dict.get("cmd", "")
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        line = reader.read_line(max(0.01, deadline - time.monotonic()))
        if line is None:
            break
        try:
            response = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue
        if response.get("status") == "LIGHT":
            print(f"  ← ĐÈN: {line}")
            continue
        if _matches_response(response, command):
            print(f"  ← Nhận: {line}")
            return
    print("  ← (timeout – không nhận phản hồi phù hợp)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="192.168.16.210")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--violation", default=None, help="Biển số để gửi test vi phạm")
    args = ap.parse_args()

    print(f"Kết nối tới Jetson GPIO: {args.host}:{args.port}")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10.0)
        sock.connect((args.host, args.port))
        reader = JsonLineReader(sock)
        print("✓ Kết nối thành công!\n")

        # PING (Jetson trả PONG + đẩy LIGHT hiện tại)
        print("1. Gửi PING:")
        send_cmd(sock, reader, {"cmd": "PING"})
        time.sleep(0.5)

        # COUNT – gửi số xe để Jetson chỉnh thời gian đèn thích ứng
        print("\n2. Gửi COUNT (dọc nhiều xe hơn ngang):")
        send_cmd(sock, reader, {"cmd": "COUNT", "vertical": 8, "horizontal": 2})
        time.sleep(1)

        print("\n3. Gửi COUNT (cân bằng):")
        send_cmd(sock, reader, {"cmd": "COUNT", "vertical": 5, "horizontal": 5})
        time.sleep(1)

        # VI PHẠM (Jetson kích còi + relay)
        if args.violation:
            print(f"\n4. Gửi vi phạm: {args.violation}")
            send_cmd(sock, reader, {
                "cmd": "VIOLATION",
                "plate": args.violation,
                "type": "car",
                "ts": time.strftime("%Y%m%d_%H%M%S")
            })
            time.sleep(1)

        # STATS
        print("\n5. Yêu cầu thống kê:")
        send_cmd(sock, reader, {"cmd": "STATS"})

        # Lắng nghe trạng thái đèn Jetson đẩy về trong 12s (thấy đèn đổi pha)
        print("\n6. Lắng nghe LIGHT từ Jetson Nano (12s)...")
        try:
            t_end = time.time() + 12
            while time.time() < t_end:
                s = reader.read_line(t_end - time.time())
                if s is None:
                    break
                if '"LIGHT"' in s:
                    print(f"  ← ĐÈN: {s}")
        except socket.timeout:
            pass

        sock.close()
        print("\n✓ Test hoàn tất!")

    except (socket.error, ConnectionRefusedError) as e:
        print(f"\n❌ Kết nối thất bại: {e}")
        print("   Kiểm tra:")
        print("   1. Jetson Nano đã cấp nguồn và dịch vụ GPIO đã chạy chưa?")
        print(f"   2. Cáp Ethernet đã cắm chưa?")
        print(f"   3. IP Jetson Nano có phải {args.host} không?")
        print("   4. Laptop và Jetson Nano cùng mạng LAN không?")
        print(f"      PC IP: chạy 'ipconfig' để xem")


if __name__ == "__main__":
    main()
