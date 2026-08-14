#!/bin/sh
set -e

[ -f /etc/cron.env ] && . /etc/cron.env

API_URL="${API_URL:-http://api:3000}"
CRON_SECRET="${CRON_SECRET:-}"
JOB="${1:-}"

if [ -z "$JOB" ]; then
  echo "[cron] Uso: run-cron.sh <cleanup|backup>" >> /var/log/cron.log
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "[cron] CRON_SECRET não definido — job $JOB ignorado" >> /var/log/cron.log
  exit 0
fi

echo "[cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) — disparando job: $JOB" >> /var/log/cron.log

curl -fsS -X POST "${API_URL}/api/cron/${JOB}" \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  >> /var/log/cron.log 2>&1 || {
    echo "[cron] Falha no job $JOB às $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /var/log/cron.log
  }
