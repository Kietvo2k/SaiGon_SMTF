#!/usr/bin/env bash
# Chay TOAN BO demo tren desktop Jetson: mo dashboard fullscreen + bat nhan dien.
# Duoc goi tu icon "Traffic Demo" tren Desktop.
export DISPLAY=:0
cd /home/nvidia/traffic_project

# 1) Mo dashboard tren trinh duyet toan man hinh (chay nen)
#    traffic-web service da chay san o port 8090; cho no san sang roi mo.
( for i in $(seq 1 15); do
    curl -s -o /dev/null http://localhost:8090/ && break
    sleep 1
  done
  chromium-browser --start-fullscreen --app=http://localhost:8090 >/dev/null 2>&1 &
) &

# 2) Bat nhan dien (main.py trong Docker) - cua so video hien ra, log ngay tren terminal
echo "=================================================="
echo "  DEMO GIAO THONG DA NANG - dang khoi dong..."
echo "  Dashboard: http://localhost:8090 (dang mo fullscreen)"
echo "  Nhan 'q' tren cua so video de dung nhan dien."
echo "=================================================="
bash run_traffic.sh --camera-v 0 --jetson 127.0.0.1

echo ""
echo "Da dung nhan dien. Nhan Enter de dong cua so nay."
read
