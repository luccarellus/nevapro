# Multi-stage build para otimização de imagem
FROM node:20-alpine AS builder

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

# Stage de Produção
FROM node:20-alpine

WORKDIR /app
# curl: healthcheck do container. postgresql-client: permite pg_dump nativo nos backups
# (se indisponível, o backup usa o fallback Node.js interno).
RUN apk add --no-cache curl postgresql-client

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Garante permissões e executa com usuário node (sem privilégios root)
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Script para iniciar a aplicação
CMD ["node", "dist/server.cjs"]
