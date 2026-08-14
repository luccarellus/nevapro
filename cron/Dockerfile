# Container de cron jobs — substitui o Vercel Cron na VPS.
# Dispara /api/cron/cleanup e /api/cron/backup via HTTP contra o container api.
FROM alpine:3.20

RUN apk add --no-cache curl

COPY crontab /etc/crontabs/root
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY run-cron.sh /usr/local/bin/run-cron.sh

RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run-cron.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
