# =============================================================================
# Neva Pro — Atalhos de operação na VPS (requer GNU make)
#
#   make help     — lista todos os comandos
#   make setup    — primeira configuração (.env + domínio)
#   make ssl      — emite o certificado Let's Encrypt
#   make up       — build e sobe todo o stack
#   make update   — git pull + rebuild + restart
#   make logs     — logs da API em tempo real
#   make status   — status dos containers
#   make backup   — backup manual do banco (Backblaze B2)
#   make health   — checa /api/health
#   make test     — roda a suíte de testes (vitest)
# =============================================================================

SHELL := /bin/bash

.PHONY: help setup ssl renew up update down restart status logs backup health test

help:
	@./deploy.sh help

setup:
	@./deploy.sh setup

ssl:
	@./deploy.sh ssl

renew:
	@./deploy.sh renew

up:
	@./deploy.sh up

update:
	@./deploy.sh update

down:
	@./deploy.sh down

restart:
	@./deploy.sh restart

status:
	@./deploy.sh status

logs:
	@./deploy.sh logs

backup:
	@./deploy.sh backup

health:
	@./deploy.sh health

test:
	@npx vitest run
