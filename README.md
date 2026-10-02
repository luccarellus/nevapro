## 📖 Sobre o Projeto

A **Neva Pro** é uma plataforma web full-stack voltada para a preparação de estudantes para o **ENEM**, com foco especial no estado do **Maranhão**. Combinando gamificação, inteligência artificial e uma experiência de usuário moderna, a Neva Pro transforma os estudos em uma jornada engajante e eficiente.

### ✨ Funcionalidades Principais

| Módulo | Descrição |
|---|---|
| 🎯 **Dashboard** | Painel de progresso com XP, nível, streak e estatísticas diárias |
| ❓ **Questões** | Banco de questões do ENEM com filtros por matéria, ano e dificuldade |
| 📝 **Simulados** | Simulados completos cronometrados com correção automática e relatório de desempenho |
| 📓 **Caderno de Erros** | Revisão inteligente das questões erradas com explicações detalhadas |
| 🏆 **Ranking** | Leaderboard competitivo com filtragem por escola e grêmio |
| 📚 **Materiais** | Repositório de materiais de estudo (PDFs, vídeos, apostilas) |
| 📌 **Mural** | Avisos e comunicados da plataforma para todos os estudantes |
| 📅 **Calendário** | Agenda de eventos, provas e atividades |
| ⚙️ **Configurações** | Perfil do usuário, temas visuais, preferências de idioma |
| 🛡️ **Admin Dashboard** | Painel completo de administração para gestão de usuários, questões e conteúdo |
| 🤖 **Flash Quiz** | Quiz rápido diário com recompensa de XP (protegido contra duplicação) |
| 🏢 **Multi-Tenancy** | Isolamento por instituição (tenants) com escopo `tenant_id` em todas as entidades |
| 🔐 **RBAC** | Papéis (`super_admin`, `tenant_admin`, `teacher`, `student`) com permissões granulares auditáveis |

---

## 🏗️ Arquitetura

```
nevapro/
├── backend/             # API Laravel (runtime de produção)
├── server.ts            # API Express (compatibilidade/desenvolvimento)
├── src/
│   ├── App.tsx          # Componente raiz do React
│   ├── components/      # Componentes React da interface
│   │   ├── Dashboard.tsx
│   │   ├── Questions.tsx
│   │   ├── Simulados.tsx
│   │   ├── ErrorsBook.tsx
│   │   ├── Leaderboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── ...
│   ├── services/        # Camada de comunicação com a API
│   ├── hooks/           # Custom React Hooks
│   ├── lib/             # Utilitários (DB, query builder)
│   ├── types/           # Tipos e interfaces TypeScript
│   └── utils/           # Funções utilitárias (XP, cálculos)
├── nginx/               # Configuração do Nginx (proxy reverso)
├── cron/                # Scripts legados de cron
├── schema.sql           # Schema completo do banco de dados
├── docker-compose.yml   # Nginx + Laravel + worker + scheduler
├── Dockerfile           # Build multi-stage da aplicação
└── vite.config.ts       # Configuração do bundler Vite
```

### Stack Tecnológica

**Frontend**

- **React 19** com TypeScript
- **Vite 6** como bundler
- **Tailwind CSS 4** para estilização
- **Motion** (Framer Motion) para animações
- **Recharts** para gráficos e visualizações
- **Lucide React** para ícones

**Backend**

- **Laravel 13** com PHP 8.4.1+ para produção
- **Express.js** com TypeScript para desenvolvimento e compatibilidade
- **PostgreSQL** como banco de dados principal
- **bcryptjs** para hash de senhas
- **Helmet** para segurança HTTP
- **Multer** para upload de arquivos

**Infraestrutura**

- **Docker + Docker Compose** (Nginx + Laravel PHP-FPM + worker + scheduler)
- **Redis** (cache compartilhado, sessões e filas no deploy Compose)
- **Nginx** como reverse proxy e load balancer
- **Let's Encrypt / Certbot** para HTTPS
- **Node.js 20** (Alpine)

---

## 🔐 Segurança

A Neva Pro implementa um conjunto robusto de proteções de segurança:

