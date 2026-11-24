#!/usr/bin/env bash
# ==========================================================
#  MENU DIEU KHIEN DU AN GIAO THONG DA NANG
#  Chay tren Jetson: bam 1 con so + Enter, khong can nho lenh.
# ==========================================================
export DISPLAY=:0
PROJ=/mnt/jetson_sd/traffic_project
IMG=ultralytics/ultralytics:latest-jetson-jetpack4
JETSON=127.0.0.1
cd "$PROJ" 2>/dev/null

run_detect() {  # $1 = extra args (vd --no-display)
  xhost +local:docker >/dev/null 2>&1 || true
  docker kill $(docker ps -q) 2>/dev/null
  CAM=""
  for d in /dev/video*; do [ -e "$d" ] && CAM="$CAM --device $d"; done
  docker run --rm -it --runtime nvidia --network host $CAM \
    -e DISPLAY="$DISPLAY" -v /tmp/.X11-unix:/tmp/.X11-unix \
    -v "$PROJ":/work -w /work "$IMG" \
    python3 -u main.py --camera-v 0 --jetson "$JETSON" $1
}

while true; do
  clear
  echo "=========================================================="
  echo "     DU AN GIAM SAT GIAO THONG DA NANG  -  MENU"
  echo "=========================================================="
  echo "  1) Chay NHAN DIEN (co cua so video)   <-- dung khi DEMO"
  echo "  2) Chay NHAN DIEN (nen, khong video)"
  echo "  3) DUNG nhan dien"
  echo "  4) Mo DASHBOARD toan man hinh"
  echo "  5) Kiem tra WEB dashboard"
  echo "  6) Khoi dong lai WEB"
  echo "  7) Kiem tra ket noi JETSON GPIO (ping + bat tay)"
  echo "  8) Xem cac card mang (eth0 / wlan0)"
  echo "  0) Thoat menu"
  echo "=========================================================="
  read -p "  Nhap so roi Enter: " c
  echo ""
  case "$c" in
    1) echo ">> Dang chay nhan dien (nhan 'q' tren cua so video de dung)..."
       run_detect "" ;;
    2) echo ">> Chay nhan dien nen..."
       run_detect "--no-display" &
       echo "Da chay nen. Xem dashboard de thay du lieu."; sleep 2 ;;
    3) docker kill $(docker ps -q) 2>/dev/null; echo ">> Da dung nhan dien."; sleep 2 ;;
    4) chromium-browser --start-fullscreen --app=http://localhost:8090 >/dev/null 2>&1 &
       echo ">> Da mo dashboard."; sleep 2 ;;
    5) systemctl is-active traffic-web && curl -s -o /dev/null -w "Web HTTP %{http_code}\n" http://localhost:8090/
       read -p "Enter de tiep tuc..." ;;
    6) echo nvidia | sudo -S systemctl restart traffic-web 2>/dev/null; echo ">> Da khoi dong lai web."; sleep 2 ;;
    7) echo ">> Ping Jetson GPIO $JETSON..."
       ping -c 3 -W 2 "$JETSON"
       echo ">> Thu bat tay TCP 8080..."
       python3 -c "
import socket
s=socket.socket(); s.settimeout(4)
try:
    s.connect(('$JETSON',8080)); s.sendall(b'{\"cmd\":\"PING\"}\n')
    import time; time.sleep(1)
    print('JETSON TRA LOI:', s.recv(256).decode('utf-8','replace').strip())
except Exception as e: print('LOI:', e)
finally: s.close()
"
       read -p "Enter de tiep tuc..." ;;
    8) echo "--- eth0 (day -> laptop / mang noi bo) ---"; ip -o -4 addr show eth0 2>/dev/null | awk '{print $4}'
       echo "--- wlan0 (TP-Link -> A50, internet) ---"; ip -o -4 addr show wlan0 2>/dev/null | awk '{print $4}'
       read -p "Enter de tiep tuc..." ;;
    0) echo "Thoat."; break ;;
    *) echo "So khong hop le, thu lai."; sleep 1 ;;
  esac
done
