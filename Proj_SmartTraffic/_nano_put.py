"""Upload file(s) len Jetson Nano qua SFTP (chay voi MSYS_NO_PATHCONV=1 de tranh Git Bash doi path).
Dung: MSYS_NO_PATHCONV=1 python _nano_put.py <local1> [local2 ...] <remote_dir>
Chi phuc vu du an traffic. TUYET DOI khong dung file YOLOv11 xu ly lua.
"""
import sys, io, os, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST, USER, PW = "192.168.16.210", "nvidia", "nvidia"

def main():
    *locals_, remote_dir = sys.argv[1:]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=20,
              allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    for lp in locals_:
        name = os.path.basename(lp)
        rp = remote_dir.rstrip("/") + "/" + name
        sz = os.path.getsize(lp)
        state = {"last": 0}
        def cb(done, total, sz=sz, name=name, state=state):
            pct = int(done * 100 / total) if total else 0
            if pct >= state["last"] + 20 or done == total:
                state["last"] = pct
                print(f"  {name}: {pct}%")
        sftp.put(lp, rp, callback=cb)
        print("PUT", name, "->", rp, f"({sz} bytes)")
    sftp.close(); c.close()

if __name__ == "__main__":
    main()