- **Autenticação por Cookie HttpOnly** — tokens de acesso Laravel Sanctum no runtime de produção; a API Express legada usa sessões HMAC-SHA256
- **Proteção contra Força Bruta** — bloqueio de conta após 5 tentativas falhas (15 min)
- **Rate Limiter** — limites por IP/conta usando o cache configurado (Redis no Docker Compose)
- **Tokens Revogados** — logout revoga a sessão atual e alterações de senha invalidam tokens anteriores
- **Hash de Senhas** — BCrypt com salt (10 rounds), com migração automática de senhas legadas
- **Sanitização de Inputs** — proteção contra XSS em campos de texto
- **Proteção Mass Assignment** — campo `role` não pode ser alterado por estudantes
- **Content Security Policy** — CSP ativada em produção via Helmet
- **Separação de papéis** — middlewares `requireAuth` e `requireAdmin` em todas as rotas protegidas
- **RBAC granular** — middlewares `requirePermission` e `requireRole` validam permissões por papel e por tenant
- **Multi-Tenancy** — middleware `resolveTenant` (header `X-Tenant-ID`, subdomínio ou tenant padrão) com escopo `tenant_id` nas consultas
- **Isolamento de tenant** — caches por tenant (`cache:key:tenantId`) e proteção contra mass assignment de `tenant_id`/`role`

---

## 🗄️ Banco de Dados

O schema PostgreSQL contém **24 tabelas** (incluindo Multi-Tenancy & RBAC):

| Tabela | Descrição |
|---|---|
| `users` | Estudantes cadastrados |
| `admin_users` | Administradores da plataforma |
| `questions` | Banco de questões do ENEM |
| `question_options` | Alternativas de cada questão |
| `simulados` | Simulados disponíveis |
| `simulado_questions` | Relação simulado ↔ questões |
| `answers` | Respostas dos usuários |
| `materials` | Materiais de estudo |
| `events` | Eventos e agenda |
| `notifications` | Notificações por usuário |
| `mural` | Posts do mural |
| `badges` | Conquistas disponíveis |
| `user_badges` | Conquistas obtidas por usuário |
| `xp_logs` | Histórico de ganhos de XP |
| `user_daily_stats` | Estatísticas diárias de estudo |
| `login_attempts` | Controle de tentativas de login |
| `revoked_tokens` | Tokens de sessão invalidados |
| `refresh_tokens` | Tokens de atualização |
| `consent_logs` | Registro de consentimentos LGPD |
| `tenants` | Instituições/entidades (Multi-Tenancy) |
| `roles` | Papéis RBAC (globais ou por tenant) |
| `permissions` | Catálogo de permissões granulares |
| `role_permissions` | Matriz papel ↔ permissão |
| `user_tenant_roles` | Vínculo usuário ↔ tenant ↔ papel |

---

## 🚀 Executando Localmente

### Pré-requisitos

