@echo off
setlocal
REM ==========================================================
REM  JETSON LED + 7-SEGMENT DEMO (COUNT ONLY)
REM  Run this ONLY after wiring and GPIO checks are complete.
REM ==========================================================
cd /d "%~dp0"

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
set "VIDEO=%~1"
if "%VIDEO%"=="" set "VIDEO=%~dp0demo_videos\jetson_redlight_15s_640x360_10fps_ccby4.mp4"

if not exist "%VIDEO%" (
    echo ERROR: Missing demo video: "%VIDEO%"
    pause
    exit /b 1
)

echo ==========================================================
echo   JETSON LED + 7-SEGMENT VIDEO DEMO
echo   Video: %VIDEO%
echo   This sends COUNT only. It never sends a violation alert.
echo   Stop immediately if a wired device behaves unexpectedly.
echo ==========================================================

REM The controller is intentionally not started here.  Start it manually on
REM Jetson after the hardware checklist has passed, then this check is read-only.
powershell -NoProfile -Command "if (-not (Test-NetConnection 192.168.16.210 -Port 8080 -InformationLevel Quiet)) { exit 1 }"
if errorlevel 1 (
    echo ERROR: Jetson controller 192.168.16.210:8080 is offline.
    echo On Jetson, after safe wiring: sudo systemctl start jetson-traffic-gpio.service
    pause
    exit /b 1
)

REM This hardware demo may be opened from Jetson on the private B-LINK LAN.
start "Traffic Web" /min "%PY%" web\server.py --host 0.0.0.0 --port 8090
timeout /t 2 /nobreak >nul
start "" http://localhost:8090

REM Light source: 640x360, 10 FPS.  The file loops until Ctrl+C.
REM --count-only protects relay/buzzer; Jetson still receives vehicle density
REM and drives traffic lamps / 7-segment displays using its own controller.
"%PY%" -u main.py --camera-v "%VIDEO%" --no-display --jetson 192.168.16.210 --width 640 --height 360 --imgsz 320 --torch-threads 2 --conf 0.35 --video-fps 10 --video-stride 5 --count-interval 3 --count-mode visible --count-only

pause
