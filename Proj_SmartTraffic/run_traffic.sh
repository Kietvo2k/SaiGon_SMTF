#!/usr/bin/env bash
# Chay du an TRAFFIC trong Docker tren Jetson Nano (dung image ultralytics co san).
# Chay TREN Nano: bash run_traffic.sh [tham so main.py ...]
# Vi du:
#   bash run_traffic.sh --camera-v 0 --force-red
#   bash run_traffic.sh --camera-v 0 --jetson 127.0.0.1
set -e

PROJECT_DIR=/mnt/jetson_sd/traffic_project
IMAGE=ultralytics/ultralytics:latest-jetson-jetpack4

# Cho phep container mo cua so GUI tren desktop Nano
xhost +local:docker >/dev/null 2>&1 || true

# Map tat ca camera dang co (neu co)
CAM_ARGS=""
for d in /dev/video*; do
  [ -e "$d" ] && CAM_ARGS="$CAM_ARGS --device $d"
done

docker run --rm -it \
  --runtime nvidia \
  --network host \
  $CAM_ARGS \
  -e DISPLAY="$DISPLAY" \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v "$PROJECT_DIR":/work \
  -w /work \
  "$IMAGE" \
  python3 main.py "$@"
