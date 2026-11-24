@echo off
setlocal
REM ==========================================================
REM  YOLO VEHICLE BOX DASHBOARD - OFFLINE / GPIO SAFE
REM  Draws xyxy boxes and car/motorcycle/bus/truck labels.
REM ==========================================================
cd /d "%~dp0"

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
set "VIDEO=%~1"
if "%VIDEO%"=="" set "VIDEO=%~dp0demo_videos\jetson_redlight_15s_640x360_10fps_ccby4.mp4"

if not exist "%VIDEO%" (
    echo ERROR: Missing video: "%VIDEO%"
    pause
    exit /b 1
)

echo ==========================================================
echo   AI YOLO BOX - HARDWARE SAFE
echo   Green boxes: car / motorcycle / bus / truck
echo   Jetson, GPIO, relay, buzzer and Telegram are disabled.
echo ==========================================================

start "Traffic Web" /min "%PY%" web\server.py --port 8090
timeout /t 2 /nobreak >nul
start "" http://localhost:8090

"%PY%" -u main.py --camera-v "%VIDEO%" --no-display --offline --count-only --evidence-only --count-mode visible --force-red --video-fps 10 --video-stride 1 --width 640 --height 360 --imgsz 320 --torch-threads 2 --conf 0.25 --frame-skip 1

pause
