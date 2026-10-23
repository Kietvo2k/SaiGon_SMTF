#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
docker compose build backend
docker compose build web
docker compose up -d --wait
printf '%s\n' 'Smart Traffic: http://127.0.0.1:8088/'
