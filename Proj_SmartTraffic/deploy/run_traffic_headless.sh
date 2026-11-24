#!/usr/bin/env bash
# Chay TRAFFIC detection KHONG MAN HINH (headless) trong Docker tren Jetson Nano.
# Dung cho che do chay doc lap (systemd auto-start khi boot).
# Tham so main.py truyen qua bien MAIN_ARGS hoac doi so dong lenh.
set -e

PROJECT_DIR=/mnt/jetson_sd/traffic_project
IMAGE=ultralytics/ultralytics:latest-jetson-jetpack4

# Gom tat ca camera dang co (neu chua cam thi rong)
CAM_ARGS=""
for d in /dev/video*; do
  [ -e "$d" ] && CAM_ARGS="$CAM_ARGS --device $d"
done

# --no-display: khong mo cua so GUI (boot khong co man hinh se khong crash)
exec docker run --rm \
  --runtime nvidia \
  --network host \
  $CAM_ARGS \
  -v "$PROJECT_DIR":/work \
  -w /work \
  "$IMAGE" \
  python3 main.py --no-display ${MAIN_ARGS:-} "$@"
