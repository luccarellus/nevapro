#!/usr/bin/env bash
# =============================================================================
# Neva Pro — Recriar as tabelas do Postgres a partir das migrations
#
# Apaga TODAS as tabelas do banco configurado no .env (via `migrate:fresh`)
# e recria o schema com as migrations de backend/database/migrations,
# aplicando o seed padrão (tenant NevaPro + roles).
#
# Uso:
#   ./recreate-tables.sh            # apaga, recria e aplica seed
#   ./recreate-tables.sh --no-seed  # apaga e recria sem seed
#
# Onde funciona:
#   - Docker Compose (VPS): executa `artisan` no container `api`
#   - EasyPanel (container standalone): rode DENTRO do terminal do container,
#     onde o script detecta o artisan em /var/www/html
#   - Local: usa php + backend/.env se disponível
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

SEED_FLAG="--seed"
if [[ "${1:-}" == "--no-seed" ]]; then
  SEED_FLAG=""
fi

# --- Cores (mesmo padrão do deploy.sh) ---------------------------------------
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[recreate]${NC} $*"; }
warn()  { echo -e "${YELLOW}[recreate]${NC} $*"; }
error() { echo -e "${RED}[recreate]${NC} $*" >&2; }

# --- Alvo: descobre onde roda o artisan --------------------------------------
ENV_FILE=""
ARTISAN=""
RUNNER=()

if [[ -f /var/www/html/artisan ]]; then
  # Dentro do container standalone (EasyPanel) ou do container api do Compose
  cd /var/www/html
  ARTISAN="artisan"
  ENV_FILE="/var/www/html/.env"
  RUNNER=(php)
elif command -v docker >/dev/null 2>&1 \
  && docker compose ps --status running --services 2>/dev/null | grep -qx 'api'; then
  # Stack Compose na VPS/local: o backend/.env aponta para o host Docker
  # (nevapro_neva-sql), então o artisan precisa rodar DENTRO do container.
  ENV_FILE=".env"
  ARTISAN="/var/www/html/artisan"
  RUNNER=(docker compose exec -T api php)
elif [[ -f backend/artisan ]] && command -v php >/dev/null 2>&1; then
  cd backend
  ARTISAN="artisan"
  ENV_FILE=".env"
  RUNNER=(php)
else
  error "Não encontrei o artisan (nem PHP local nem container 'api' do Compose)."
  error "Rode este script no terminal do container EasyPanel ou na VPS com o stack no ar."
  exit 1
fi

# --- Mostra o banco alvo (sem expor a senha) ---------------------------------
strip_quotes() {
  local v="$1"
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

DB_TARGET="desconhecido (sem .env)"
if [[ -f "$ENV_FILE" ]]; then
  DB_URL=$(grep -m1 -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)
  DB_URL=$(strip_quotes "${DB_URL:-}")
  if [[ -n "$DB_URL" ]]; then
    DB_TARGET=$(echo "$DB_URL" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')
  else
    # backend/.env usa DB_HOST/DB_DATABASE em vez de DATABASE_URL
    DB_HOST_V=$(grep -m1 -E '^DB_HOST=' "$ENV_FILE" | cut -d= -f2- || true)
    DB_NAME_V=$(grep -m1 -E '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2- || true)
    if [[ -n "${DB_HOST_V}${DB_NAME_V}" ]]; then
      DB_TARGET="$(strip_quotes "${DB_NAME_V:-?}")@$(strip_quotes "${DB_HOST_V:-?}")"
    fi
  fi
fi

warn "Isto irá APAGAR TODAS as tabelas do banco abaixo e recriá-las:"
echo -e "  ${BOLD}${DB_TARGET}${NC}"
echo
read -r -p "Confirma? Digite 'sim' para continuar: " resp
if [[ "${resp,,}" != "sim" ]]; then
  warn "Cancelado. Nada foi alterado."
  exit 0
fi

info "Rodando migrate:fresh (dropa tudo + recria o schema das migrations)..."
"${RUNNER[@]}" "$ARTISAN" migrate:fresh --force $SEED_FLAG

info "Concluído. Tabelas recriadas${SEED_FLAG:+ com o seed padrão (tenant NevaPro + roles)}."
