#!/usr/bin/env bash
# T14a: bật cả hệ smart-traffic bằng một lệnh (Git Bash trên Windows):
#   (a) server tĩnh outputs/hcmc-poc/serve.py (cổng 8821) cho trang 3D
#   (b) backend FastAPI (cổng 8900): tạo .venv + pip install nếu thiếu, init DB, seed, chạy uvicorn
#   (c) web build (cổng 5173): npm ci nếu thiếu node_modules, npm run build, vite preview
# Dùng: bash outputs/smart-traffic/run-smart.sh            (bật)
#       bash outputs/smart-traffic/run-smart.sh --stop     (tắt cả cây tiến trình đã bật)
# PID file var/run-smart.pids: mỗi dòng "<winpid> <tên>". --stop dùng taskkill //T //F có timeout, không đọc stdin.
set -u
export PYTHONDONTWRITEBYTECODE=1   # không sinh __pycache__ (QA vệ sinh yêu cầu sạch)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMART="$ROOT/outputs/smart-traffic"
BACKEND="$SMART/backend"
WEB="$SMART/web"
VAR_DIR="$SMART/var"
PIDFILE="$VAR_DIR/run-smart.pids"
STATIC_PORT=8821
API_PORT=8900
WEB_PORT=5173
GIOI_HAN=20   # giây tối đa cho mỗi lệnh tasklist/taskkill

# GNU timeout của Git Bash; không dùng timeout.exe của Windows (cú pháp khác).
co_timeout() { if timeout --version >/dev/null 2>&1; then timeout "$GIOI_HAN" "$@"; else "$@"; fi; }

port_mo() { python -c "import socket,sys; s=socket.socket(); s.settimeout(1); sys.exit(0 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 1)" "$1"; }

# Chạy nền một lệnh, ghi winpid (PID Windows, để taskkill //T diệt cả cây) vào PID file.
chay_nen() {  # $1 = tên, $2... = lệnh
  local ten="$1" jpid wpid
  shift
  "$@" </dev/null >"$VAR_DIR/run-smart-$ten.log" 2>&1 &
  jpid=$!
  sleep 1   # chờ fork/exec xong để /proc/<pid>/winpid trỏ đúng tiến trình Windows
  wpid="$(cat "/proc/$jpid/winpid" 2>/dev/null || true)"
  if [ -z "$wpid" ]; then echo "run-smart: cảnh báo không lấy được winpid của $ten (msys PID $jpid)" >&2; wpid="$jpid"; fi
  echo "$wpid $ten" >> "$PIDFILE"
  echo "run-smart: đã bật $ten (PID $wpid)"
}

tat_ca() {
  if [ ! -f "$PIDFILE" ]; then echo "run-smart: không có $PIDFILE, không có gì để tắt."; return 0; fi
  local wpid ten img
  while read -r wpid ten; do
    [ -n "${wpid:-}" ] || continue
    img="$(co_timeout tasklist //FI "PID eq $wpid" //FO CSV //NH </dev/null 2>/dev/null | grep -m1 '^"' | cut -d, -f1 | tr -d '"')"
    case "$img" in
      python.exe|node.exe)
        if co_timeout taskkill //PID "$wpid" //T //F </dev/null >/dev/null 2>&1; then
          echo "run-smart: đã tắt $ten (PID $wpid và cây tiến trình con)"
        else
          echo "run-smart: không tắt được $ten (PID $wpid)" >&2
        fi ;;
      "") echo "run-smart: $ten (PID $wpid) đã dừng trước đó" ;;
      *)  echo "run-smart: bỏ qua PID $wpid ($img), không phải tiến trình của run-smart" >&2 ;;
    esac
  done < "$PIDFILE"
  rm -f "$PIDFILE"
  echo "run-smart: đã tắt xong."
}

if [ "${1:-}" = "--stop" ]; then tat_ca; exit 0; fi

