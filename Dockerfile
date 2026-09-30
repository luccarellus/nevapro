# Multi-stage build para otimização de imagem
# A imagem chainguard/node só expõe as tags latest(-dev) e next(-dev) — não há tag versionada
FROM cgr.dev/chainguard/node:latest-dev AS builder

WORKDIR /app

# Build args injetados pelo docker-compose (usados pelo vite build no frontend)
ARG VITE_RECAPTCHA_SITE_KEY=""
ARG VITE_SENTRY_DSN=""
ARG VITE_MAINTENANCE_MODE="false"

ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_MAINTENANCE_MODE=$VITE_MAINTENANCE_MODE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage de dependências de produção (sem devDeps: vite/esbuild/typescript não
# vão para a imagem final — menor superfície de ataque e imagem ~60% menor)
FROM cgr.dev/chainguard/node:latest-dev AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Stage de Produção — imagem hardened Chainguard (0 CVEs críticos/altos)
# Sem shell, sem apk, sem root: superfície de ataque mínima.
FROM cgr.dev/chainguard/node:latest

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Script para iniciar a aplicação
CMD ["node", "dist/server.cjs"]