- [PHP 8.4.1+](https://www.php.net/) com suporte a PostgreSQL/SQLite
- [Composer](https://getcomposer.org/)
- [Node.js 20+](https://nodejs.org) e npm
- PostgreSQL ou SQLite para desenvolvimento local

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/nevapro.git
cd nevapro/nevapro
```

### 2. Instale as dependências do backend e frontend

```bash
cd backend
composer install
cp .env.example .env
touch database/database.sqlite
php artisan key:generate
php artisan migrate --seed
cd ..
npm ci
```

### Configuração legada (Express/Supabase — não usar no runtime Laravel)

Para o runtime Laravel, configure `backend/.env` a partir de
`backend/.env.example`; as variáveis abaixo pertencem apenas ao backend Express
legado.

```bash
cp .env.example .env
```

```env
# Chave da API Gemini (Google AI)
GEMINI_API_KEY="sua_chave_aqui"

# URL da aplicação
APP_URL="http://localhost:3000"

# Segredo para assinar tokens de sessão (mínimo 32 caracteres)
JWT_SECRET="um_segredo_muito_seguro_aqui"

# String de conexão com o PostgreSQL
# No Supabase, use a connection string do banco do projeto e mantenha SSL habilitado.
DATABASE_URL="postgresql://postgres:senha@db.seu-projeto-ref.supabase.co:5432/postgres"

# SSL do banco
DISABLE_DB_SSL="false"

# URL do frontend (para CORS)
FRONTEND_URL="http://localhost:5173"

# Hosts permitidos para proxy de imagens
ALLOWED_IMAGE_HOSTS="s3.amazonaws.com"
```

### Supabase e Admins

- Os admins devem ser criados no **Supabase Auth** e vinculados à tabela `public.admin_users`.
- No Supabase Auth, marque o usuário com `app_metadata.role = "admin"` ou mantenha o e-mail correspondente em `public.admin_users`.
- A primeira autenticação do admin sincroniza `admin_users.auth_user_id` automaticamente.
- O login e a troca de senha do admin dependem exclusivamente do Supabase Auth.

### Runtime local Laravel

Inicie a API Laravel em `http://127.0.0.1:8000` e o frontend com
`npm run dev:frontend` em dois terminais. O Vite encaminha `/api` para Laravel;
`npm run dev` permanece apenas para desenvolvimento/compatibilidade Express.

### Deploy no EasyPanel com Dockerfile (Laravel)

O Dockerfile da raiz gera uma imagem única com frontend, Nginx e Laravel/PHP-FPM.
Ele também inicia o worker e o scheduler Laravel via Supervisor, para poder ser
implantado como um serviço Dockerfile no EasyPanel sem Docker Compose.

1. Configure o serviço para construir usando o `Dockerfile` da raiz e publicar a
   porta **80**. Não sobrescreva o comando de inicialização.
2. Cadastre no painel as variáveis de produção do `.env.example`, incluindo
   `APP_KEY`, `APP_URL`, `DATABASE_URL`, `DB_SSLMODE` e as configurações de B2,
   e-mail e integrações usadas pela aplicação. O container converte
   `DATABASE_URL` para `DB_URL` automaticamente.
3. Defina `VITE_RECAPTCHA_SITE_KEY`, `VITE_SENTRY_DSN` e
   `VITE_MAINTENANCE_MODE` como build arguments caso sejam usados; esses valores
   são compilados no frontend durante o build.
4. Faça backup e valide o schema do banco antes de executar
   `php artisan migrate --force` pelo terminal do serviço. Migrations não são
   executadas automaticamente na inicialização.

O mesmo Dockerfile mantém os targets `api` e `web` usados pelo deploy em Compose.
No EasyPanel, mantenha uma única instância desse serviço para evitar executar
mais de um scheduler simultaneamente.

### Deploy na VPS (Docker Compose + Laravel)

1. Copie e preencha o `.env` (veja o `.env.example`):

   ```bash
   cp .env.example .env
   ```

2. Edite `nginx/conf.d/default.conf` e troque `seu-dominio.com` pelo domínio real.

3. Suba os serviços Laravel (Nginx + API + worker + scheduler):

   ```bash
   ./deploy.sh up
   ```

4. Emita o certificado SSL (primeira vez) e renove via cron no host.
   Veja o passo a passo completo em [`PRODUCTION.md`](PRODUCTION.md).

> O scheduler Laravel executa a limpeza às 03:00 UTC e os backups às 04:00 UTC.

### Deploy na Vercel (opcional / staging)

Configure estas variáveis no painel da Vercel:

```env
APP_URL="https://seu-dominio.vercel.app"
FRONTEND_URL="https://seu-dominio.vercel.app"
DATABASE_URL="postgresql://postgres:[SENHA]@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[SENHA]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
DISABLE_DB_SSL="false"
SUPABASE_URL="https://[PROJECT_REF].supabase.co"
SUPABASE_ANON_KEY="[anon key]"
SUPABASE_SERVICE_ROLE_KEY="[service role key]"
JWT_SECRET="[seu-secret]"
```

> O deploy Docker Compose conecta a API Laravel ao Redis pela rede privada do Compose
> (`CACHE_STORE=redis`, `REDIS_HOST=redis`), compartilhando cache, sessões e filas sem
> tráfego pela internet. O target standalone/EasyPanel usa PostgreSQL por padrão;
> para habilitar Redis, forneça um Redis privado/acessível pelo serviço e configure
> `CACHE_STORE=redis`, `REDIS_CLIENT=predis` e `REDIS_HOST`/`REDIS_PORT` ou `REDIS_URL`.
> A API Express legada também aceita `REDIS_PASSWORD`/`REDIS_USERNAME` junto com uma
> `REDIS_URL` sem credenciais. O backend inclui Predis e não depende da extensão PHP `phpredis`.

### 4. Configure o banco de dados

Execute o schema no seu PostgreSQL:

```bash
psql -U seu_usuario -d nevapro -f schema.sql
```

### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

O servidor ficará disponível em `http://localhost:3000`.

> **Nota:** `npm run dev` continua iniciando o Express para compatibilidade local; a API implantada pelo Compose é Laravel.

---

## 🐳 Deploy com Docker

### Produção com Docker Compose

```bash
# Build, migrations e subida do stack Laravel
./deploy.sh up

# Verificar status dos containers
docker compose ps

# Remover imagens antigas após deploy
docker image prune -f
```

### Estrutura Docker

- **`neva_nginx`** — Reverse proxy na porta 80/443, SSL via Certbot
- **`neva-laravel-api`** — API Laravel/PHP-FPM
- **`neva-web`** — Nginx com frontend Vite, TLS e proxy FastCGI
- **`worker` / `scheduler`** — filas e tarefas agendadas Laravel
- Rede interna `neva_network` isolando os serviços

---

## 📦 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor em modo desenvolvimento com hot-reload |
| `npm run build:frontend` | Compila o frontend Vite para servir pelo Nginx |
| `npm run build` | Compila o frontend e a API Express de compatibilidade |
| `npm start` | Inicia o servidor em modo produção (`dist/server.cjs`) |
| `npm run lint` | Verifica tipos TypeScript sem emitir arquivos |
| `npm run clean` | Remove a pasta `dist/` |

---

## 🎮 Sistema de Gamificação

A Neva Pro utiliza um sistema de XP (pontos de experiência) para engajar os estudantes:

- **Questões** — XP variável por dificuldade
- **Simulados** — Recompensa de XP ao concluir
- **Flash Quiz** — Bônus diário de XP (cooldown de 6 horas, protegido server-side)
- **Níveis** — Progressão contínua baseada em XP acumulado
- **Streak** — Sequência de dias de estudo consecutivos
- **Ranking** — Leaderboard competitivo por escola e grêmio

---

## 🌐 Rotas da API

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Login de usuário ou administrador |
| `POST` | `/api/auth/register` | Cadastro de novo estudante |
| `POST` | `/api/auth/logout` | Logout (revoga token no banco) |
| `POST` | `/api/auth/change-password` | Alteração de senha |
| `POST` | `/api/auth/delete-user` | Exclusão de conta |

### Usuário

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/user/profile` | Buscar perfil |
| `POST` | `/api/user/profile` | Atualizar perfil e XP |

### Multi-Tenancy & RBAC

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/tenants` | Lista tenants do usuário autenticado |
| `POST` | `/api/tenants` | Cria tenant (permissão `tenants:manage`) |
| `GET` | `/api/tenants/:id` | Detalhes do tenant |
| `PUT` | `/api/tenants/:id` | Atualiza tenant (`tenants:manage`) |
| `DELETE` | `/api/tenants/:id` | Desativa tenant (`tenants:manage`) |
| `GET` | `/api/tenants/:id/roles` | Papéis disponíveis no tenant |
| `POST` | `/api/tenants/:id/members` | Atribui papel a usuário |
| `DELETE` | `/api/tenants/:id/members/:userId` | Remove papéis do usuário no tenant |

### Questões, Simulados, Materiais, Eventos e mais — gerenciados via painel Admin

---

## 🔒 Conformidade LGPD

A plataforma implementa:

- **Cookie Banner** com consentimento explícito
- **Política de Privacidade** detalhada
- **Política de Cookies** acessível
- **Registro de Consentimentos** na tabela `consent_logs`
- **Exclusão completa de dados** do usuário sob demanda

---

## 📊 Monitoramento (Recomendado para Produção)

| Ferramenta | Uso |
|---|---|
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | Monitoramento de uptime |
| [Sentry](https://sentry.io) | Captura de erros em tempo real |
| [Prometheus + Grafana](https://prometheus.io/) | Métricas de CPU/RAM dos containers |
| Winston + ELK Stack | Logging centralizado |

---

## 💾 Backup

- **PostgreSQL:** `pg_dump` diário automatizado
- **Arquivos:** Backup semanal de `/nginx` e `.env` em repositório privado ou S3

---

## 📄 Licença

Este projeto é proprietário. Todos os direitos reservados © Neva Pro.

---

<div align="center">
  <p><strong>Neva Pro • Educando com Inteligência</strong></p>
</div>
