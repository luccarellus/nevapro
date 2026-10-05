# 🚀 Manual de Operações e Produção - Neva Pro

## 🛡️ Checklist de Segurança de Produção

- [ ] **Firewall (UFW):** `ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`
- [ ] **HTTPS:** Certificados instalados via Certbot.
- [ ] **APP_KEY:** Chave Laravel persistente e exclusiva por ambiente.
- [ ] **Probe de uptime:** monitor externo apontado para `/api/health/readiness`.
- [ ] **Imagens GHCR:** pipeline de publicação ativo (`.github/workflows/publish.yml`).
- [ ] **Cookies:** Flag `Secure=true` e `HttpOnly=true` em todas as rotas de auth.
- [ ] **Rate Limit:** Configurado no NGINX e no middleware Laravel.

## 📦 Estratégia de Deploy (VPS)

A aplicação usa Laravel/PHP-FPM (PHP 8.4.1+) para a API, Nginx para TLS e frontend estático,
com containers Laravel separados para filas e agendamentos e Redis persistente
para cache, sessões e filas no deploy Compose. No EasyPanel também é possível usar
o target padrão do Dockerfile: ele reúne frontend, Nginx, PHP-FPM, worker e
scheduler em um único container; nesse modo, configure um Redis externo.

### Pré-requisitos

- VPS com **Docker** e **Docker Compose** instalados
- Domínio apontado (registro A) para o IP da VPS

### EasyPanel usando somente o Dockerfile

Configure o serviço para construir o `Dockerfile` da raiz e encaminhar o domínio
à porta **80** do container. Não defina um comando de inicialização customizado:
o Supervisor inicia Nginx, PHP-FPM, worker e scheduler.

Configure as variáveis de produção do `.env.example` no painel, em especial
`APP_KEY`, `APP_URL`, `DATABASE_URL` e `DB_SSLMODE`. O entrypoint mapeia
`DATABASE_URL` para `DB_URL`, como faz o Compose. Defina também os build args
`VITE_*` que forem usados pelo frontend. Migrations não são executadas ao iniciar;
faça backup e confira o schema antes de rodar `php artisan migrate --force` pelo
terminal do container. Mantenha uma única instância do serviço para evitar
executar o scheduler em duplicidade.

### ⚡ Início rápido (automatizado)

O script `deploy.sh` (ou os atalhos de `make`) automatiza todo o fluxo:

```bash
# 1. Setup: cria o .env a partir do .env.example e pergunta o domínio
./deploy.sh setup

# 2. Emitir o certificado SSL (primeira vez; requer domínio já apontando p/ a VPS)
./deploy.sh ssl

# 3. Build, migrations compatíveis e subida do stack Laravel
./deploy.sh up

# 4. Conferir saúde da aplicação
./deploy.sh health
```

No dia-a-dia:

```bash
./deploy.sh update    # git pull + rebuild + restart (novo deploy)
./deploy.sh logs      # logs da API em tempo real
./deploy.sh backup    # backup manual do banco no Backblaze B2
./deploy.sh status    # status dos containers
./deploy.sh renew     # renovação manual do SSL
./deploy.sh down      # para tudo
```

> Os mesmos comandos funcionam com `make` (`make setup`, `make up`, ...).
> Réplicas adicionais da API não estão documentadas/testadas; valide DNS do upstream Nginx e armazenamento compartilhado antes de escalar.

### 🚀 Deploy via GHCR (sem compilar na VPS)

O GitHub Actions compila, escaneia (Trivy) e publica imagens imutáveis
no GHCR a cada push em `main`, com tag por commit:

```
ghcr.io/luccarellus/nevapro-api:<SHA>   (api, scheduler, worker)
ghcr.io/luccarellus/nevapro-web:<SHA>   (nginx)
```

Para deployar sem compilar na VPS, use o override `docker-compose.deploy.yml`:

```bash
# Deploy do HEAD atual (ou de um SHA específico)
./deploy.sh ghcr
./deploy.sh ghcr 1a2b3c4

# Rollback: repita com o SHA do commit anterior
./deploy.sh ghcr <SHA-anterior>
```

