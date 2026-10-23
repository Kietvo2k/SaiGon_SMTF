@echo off
cd /d "%~dp0"
docker compose build backend
if errorlevel 1 exit /b %errorlevel%
docker compose build web
if errorlevel 1 exit /b %errorlevel%
docker compose up -d --wait
if errorlevel 1 exit /b %errorlevel%
echo Smart Traffic: http://127.0.0.1:8088/