# Kiểm cổng TRƯỚC khi ghi lại PID file, để không mất dấu vết tiến trình cũ.
for cong_mo_ta in "$STATIC_PORT:server tĩnh 3D" "$API_PORT:backend API" "$WEB_PORT:web build"; do
  cong="${cong_mo_ta%%:*}"; mo_ta="${cong_mo_ta#*:}"
  if port_mo "$cong"; then
    echo "run-smart LỖI: cổng $cong đang bận ($mo_ta). Chạy: bash $0 --stop trước." >&2
    exit 1
  fi
done

mkdir -p "$VAR_DIR"
: > "$PIDFILE"

echo "run-smart: (a) server tĩnh :$STATIC_PORT ..."
(export PORT="$STATIC_PORT"; chay_nen static python "$ROOT/outputs/hcmc-poc/serve.py") || exit 1

if [ -x "$BACKEND/.venv/Scripts/python.exe" ]; then VENV_PY="$BACKEND/.venv/Scripts/python.exe"
elif [ -x "$BACKEND/.venv/bin/python" ]; then VENV_PY="$BACKEND/.venv/bin/python"
else
  echo "run-smart: (b) tạo .venv backend ..."
  python -m venv "$BACKEND/.venv" || { echo "run-smart LỖI: không tạo được .venv" >&2; exit 1; }
  if [ -x "$BACKEND/.venv/Scripts/python.exe" ]; then VENV_PY="$BACKEND/.venv/Scripts/python.exe"; else VENV_PY="$BACKEND/.venv/bin/python"; fi
fi
if ! "$VENV_PY" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "run-smart: (b) pip install -r requirements.txt ..."
  "$VENV_PY" -m pip install -q -r "$BACKEND/requirements.txt" </dev/null || { echo "run-smart LỖI: pip install thất bại" >&2; exit 1; }
fi

echo "run-smart: (b) init DB + seed ..."
(cd "$BACKEND" && SMART_VAR_DIR="$VAR_DIR" "$VENV_PY" -c "from app.db import init_db, get_conn; c = get_conn(); init_db(c); c.close(); from app.seed.run_seed import run_seed; run_seed()" </dev/null) \
  || { echo "run-smart LỖI: init/seed DB thất bại" >&2; exit 1; }

echo "run-smart: (b) backend API :$API_PORT ..."
(cd "$BACKEND" && export SMART_VAR_DIR="$VAR_DIR" SMART_ALLOWED_ORIGINS="http://127.0.0.1:$STATIC_PORT,http://localhost:$STATIC_PORT,http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT" \
  && chay_nen api "$VENV_PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") || exit 1

if [ ! -d "$WEB/node_modules" ]; then
  echo "run-smart: (c) npm ci ..."
  (cd "$WEB" && npm ci </dev/null) || { echo "run-smart LỖI: npm ci thất bại" >&2; exit 1; }
fi
echo "run-smart: (c) npm run build ..."
(cd "$WEB" && npm run build </dev/null) || { echo "run-smart LỖI: npm run build thất bại" >&2; exit 1; }
echo "run-smart: (c) vite preview :$WEB_PORT ..."
(cd "$WEB" && chay_nen web node "$WEB/node_modules/vite/bin/vite.js" preview --port "$WEB_PORT" --host 127.0.0.1) || exit 1

echo "run-smart: chờ dịch vụ lên ..."
for cong in "$STATIC_PORT" "$API_PORT" "$WEB_PORT"; do
  ok=0
  for _ in $(seq 1 30); do if port_mo "$cong"; then ok=1; break; fi; sleep 1; done
  if [ "$ok" != 1 ]; then
    echo "run-smart LỖI: cổng $cong không lên sau 30s, xem log $VAR_DIR/run-smart-*.log (rồi chạy --stop)" >&2
    exit 1
  fi
done

echo ""
echo "run-smart OK:"
echo "  Trang 3D:       http://127.0.0.1:$STATIC_PORT/hcmc-poc/?app=smart&api=http://127.0.0.1:$API_PORT"
echo "  Web công an:    http://127.0.0.1:$WEB_PORT/index-officer.html"
echo "  Web người dân:  http://127.0.0.1:$WEB_PORT/index-citizen.html"
echo "  Tắt:            bash outputs/smart-traffic/run-smart.sh --stop"