> O `deploy.sh ghcr` executa `docker compose pull` + `up -d --no-build`
> com as imagens do GHCR. Migrations **não** são executadas automaticamente
> nesse fluxo — rode `docker compose exec api php artisan migrate --force`
> depois do deploy, como no fluxo manual.

### 🔧 Fluxo manual (referência)

<details>
<summary>Expandir passos manuais</summary>

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

# 5. Build, aplicar migrations seguras e iniciar os serviços
./deploy.sh up

# 6. Verificar o status
docker compose ps
docker compose logs -f api
```

</details>

### 2. Variáveis obrigatórias no `.env`

O Compose injeta as variáveis do `.env` nos containers Laravel. `DATABASE_URL`
é mapeada para `DB_URL`; `APP_KEY` deve permanecer estável entre deploys.

```env
# Banco PostgreSQL
DATABASE_URL="postgresql://usuario:senha@host:5432/banco"
DB_SSLMODE="require"

# URL pública e CORS
APP_URL="https://seu-dominio.com"
FRONTEND_URL="https://seu-dominio.com"

# Segredos
APP_KEY="base64:[chave gerada pelo setup]"
CRON_SECRET="[segredo aleatório]"
EVENTEASE_WEBHOOK_SECRET="[segredo do webhook]"

# Backblaze B2, EnemHub, Resend, Sentry e reCAPTCHA — conforme .env.example
```

> **PostgreSQL:** `DB_SSLMODE` usa `require` por padrão no Compose. Defina `prefer`
> se o servidor de banco não oferecer TLS.

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

### 4. Tarefas agendadas

| Horário (UTC) | Endpoint | Função |
|---|---|---|
| 03:00 | Laravel `CronService::cleanup()` | Limpeza de logs/tokens expirados |
| 04:00 | Laravel `DatabaseBackupJob` | Backup PostgreSQL no Backblaze B2 |

O serviço `scheduler` do Compose já executa `php artisan schedule:work`;
não é necessário configurar um container cron, chamadas HTTP periódicas
nem um scheduler separado. (Pendência registrada: o comando
`audit:verify-chain` mencionado em planos anteriores **não existe** no
código — não há cadeia de auditoria implementada para verificar.)

### 5. Hardening do host (Ubuntu 24.04 LTS)

Itens a aplicar diretamente no sistema operacional da VPS (fora do Compose):

```bash
# 1) UFW — libere apenas 22, 80 e 443
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable          # confirme o acesso SSH antes de habilitar
sudo ufw status verbose

# 2) fail2ban — proteção contra força bruta no SSH
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
# Em jail.local: bantime = 1h, findtime = 10m, maxretry = 3
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd

