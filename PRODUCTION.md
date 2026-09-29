# 🚀 Manual de Operações e Produção - Neva Pro

## 🛡️ Checklist de Segurança de Produção

- [ ] **Firewall (UFW):** `ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`
- [ ] **HTTPS:** Certificados instalados via Certbot.
- [ ] **JWT:** Secret gerada com pelo menos 256 bits e rotacionada a cada 3 meses.
- [ ] **Cookies:** Flag `Secure=true` e `HttpOnly=true` em todas as rotas de auth.
- [ ] **Rate Limit:** Configurado no NGINX e via Redis (rate limiter do Express).

## 📦 Estratégia de Deploy (VPS)

A aplicação é um único container Express que serve **API + frontend estático**,
atrás de um Nginx com SSL. O Redis roda como serviço próprio no docker-compose
(cache, rate-limit e sessões) e um container `cron` substitui o **Vercel Cron**.

### Pré-requisitos

- VPS com **Docker** e **Docker Compose** instalados
- Domínio apontado (registro A) para o IP da VPS
- Projeto Supabase já configurado (banco + Auth + Storage B2)

### 1. Subir o projeto

```bash
# 1. Clonar/atualizar o projeto na VPS
git pull origin main

# 2. Criar o .env a partir do exemplo e preencher (veja abaixo)
cp .env.example .env
nano .env

# 3. Trocar "seu-dominio.com" pelo domínio real em nginx/conf.d/default.conf
nano nginx/conf.d/default.conf

# 4. Emitir os certificados SSL (somente na primeira vez) — veja a seção
#    "HTTPS (Certbot)" abaixo antes de prosseguir

# 5. Build e subir todos os serviços
docker compose up -d --build

# 6. Verificar o status
docker compose ps
docker compose logs -f api
```

> Para escalar a API (múltiplas réplicas atrás do Nginx): `docker compose up -d --build --scale api=3`

### 2. Variáveis obrigatórias no `.env`

O docker-compose injeta **todo o `.env`** no container `api` (`env_file`) e usa
o `REDIS_URL` definido nele (com credenciais: `redis://default:[SENHA]@nevapro_redis:6379`).

```env
# Banco (Supabase)
DATABASE_URL="postgresql://postgres:[SENHA]@db.[PROJECT_REF].supabase.co:5432/postgres"
DISABLE_DB_SSL="false"
DB_SSL_REJECT_UNAUTHORIZED="false"

# Supabase Auth/Storage
SUPABASE_URL="https://[PROJECT_REF].supabase.co"
SUPABASE_ANON_KEY="[anon key]"
SUPABASE_SERVICE_ROLE_KEY="[service role key]"

# URL pública e CORS
APP_URL="https://seu-dominio.com"
FRONTEND_URL="https://seu-dominio.com"

# Segredos
JWT_SECRET="[min 32 caracteres]"
CRON_SECRET="[segredo usado pelos jobs de cron]"
EVENTEASE_WEBHOOK_SECRET="[segredo do webhook]"

# Gemini, Resend, Backblaze B2, Sentry, reCAPTCHA — como no .env.example
```

> **Redis:** defina `REDIS_URL` no `.env` com as credenciais do serviço
> (ex.: `redis://default:[SENHA]@nevapro_redis:6379`). Em dev local sem Docker,
> aponte para `localhost`, ou deixe o app operar com fallback em memória.

### 3. HTTPS (Certbot / Let's Encrypt)

O docker-compose inclui o serviço `certbot` que emite e renova os certificados
em `./certbot/conf` (montado no Nginx como `/etc/letsencrypt`). O Nginx serve
o desafio ACME via webroot (`./certbot/www`).

**Antes de começar:**
- O domínio deve apontar (registro A) para o IP da VPS.
- Portas 80 e 443 liberadas no firewall (`ufw allow 80/tcp && ufw allow 443/tcp`).
- Troque `seu-dominio.com` pelo domínio real em `nginx/conf.d/default.conf`.

#### Primeira emissão (uma única vez)

O Nginx **não sobe** com o bloco 443 ativo enquanto os certificados não
existirem. Por isso, a primeira emissão usa uma config mínima (só HTTP + ACME):

```bash
# 1) Config mínima de bootstrap (só HTTP, sem SSL)
cat > nginx/conf.d/bootstrap.conf <<'EOF'
server {
    listen 80;
    server_name seu-dominio.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}
EOF
mv nginx/conf.d/default.conf nginx/conf.d/default.conf.disabled

# 2) Sobe o nginx (a API sobe junto para o healthcheck)
docker compose up -d nginx

# 3) Emite os certificados (remova -d www... se não usar o subdomínio www)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d seu-dominio.com -d www.seu-dominio.com \
  --email voce@seudominio.com --agree-tos --no-eff-email

# 4) Restaura a config de produção e recarrega o nginx
rm nginx/conf.d/bootstrap.conf
mv nginx/conf.d/default.conf.disabled nginx/conf.d/default.conf
docker compose exec nginx nginx -s reload
```

