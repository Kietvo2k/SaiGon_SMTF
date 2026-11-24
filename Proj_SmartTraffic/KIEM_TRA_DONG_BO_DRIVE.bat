@echo off
setlocal
cd /d "%~dp0"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"

echo ==========================================================
echo   GOOGLE DRIVE EVIDENCE QUEUE STATUS
echo   complete/uploaded = finished
echo   queued/retry/uploading = safely waiting; local files stay
echo ==========================================================
"%PY%" evidence_auto_sync.py --config "%~dp0config\evidence_sync.json" status
echo.
pause
