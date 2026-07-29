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

## 🔋 Configuração de Banco (PostgreSQL ou Supabase)

Conecte-se ao seu banco de dados PostgreSQL na VPS ou use o banco do Supabase:

```env
# DATABASE_URL no .env
DATABASE_URL="postgres://[USUARIO]:[SENHA]@[HOST]:[PORTA]/[BANCO]?connection_limit=10"

# Exemplo Supabase
DATABASE_URL="postgresql://postgres:[SENHA]@db.[PROJECT_REF].supabase.co:5432/postgres"
DISABLE_DB_SSL="false"
```

## 🚀 Deploy na Vercel

- O backend está preparado para a Vercel via [`api/index.ts`](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/api/index.ts).
- O build precisa gerar `dist/server.cjs` antes da função subir.
- Use as variáveis `APP_URL`, `FRONTEND_URL`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no projeto da Vercel.
- Admins devem ser criados no Supabase Auth com `app_metadata.role = admin` ou associados a `public.admin_users`.
- No primeiro login válido, o backend sincroniza `public.admin_users.auth_user_id`.

## 🧱 Autenticação (JWT + Refresh Token)

- **Access Token:** JWT de vida curta (15 min) enviado via HttpOnly Cookie.
- **Refresh Token:** Armazenado em banco (PostgreSQL) e enviado via Cookie HttpOnly com path `/api/auth/refresh`.
- **Estratégia:** Na expiração do Access Token, o frontend tenta bater na rota de refresh. Se o token foi rotacionado ou invalidado, o usuário é deslogado.

## 📊 Monitoramento Recomendado

1. **Logging:** [Winston](https://github.com/winstonjs/winston) + CloudWatch ou ELK Stack.
2. **Uptime:** [Uptime Kuma](https://github.com/louislam/uptime-kuma) (Auto-hospedado na própria VPS).
3. **Observabilidade:** [Sentry.io](https://sentry.io) para captura de erros em tempo real.
4. **Performance:** [Prometheus](https://prometheus.io/) + [Grafana] para métricas de CPU/RAM dos containers.

## 💾 Estratégia de Backup (Backblaze B2)

- **PostgreSQL no Backblaze B2:**
  - **Automação (Vercel Cron):** Endpoint `/api/cron/backup` agendado via `vercel.json` diariamente às `04:00 UTC`.
  - **Manual via CLI:** Execute `npm run backup:db` na VPS ou ambiente local.
  - **Validação de Conexão:** Execute `npm run test:backblaze-backup` para testar escrita e leitura no bucket de backup.
  - **Retenção Automática:** Arquivos com mais de `B2_BACKUP_RETENTION_DAYS` (padrão: 30 dias) são expurgados automaticamente do bucket.
  - **Localização dos arquivos:** `backups/db/nevapro_db_YYYY-MM-DD_HHmmss.sql.gz`.

### 🔄 Como Restaurar um Backup

1. Baixe o arquivo `.sql.gz` do Backblaze B2.
2. Descomprima o arquivo: `gzip -d nevapro_db_...sql.gz`.
3. Restaure no PostgreSQL:

   ```bash
   psql "$DATABASE_URL" < nevapro_db_...sql
   ```
