#!/usr/bin/env bash
# Mo dashboard dang host tren laptop khi chay che do chia tach (toan man hinh).
# Jetson van la bo dieu khien GPIO chinh; che do all-in-one dung start_demo.sh.
export DISPLAY=:0

# IP cua laptop tren mang B-LINK (card TP-Link). Neu doi thi sua dong duoi.
LAPTOP_IP=192.168.16.50
URL="http://$LAPTOP_IP:8090"

echo "Dang mo dashboard: $URL"
echo "Neu trang trong: kiem tra laptop da chay CHAY_DEMO.bat chua,"
echo "va IP laptop co dung $LAPTOP_IP khong (chay 'ipconfig' tren laptop)."

# Cho web laptop san sang roi mo Chromium toan man hinh
for i in $(seq 1 10); do
  curl -s -o /dev/null --max-time 2 "$URL/" && break
  sleep 1
done

chromium-browser --start-fullscreen --app="$URL" >/dev/null 2>&1 &
