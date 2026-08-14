#!/bin/sh
# O crond do BusyBox não lê /etc/environment nem /etc/profile.
# Gravamos as variáveis necessárias em /etc/cron.env, que o run-cron.sh carrega.
: > /etc/cron.env
env | grep -E '^(API_URL|CRON_SECRET)=' >> /etc/cron.env

exec crond -f -l 2
