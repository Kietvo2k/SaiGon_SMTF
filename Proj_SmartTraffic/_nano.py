"""Helper chạy lệnh trên Jetson Nano qua SSH. Dùng: python _nano.py "lệnh"
Chỉ dùng để làm việc với dự án traffic. TUYỆT ĐỐI không đụng file YOLOv11 xử lý lửa.
"""
import sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST, USER, PW = "192.168.16.210", "nvidia", "nvidia"

def run(cmd, timeout=120):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=15,
              allow_agent=False, look_for_keys=False)
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "replace")
    e = err.read().decode("utf-8", "replace")
    c.close()
    return o, e

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "echo no-cmd"
    o, e = run(cmd)
    if o:
        print(o, end="")
    if e:
        print("[stderr]", e, end="")
