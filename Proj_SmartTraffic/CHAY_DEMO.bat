@echo off
REM ==========================================================
REM  CHAY DEMO GIAO THONG DA NANG tren LAPTOP
REM  - Web dashboard + nhan dien camera + bat tay Jetson Nano
REM  Double-click file nay la chay. Dong cua so de dung.
REM ==========================================================
cd /d "%~dp0"

echo ==========================================================
echo   DEMO GIAO THONG DA NANG - dang khoi dong...
echo   Dashboard se mo tai: http://localhost:8090
echo   Nhan Ctrl+C 2 lan de dung.
echo ==========================================================

REM 0) Refuse to start the full demo until the Jetson controller is online.
powershell -NoProfile -Command "if (-not (Test-NetConnection 192.168.16.210 -Port 8080 -InformationLevel Quiet)) { exit 1 }"
if errorlevel 1 (
    echo ERROR: Jetson controller 192.168.16.210:8080 is offline.
    echo Start it first: sudo systemctl start jetson-traffic-gpio.service
    pause
    exit /b 1
)

REM 1) Web dashboard chay nen
REM Full hardware demo permits the trusted Jetson/LAN to view the dashboard.
start "Traffic Web" /min python web/server.py --host 0.0.0.0 --port 8090

REM 2) Cho web san sang roi mo trinh duyet
timeout /t 3 /nobreak >nul
start "" http://localhost:8090

REM 3) Nhan dien 2 camera: doc = index 1 (Logitech), ngang = index 2 (USB2.0 PC CAMERA)
REM    (cam laptop la index 0, KHONG dung)
python main.py --camera-v 1 --camera-h 2 --no-display --jetson 192.168.16.210 --width 640 --height 480 --imgsz 480

pause
