FROM python:3.11-slim@sha256:cce12316475d7d56d605f76e1d811d0dc4e7227f2d4afd29951521264f504ff8
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SMART_VAR_DIR=/app/var PYTHONPATH=/app/backend
WORKDIR /app/backend
COPY docker/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock
COPY outputs/smart-traffic/backend/app ./app
COPY outputs/smart-traffic/web/public/north-roads-32.json /app/web/public/north-roads-32.json
COPY docker/backend-entrypoint.py /app/backend-entrypoint.py
CMD ["python", "/app/backend-entrypoint.py"]
