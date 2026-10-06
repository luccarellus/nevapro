#!/bin/sh
set -eu

if [ -z "${DB_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    export DB_URL="${DATABASE_URL}"
fi

# ===== Cache em Redis por padrão =====
if [ -z "${CACHE_STORE:-}" ]; then
    export CACHE_STORE=redis
fi

if [ "${CACHE_STORE:-redis}" = "redis" ] \
    && [ -z "${REDIS_URL:-}" ] \
    && [ -z "${REDIS_HOST:-}" ]; then
    echo "[entrypoint] CACHE_STORE=redis, mas REDIS_URL ou REDIS_HOST não foi configurado." >&2
    exit 1
fi

# ===== Otimizações de bootstrap (grande ganho de latência por request) =====
# Cachear config/rotas/eventos elimina o re-parse de ~30 arquivos de config e a
# recompilação de rotas em TODO request. Com config cacheado, env() retorna null
# em runtime — por isso o código usa config() (services.jwt_secret já migrado).
#
# Compat com deploy antigo: se a config cacheada for de uma imagem anterior e
# não refletir o .env atual, APaga e segue sem cache (comportamento antigo)
# em vez de quebrar o boot. NEVA_SKIP_OPTIMIZE=1 desativa tudo.
cd /var/www/html

if [ "${NEVA_SKIP_OPTIMIZE:-0}" != "1" ]; then
    # Reescreve do zero: garante que a config cacheada reflete o .env atual.
    rm -f bootstrap/cache/config.php bootstrap/cache/routes-v7.php bootstrap/cache/events.php
    if php artisan config:cache >/dev/null 2>&1; then
        php artisan event:cache >/dev/null 2>&1 || true
        php artisan route:cache >/dev/null 2>&1 || true
    else
        echo "[entrypoint] config:cache falhou (permissões/var .env?) — seguindo sem cache de bootstrap." >&2
    fi
fi

exec "$@"
