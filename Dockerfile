# Multi-stage build para otimização de imagem
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage de Produção
FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache curl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Garante permissões e executa com usuário node (sem privilégios root)
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Script para iniciar a aplicação
CMD ["node", "dist/server.cjs"]
