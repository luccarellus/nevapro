# Multi-stage build para otimização de imagem
# Variante "-dev" inclui npm e ferramentas de build, com 0 CVEs críticos/altos
FROM cgr.dev/chainguard/node:latest-22-dev AS builder

WORKDIR /app

# Build args injetados pelo docker-compose (usados pelo vite build no frontend)
ARG VITE_RECAPTCHA_SITE_KEY=""
ARG VITE_SENTRY_DSN=""
ARG VITE_MAINTENANCE_MODE="false"
ARG GEMINI_API_KEY=""

ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_MAINTENANCE_MODE=$VITE_MAINTENANCE_MODE \
    GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage de Produção — imagem hardened Chainguard (0 CVEs críticos/altos)
# Sem shell, sem apk, sem root: superfície de ataque mínima.
FROM cgr.dev/chainguard/node:latest-22

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Script para iniciar a aplicação
CMD ["node", "dist/server.cjs"]