# 3) systemd timer para renovação do Certbot (alternativa ao crontab do §3)
sudo tee /etc/systemd/system/certbot-renew.service >/dev/null <<'EOF'
[Unit]
Description=Renovação do certificado Let's Encrypt (NevaPro)
[Service]
Type=oneshot
WorkingDirectory=/caminho/para/nevapro
ExecStart=/usr/bin/docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet
ExecStartPost=/usr/bin/docker compose exec nginx nginx -s reload
EOF
sudo tee /etc/systemd/system/certbot-renew.timer >/dev/null <<'EOF'
[Unit]
Description=Renovação diária do Certbot
[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer
sudo systemctl list-timers certbot-renew.timer
```

### 6. Pendências de provisionamento (VPS / provedor)

Não são executáveis a partir do repositório — requerem acesso à VPS ou ao
painel do provedor:

1. **Backup offsite (rclone + age):** instalar rclone na VPS
   (`curl https://rclone.org/install.sh | sudo bash`), criar o remote do
   Backblaze B2 ou S3 (`rclone config`) e uma chave age (`age-keygen`).
   Sincronizar `backups/` diariamente com criptografia client-side.
2. **Monitoramento externo:** registrar um probe em UptimeRobot, Pingdom ou
   Better Stack apontado para `https://<domínio>/api/health/readiness`
   (intervalo de 5 min; alertas por e-mail/Slack). O endpoint responde
   200 quando o banco atende e 503 caso contrário.
3. **Bucket de armazenamento:** criar o bucket do Backblaze B2/S3 usado pelo
   `DatabaseBackupJob` e pelo rclone (chaves no `.env` — veja `.env.example`).

## 🔋 Banco de dados

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/banco"
DB_SSLMODE="require"
```

Cadastre administradores em `public.admin_users`; o login Laravel valida essa
tabela e emite um token Sanctum no cookie HttpOnly `session_token`.

## 🧱 Autenticação

- Laravel Sanctum emite tokens com validade de 24 horas, guardados em `personal_access_tokens`.
- O cookie `session_token` é HttpOnly e seguro em produção; logout revoga o token atual.
- A troca de senha invalida sessões anteriores via `token_version`.

## 🧠 Redis, cache, filas e agendamentos

- O Compose sobe Redis sem publicar a porta na internet, habilita AOF e persiste
  dados no volume `redis_data`. API, worker e scheduler aguardam Redis saudável.
- No Compose, Laravel usa Redis para cache, sessões e filas (`CACHE_STORE=redis`,
  `SESSION_DRIVER=redis`, `QUEUE_CONNECTION=redis`). Predis já está incluído nas
  dependências PHP, sem exigir a extensão `phpredis`. O hostname `redis` mantém o
  tráfego na rede privada do Compose; não substitua por um IP público no deploy.
- No EasyPanel ou em outro runtime fora do Compose, forneça um Redis externo e
  configure `REDIS_CLIENT=predis`, `REDIS_HOST`/`REDIS_PORT` (ou `REDIS_URL`),
  `CACHE_STORE=redis`, `SESSION_DRIVER=redis` e `QUEUE_CONNECTION=redis`.
- Mantenha o Redis na mesma rede privada da aplicação sempre que possível: Redis
  remoto adiciona a latência de rede a cada cache miss e operação de sessão/fila.
  `REDIS_PASSWORD` e `REDIS_USERNAME` podem complementar uma `REDIS_URL` sem
  credenciais na API Express legada; credenciais já embutidas na URL prevalecem.
- Execute `npm run verify:connections` no ambiente da aplicação para verificar
  autenticação, leitura/escrita e latência PING do Redis usado pela API Express.
- A API Express legada usa o mesmo Redis para cache compartilhado e rate limit
  distribuído quando configurada; sem ele, mantém o fallback local.
- O serviço `worker` processa e-mails, notificações e backups.
- O serviço `scheduler` executa a limpeza diária às 03:00 UTC e o backup às 04:00 UTC.
- As migrations são executadas pelo `./deploy.sh up`; tabelas existentes são preservadas.

## 📊 Monitoramento Recomendado

1. **Logging:** Laravel Monolog (stdout/stderr) + CloudWatch ou ELK Stack.
2. **Uptime:** probe externo (UptimeRobot/Pingdom/Better Stack) no endpoint
   público `/api/health/readiness`, ou [Uptime Kuma](https://github.com/louislam/uptime-kuma)
   (auto-hospedado na própria VPS). O endpoint faz `SELECT 1` no banco e
   retorna 503 se ele não responder.
3. **Observabilidade:** [Sentry.io](https://sentry.io) para captura de erros em tempo real.
4. **Performance:** [Prometheus](https://prometheus.io/) + [Grafana] para métricas de CPU/RAM dos containers.

## 💾 Estratégia de Backup (Backblaze B2)

- O scheduler envia diariamente às 04:00 UTC um dump customizado do `pg_dump`
  para `backups/db/nevapro_YYYY-MM-DD_HHmmss.dump` no B2.
- Para executar manualmente: `docker compose exec api php artisan backup:run`.
- O dump customizado não é `.sql.gz`; não o descomprima com `gzip`.

### 🔄 Como Restaurar um Backup

1. Baixe o arquivo `.dump` do Backblaze B2.
2. Restaure em um banco PostgreSQL de destino vazio:

   ```bash
   pg_restore --no-owner --no-privileges --dbname="$DATABASE_URL" nevapro_....dump
   ```

## ☁️ Runtime Node legado

O deploy de produção documentado aqui usa Laravel em Docker. Os artefatos
Express/Vercel restantes são compatibilidade legada e não devem ser usados para
um novo deploy sem uma validação de paridade e configuração independentes.
