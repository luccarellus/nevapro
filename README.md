<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

---

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

---

## 🏗️ Arquitetura

```
nevapro/
├── server.ts            # Servidor Express (Backend + API REST)
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
├── schema.sql           # Schema completo do banco de dados
├── docker-compose.yml   # Orquestração de containers
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

- **Express.js** com TypeScript
- **PostgreSQL** como banco de dados principal
- **bcryptjs** para hash de senhas
- **Helmet** para segurança HTTP
- **Multer** para upload de arquivos

**Infraestrutura**

- **Docker + Docker Compose** com 3 réplicas da API
- **Nginx** como reverse proxy e load balancer
- **Let's Encrypt / Certbot** para HTTPS
- **Node.js 20** (Alpine)

---

## 🔐 Segurança

A Neva Pro implementa um conjunto robusto de proteções de segurança:

- **Autenticação por Cookie HttpOnly** — tokens de sessão assinados com HMAC-SHA256
- **Proteção contra Força Bruta** — bloqueio de conta após 5 tentativas falhas (15 min)
- **Rate Limiter** — limitação de requisições por IP em memória
- **Tokens Revogados** — logout invalidando o token no banco de dados
- **Hash de Senhas** — BCrypt com salt (10 rounds), com migração automática de senhas legadas
- **Sanitização de Inputs** — proteção contra XSS em campos de texto
- **Proteção Mass Assignment** — campo `role` não pode ser alterado por estudantes
- **Content Security Policy** — CSP ativada em produção via Helmet
- **Separação de papéis** — middlewares `requireAuth` e `requireAdmin` em todas as rotas protegidas

---

## 🗄️ Banco de Dados

O schema PostgreSQL contém **19 tabelas**:

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

---

## 🚀 Executando Localmente

### Pré-requisitos

- [Node.js 20+](https://nodejs.org)
- [PostgreSQL](https://www.postgresql.org) (local ou serviço gerenciado)
- npm

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/nevapro.git
cd nevapro/nevapro
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com seus valores:

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

### Deploy na Vercel

Configure estas variáveis no painel da Vercel:

```env
APP_URL="https://seu-dominio.vercel.app"
FRONTEND_URL="https://seu-dominio.vercel.app"
DATABASE_URL="postgresql://postgres:[SENHA]@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[SENHA]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
DISABLE_DB_SSL="false"
SUPABASE_URL="https://gsbsfckiqqejifwystit.supabase.co"
SUPABASE_ANON_KEY="[anon key]"
SUPABASE_SERVICE_ROLE_KEY="[service role key]"
JWT_SECRET="[seu-secret]"
SESSION_SECRET="[seu-secret]"
```

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

> **Nota:** Em desenvolvimento, o Vite serve o frontend com HMR na porta padrão e o Express serve a API. O `tsx` executa `server.ts` diretamente.

---

## 🐳 Deploy com Docker

### Produção com Docker Compose

```bash
# Build e deploy com 3 réplicas da API
docker-compose up -d --build --scale api=3

# Verificar status dos containers
docker-compose ps

# Remover imagens antigas após deploy
docker image prune -f
```

### Estrutura Docker

- **`neva_nginx`** — Reverse proxy na porta 80/443, SSL via Certbot
- **`neva-api`** — Backend Node.js com 3 réplicas para alta disponibilidade
- Rede interna `neva_network` isolando os serviços

---

## 📦 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor em modo desenvolvimento com hot-reload |
| `npm run build` | Compila o frontend (Vite) e o backend (esbuild) para produção |
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



