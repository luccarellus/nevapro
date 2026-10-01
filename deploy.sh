#!/usr/bin/env bash
# =============================================================================
# Neva Pro — Automação de Deploy e Operação na VPS
#
# Uso: ./deploy.sh <comando>
#
# Comandos:
#   setup    — primeira configuração: cria .env (se não existir) e valida o ambiente
#   ssl      — emite o certificado Let's Encrypt (primeira vez) via Certbot
#   up       — build e sobe todos os serviços (docker compose up -d --build)
#   update   — git pull + up (deploy de uma nova versão)
#   down     — para todos os serviços
#   restart  — reinicia os serviços
#   status   — status dos containers
#   logs     — logs da API (Ctrl+C para sair). Uso: ./deploy.sh logs [serviço]
#   backup   — backup manual do banco para o Backblaze B2
#   health   — verifica o endpoint /api/health
#   renew    — renovação manual do certificado SSL (renovar também via crontab do host)
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

DOMAIN=""             # extraído do nginx/conf.d/default.conf
COMPOSE="docker compose"
NGINX_CONF_DIR="nginx/conf.d"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

# --- Cores -------------------------------------------------------------------
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

# --- Helpers -----------------------------------------------------------------
detect_domain() {
  DOMAIN=$(grep -oE 'server_name\s+[^;]+' "$NGINX_CONF_DIR/default.conf" 2>/dev/null | head -n1 | awk '{print $2}' || true)
  if [[ -z "$DOMAIN" || "$DOMAIN" == "seu-dominio.com" ]]; then
    error 'Domínio não configurado. Edite nginx/conf.d/default.conf e substitua "seu-dominio.com" pelo seu domínio real.'
    exit 1
  fi
}

require_env() {
  if [[ ! -f .env ]]; then
    error ".env não encontrado. Rode primeiro: ./deploy.sh setup"
    exit 1
  fi
}

check_env_vars() {
  local missing=()
  for var in DATABASE_URL JWT_SECRET REDIS_PASSWORD CRON_SECRET; do
    if ! grep -qE "^${var}=." .env 2>/dev/null; then
      missing+=("$var")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Variáveis obrigatórias ausentes ou vazias no .env: ${missing[*]}"
    error "Preencha o .env antes de subir o stack (veja .env.example)."
    exit 1
  fi
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    error "Docker não encontrado. Instale em: https://docs.docker.com/engine/install/"
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    error "Docker Compose v2 não encontrado. Instale o plugin 'docker-compose-plugin'."
    exit 1
  fi
}

# --- Comandos ----------------------------------------------------------------

cmd_setup() {
  check_docker

  if [[ ! -f .env ]]; then
    cp .env.example .env
    warn ".env criado a partir do .env.example."
    warn "ABRA E PREENCHA: nano .env — obrigatórios: DATABASE_URL, JWT_SECRET, REDIS_PASSWORD, CRON_SECRET."
    warn "Gere segredos com: openssl rand -base64 32"
  else
    info ".env já existe — mantido."
  fi

  if grep -q 'seu-dominio.com' "$NGINX_CONF_DIR/default.conf" 2>/dev/null; then
    warn 'nginx/conf.d/default.conf ainda usa "seu-dominio.com".'
    read -r -p "Digitar o domínio agora? [s/N] " resp
    if [[ "${resp,,}" == "s" || "${resp,,}" == "sim" ]]; then
      read -r -p "Domínio (ex.: nevapro.com.br): " domain
      [[ -z "$domain" ]] && { error "Domínio vazio."; exit 1; }
      sed -i "s/seu-dominio\.com/${domain//./\\.}/g" "$NGINX_CONF_DIR/default.conf"
      info "default.conf atualizado com $domain"
    fi
  else
    detect_domain
    info "Nginx configurado para o domínio: $DOMAIN"
  fi

  info "Setup concluído. Próximos passos:"
  info "  1. ./deploy.sh ssl     (emite o certificado — requer domínio apontando para esta VPS)"
  info "  2. ./deploy.sh up      (build e sobe todo o stack)"
  info "  3. ./deploy.sh health  (confere /api/health)"
}

cmd_ssl() {
  check_docker
  detect_domain
  require_env

  # A emissão inicial usa uma config mínima (só HTTP + ACME), pois o bloco 443
  # do default.conf falha sem os certificados.
  warn "Ligando config de bootstrap (só HTTP) para a emissão do certificado..."
  mv "$NGINX_CONF_DIR/default.conf" "$NGINX_CONF_DIR/default.conf.disabled"
  cat > "$NGINX_CONF_DIR/bootstrap.conf" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF

  restore_conf() {
    rm -f "$NGINX_CONF_DIR/bootstrap.conf"
    [[ -f "$NGINX_CONF_DIR/default.conf.disabled" ]] && mv "$NGINX_CONF_DIR/default.conf.disabled" "$NGINX_CONF_DIR/default.conf"
  }
  trap restore_conf EXIT

  info "Subindo nginx..."
  $COMPOSE up -d nginx

  [[ -z "$CERTBOT_EMAIL" ]] && read -r -p "E-mail para o Let's Encrypt: " CERTBOT_EMAIL
  info "Emitindo certificado para $DOMAIN (pode levar alguns minutos)..."
  $COMPOSE run --rm certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email

  trap - EXIT
  restore_conf

  $COMPOSE up -d nginx || true
  $COMPOSE exec nginx nginx -s reload || true

  info "Certificado emitido. Verifique com: $COMPOSE run --rm certbot certificates"
  warn "Agende a renovação automática no crontab do HOST (veja PRODUCTION.md §3)."
}

cmd_renew() {
  check_docker
  $COMPOSE run --rm certbot renew --webroot -w /var/www/certbot
  $COMPOSE exec nginx nginx -s reload
  info "Renovação concluída e nginx recarregado."
}

cmd_up() {
  check_docker
  require_env
  check_env_vars
  info "Build e subida de todos os serviços..."
  $COMPOSE up -d --build
  $COMPOSE ps
  info "Concluído. Logs: ./deploy.sh logs"
}

cmd_update() {
  check_docker
  require_env
  info "Atualizando código (git pull)..."
  git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
  cmd_up
}

cmd_down()    { check_docker; $COMPOSE down; }
cmd_restart() { check_docker; $COMPOSE restart; }
cmd_status()  { check_docker; $COMPOSE ps; }

cmd_logs() {
  check_docker
  $COMPOSE logs -f --tail=200 "${1:-api}"
}

cmd_backup() {
  check_docker
  require_env
  info "Executando backup do banco via container api (tsx está disponível nela)..."
  $COMPOSE exec -e NODE_ENV=production api npx tsx server/scripts/runBackup.ts
}

cmd_health() {
  info "Consultando /api/health no container api..."
  $COMPOSE exec api node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status, await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
}

# --- Main --------------------------------------------------------------------
COMMAND="${1:-}"
case "$COMMAND" in
  setup)   cmd_setup ;;
  ssl)     cmd_ssl ;;
  renew)   cmd_renew ;;
  up)      cmd_up ;;
  update)  cmd_update ;;
  down)    cmd_down ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    shift; cmd_logs "$@" ;;
  backup)  cmd_backup ;;
  health)  cmd_health ;;
  ""|-h|--help|help)
    grep -E '^#   [a-z]' "$0" | sed 's/^#   //'
    ;;
  *)
    error "Comando desconhecido: $COMMAND"
    grep -E '^#   [a-z]' "$0" | sed 's/^#   //' >&2
    exit 1
    ;;
esac
