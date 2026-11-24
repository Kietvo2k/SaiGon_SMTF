@echo off
setlocal
REM ==========================================================
REM  OFFLINE SPEED + OCR EVIDENCE DEMO (NO JETSON GPIO)
REM  Uses the preserved 4K source 2.mp4, never relay/buzzer.
REM ==========================================================
cd /d "%~dp0"

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
set "VIDEO=%~1"
if "%VIDEO%"=="" set "VIDEO=%~dp02.mp4"

if not exist "%VIDEO%" (
    echo ERROR: Missing video: "%VIDEO%"
    pause
    exit /b 1
)

echo ==========================================================
echo   SPEED + OCR DEMO - OFFLINE / HARDWARE SAFE
echo   Source: %VIDEO%
echo   This is SIMULATED_CALIBRATED_NEEDS_REVIEW.
echo   It never controls Jetson, LED, relay, buzzer or Telegram.
echo   Evidence is queued and auto-synced to Google Drive.
echo ==========================================================

start "Traffic Web" /min "%PY%" web\server.py --port 8090
timeout /t 2 /nobreak ^>nul
start "" http://localhost:8090

REM Lines/distances are presentation calibration for this exact 4K clip.
REM The output preserves raw AI OCR and requires human review of plate crop.
"%PY%" -u speed_demo.py --video "%VIDEO%" --start-sec 8 --event-after-sec 10 --end-sec 15 --line-a 1300 --line-b 1800 --distance-m 10 --limit-kmh 5 --direction down --stride 10 --inference-width 640 --imgsz 640 --max-events 1 --sync-config "%~dp0config\evidence_sync.json"

echo.
echo Check dashboard: http://localhost:8090
echo Check logs\violations_*_speed_demo.csv and violations\SPEED_DEMO files.
pause
