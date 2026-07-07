# 🚀 Manual de Operações e Produção - Neva Pro NESTJS

## 🛡️ Checklist de Segurança de Produção
- [ ] **Firewall (UFW):** `ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`
- [ ] **HTTPS:** Certificados instalados via Certbot.
- [ ] **JWT:** Secret gerada com pelo menos 256 bits e rotacionada a cada 3 meses.
- [ ] **Cookies:** Flag `Secure=true` e `HttpOnly=true` em todas as rotas de auth.
- [ ] **Rate Limit:** Configurado no NGINX e via `@nestjs/throttler`.

## 📦 Estratégia de Deploy (VPS)
```bash
# 1. Atualizar projeto
git pull origin dev

# 2. Build e Deploy com Zero Downtime
docker-compose up -d --build --scale api=3

# 3. Remover imagens antigas
docker image prune -f
```

## 🔋 Configuração de Banco (PostgreSQL)
Conecte-se ao seu banco de dados PostgreSQL na VPS:
```env
# DATABASE_URL no .env
DATABASE_URL="postgres://[USUARIO]:[SENHA]@[HOST]:[PORTA]/[BANCO]?connection_limit=10"
```

## 🧱 Autenticação (JWT + Refresh Token)
- **Access Token:** JWT de vida curta (15 min) enviado via HttpOnly Cookie.
- **Refresh Token:** Armazenado em banco (PostgreSQL) e enviado via Cookie HttpOnly com path `/api/auth/refresh`.
- **Estratégia:** Na expiração do Access Token, o frontend tenta bater na rota de refresh. Se o token foi rotacionado ou invalidado, o usuário é deslogado.

## 📊 Monitoramento Recomendado
1. **Logging:** [Winston](https://github.com/winstonjs/winston) + CloudWatch ou ELK Stack.
2. **Uptime:** [Uptime Kuma](https://github.com/louislam/uptime-kuma) (Auto-hospedado na própria VPS).
3. **Observabilidade:** [Sentry.io](https://sentry.io) para captura de erros em tempo real.
4. **Performance:** [Prometheus](https://prometheus.io/) + [Grafana] para métricas de CPU/RAM dos containers.

## 💾 Estratégia de Backup
- **PostgreSQL:** Backups automáticos diários (pg_dump ou backup gerenciado).
- **Arquivos:** Backups semanais da pasta `/nginx` e `.env` em repositório privado ou S3.