Verifique se os certificados foram criados:

```bash
docker compose run --rm certbot certificates
```

> **Solução de problemas:** se o passo 3 falhar com `unauthorized`, confira
> que o domínio aponta para o IP da VPS e que a porta 80 está acessível
> (`curl -I http://seu-dominio.com/.well-known/acme-challenge/` deve responder).

#### Renovação automática

O Certbot renova automaticamente certificados com menos de 30 dias para
vencer. Adicione um cron no **host** (o container `cron` do compose não tem
acesso ao socket do Docker):

```cron
# crontab -e (horário em UTC)
0 3 * * * cd /caminho/para/nevapro && docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose exec nginx nginx -s reload
```

Teste a renovação antes de agendar (não altera nada):

```bash
docker compose run --rm certbot renew --dry-run
```

> **Segurança:** o diretório `certbot/` contém chaves privadas e está no
> `.gitignore` — nunca o envie para o repositório.

### 4. Cron Jobs (substitui o Vercel Cron)

O serviço `cron` do compose dispara os endpoints internos diariamente (horário **UTC**):

| Horário (UTC) | Endpoint | Função |
|---|---|---|
| 03:00 | `POST /api/cron/cleanup` | Limpeza de logs/tokens (`clean_unnecessary_logs`) |
| 04:00 | `POST /api/cron/backup` | Backup do banco no Backblaze B2 |

Os horários estão em `cron/crontab`. A autenticação usa o header
`X-Cron-Secret` com o valor de `CRON_SECRET`.

## 🔋 Configuração de Banco (Supabase)

```env
DATABASE_URL="postgresql://postgres:[SENHA]@db.[PROJECT_REF].supabase.co:5432/postgres"
DISABLE_DB_SSL="false"
```

- Admins devem ser criados no Supabase Auth com `app_metadata.role = admin` ou associados a `public.admin_users`.
- No primeiro login válido, o backend sincroniza `public.admin_users.auth_user_id`.

## 🧱 Autenticação (JWT + Refresh Token)

- **Access Token:** JWT de vida curta (15 min) enviado via HttpOnly Cookie.
- **Refresh Token:** Armazenado em banco (PostgreSQL) e enviado via Cookie HttpOnly com path `/api/auth/refresh`.
- **Estratégia:** Na expiração do Access Token, o frontend tenta bater na rota de refresh. Se o token foi rotacionado ou invalidado, o usuário é deslogado.

## 🧠 Redis (cache e rate-limit)

- O cache usa exclusivamente o **Redis self-hosted** (`REDIS_URL`, injetado pelo docker-compose).
- Sem Redis configurado, o app opera com fallback em memória (cache opcional e rate-limit por instância).
- O estado do Redis aparece em `GET /api/health` (`dependencies.redis`).

## 📊 Monitoramento Recomendado

1. **Logging:** Winston + CloudWatch ou ELK Stack.
2. **Uptime:** [Uptime Kuma](https://github.com/louislam/uptime-kuma) (Auto-hospedado na própria VPS).
3. **Observabilidade:** [Sentry.io](https://sentry.io) para captura de erros em tempo real.
4. **Performance:** [Prometheus](https://prometheus.io/) + [Grafana] para métricas de CPU/RAM dos containers.

## 💾 Estratégia de Backup (Backblaze B2)

- **PostgreSQL no Backblaze B2:**
  - **Automação:** container `cron` do compose dispara `POST /api/cron/backup` diariamente às `04:00 UTC`.
  - **Manual via CLI:** Execute `npm run backup:db` na VPS ou ambiente local.
  - **Validação de Conexão:** Execute `npm run test:backblaze-backup` para testar escrita e leitura no bucket de backup.
  - **Retenção Automática:** Arquivos com mais de `B2_BACKUP_RETENTION_DAYS` (padrão: 30 dias) são expurgados automaticamente do bucket.
  - **Localização dos arquivos:** `backups/db/nevapro_db_YYYY-MM-DD_HHmmss.sql.gz`.
  - O dump usa `pg_dump` nativo quando disponível (instalado no container); caso contrário, usa o fallback Node.js.

### 🔄 Como Restaurar um Backup

1. Baixe o arquivo `.sql.gz` do Backblaze B2.
2. Descomprima o arquivo: `gzip -d nevapro_db_...sql.gz`.
3. Restaure no PostgreSQL:

   ```bash
   psql "$DATABASE_URL" < nevapro_db_...sql
   ```

## ☁️ Deploy na Vercel (opcional / staging)

- O backend continua compatível com a Vercel via [`api/index.ts`](api/index.ts) e `vercel.json` (crons + rewrites).
- No ambiente da Vercel o cache fica sem Redis (fallback em memória por instância); o Redis self-hosted é usado na VPS.
- Use as variáveis `APP_URL`, `FRONTEND_URL`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no projeto da Vercel.
