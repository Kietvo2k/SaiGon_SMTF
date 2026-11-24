@echo off
setlocal
REM ==========================================================
REM  RED-LIGHT DETECTOR CHECK - NO JETSON GPIO OUTPUT
REM  The CC-BY scene is for traffic-flow/Jetson; its distant plates are
REM  intentionally expected to be unreadable, not a final OCR demo.
REM ==========================================================
cd /d "%~dp0"

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
set "VIDEO=%~dp0demo_videos\violation_redlight_15s_ccby4.mp4"

if not exist "%VIDEO%" (
    echo ERROR: Missing demo video: "%VIDEO%"
    pause
    exit /b 1
)

echo ==========================================================
echo   RED-LIGHT DETECTOR CHECK (NOT FINAL OCR EVIDENCE)
echo   No Jetson, relay, buzzer, or Telegram is used.
echo   Dashboard: http://localhost:8090
echo   Output: logs\ccby_redlight_ocr.xlsx and violations\
echo ==========================================================

start "Traffic Web" /min "%PY%" web\server.py --port 8090
timeout /t 2 /nobreak >nul
start "" http://localhost:8090

REM This CC-BY scene remains useful to test the red-light/stop-line logic.
REM For the clear-plate OCR demo, run CHAY_MO_PHONG_TOC_DO_OCR.bat instead.
REM OCR records UNREADABLE when the distant plate lacks enough pixels.
"%PY%" -u main.py --camera-v "%VIDEO%" --no-video-loop --no-display --offline --force-red --evidence-only --imgsz 320 --torch-threads 2 --conf 0.35 --video-fps 15 --video-stride 7 --stop-line-v 418 --count-line-v 418 --direction up --violation-confirm-frames 2 --plate-min-confidence 0.85 --max-runtime 180 --fresh-xlsx --xlsx logs\ccby_redlight_ocr.xlsx

echo.
echo Demo finished. Open http://localhost:8090 to review the evidence.
pause
