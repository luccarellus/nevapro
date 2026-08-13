# Diagramas UML - Plataforma NevaPro (Multi-Tenancy & RBAC)

Este documento contém a especificação UML completa da plataforma **NevaPro**, contemplando o modelo de **Multi-Tenancy**, a estrutura de **RBAC (Role-Based Access Control)**, o pipeline de requisições e o ciclo de vida de entidades.

---

## 1. Diagrama de Entidade-Relacionamento (ERD / Class Diagram)

O diagrama abaixo apresenta o modelo de dados unificado com suporte a arrendamento múltiplo (`tenants`), papéis (`roles`), permissões (`permissions`) e atribuições de usuários (`user_tenant_roles`).

> ✅ **Status (13/08/2026):** Modelo implementado em `supabase/schema.sql` e `supabase/migrations/20260813_rbac_multi_tenancy.sql`, incluindo as colunas `tenant_id` nas tabelas escopadas (`users`, `admin_users`, `materials`, `events`, `notifications`, `mural`, `simulados`, `questions`, `answers`, `user_badges`, `user_daily_stats`, `xp_logs`, `user_study_tasks`, `user_tri_scores`).

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "arrenda"
    TENANTS ||--o{ MATERIALS : "possui"
    TENANTS ||--o{ EVENTS : "agenda"
    TENANTS ||--o{ NOTIFICATIONS : "envia"
    TENANTS ||--o{ MURAL : "publica"
    TENANTS ||--o{ SIMULADOS : "oferece"
    TENANTS ||--o{ QUESTIONS : "cadastra"
    
    USERS ||--o{ USER_TENANT_ROLES : "possui papéis em"
    TENANTS ||--o{ USER_TENANT_ROLES : "define acessos"
    ROLES ||--o{ USER_TENANT_ROLES : "atribuído em"
    ROLES ||--o{ ROLE_PERMISSIONS : "contém"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "pertence a"

    USERS ||--o{ ANSWERS : "responde"
    QUESTIONS ||--o{ ANSWERS : "avaliada em"
    QUESTIONS ||--o{ QUESTION_OPTIONS : "possui"
    SIMULADOS ||--o{ SIMULADO_QUESTIONS : "composto por"
    QUESTIONS ||--o{ SIMULADO_QUESTIONS : "incluída em"
    
    USERS ||--o{ USER_BADGES : "conquista"
    BADGES ||--o{ USER_BADGES : "outorgada em"
    USERS ||--o{ USER_DAILY_STATS : "gera"
    USERS ||--o{ XP_LOGS : "registra"

    TENANTS {
        uuid id PK
        string name
        string slug UK
        string domain UK
        string plan
        jsonb settings
        boolean active
        timestamp created_at
    }

    ROLES {
        uuid id PK
        uuid tenant_id FK "NULL para papéis globais"
        string code UK
        string name
        string description
    }

    PERMISSIONS {
        uuid id PK
        string code UK
        string module
        string description
    }

    ROLE_PERMISSIONS {
        uuid role_id PK,FK
        uuid permission_id PK,FK
    }

    USER_TENANT_ROLES {
        uuid id PK
        uuid user_id FK
        uuid tenant_id FK
        uuid role_id FK
        timestamp assigned_at
    }

    USERS {
        uuid id PK
        uuid default_tenant_id FK
        string email UK
        string name
        string password_hash
        string avatar_url
        integer xp
        integer level
        integer streak
        timestamp created_at
    }

    QUESTIONS {
        string id PK
        uuid tenant_id FK "NULL se global ENEM"
        string subject
        text text
        string difficulty
        integer xp_reward
        integer year
    }

    ANSWERS {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        string question_id FK
        integer selected_option_index
        boolean is_correct
        timestamp created_at
    }

    SIMULADOS {
        uuid id PK
        uuid tenant_id FK
        string title
        text description
        integer year
        integer total_questions
        integer duration_minutes
        integer xp_reward
    }

    MATERIALS {
        uuid id PK
        uuid tenant_id FK
        string title
        string type
        string subject
        text url
    }
```

---

## 2. Diagrama de Arquitetura de Sistema (Component / System Context)

Visualização da infraestrutura e fluxo de dados entre Clientes (Web/Mobile), Middlewares de Segurança, Camada de Aplicação e Banco de Dados Supabase/PostgreSQL com RLS.

```mermaid
graph TD
    Client["Client (Browser / React 19 App)"]
    DNS["Cloudflare / DNS Subdomains"]
    Nginx["Nginx Reverse Proxy / Vercel Edge"]
    
    subgraph Express_Backend["Express.js Server (Node.js + TS)"]
        AuthMW["requireAuth — verifica sessão e carrega contexto RBAC (roles/permissions/tenants)"]
        TenantMW["resolveTenant — X-Tenant-ID > subdomínio > tenant padrão > plataforma"]
        RBACMW["requirePermission / requireRole — valida no tenant ativo"]
        DBQueryBuilder["Scoped Query Builder + escopo tenant_id nas rotas"]
        Routes["API Routes (/api/tenants, /api/materials, /api/answers, ...)"]
    end
    
    subgraph Database_Layer["Supabase / PostgreSQL"]
        RLS["Row Level Security Policies (tenant_id enforcement)"]
        Tables["Tables (users, tenants, questions, answers, materials)"]
        AuthSupabase["Supabase Auth / GoTrue"]
    end

    subgraph External_Services["Serviços Externos"]
        S3["Backblaze B2 / AWS S3 (Storage)"]
        Sentry["Sentry Error Tracking"]
        Gemini["Google Gemini AI (Gerador/Explicador)"]
    end

    Client -->|HTTPS Request + X-Tenant-ID / Subdomain| DNS
    DNS --> Nginx
    Nginx --> AuthMW
    AuthMW --> TenantMW
    TenantMW --> RBACMW
    RBACMW --> Routes
    Routes --> DBQueryBuilder
    DBQueryBuilder --> RLS
    RLS --> Tables
    AuthMW -.-> AuthSupabase
    Routes -.-> S3
    Routes -.-> Sentry
    Routes -.-> Gemini
    Routes -.-> RBAC_Tables["roles / permissions / user_tenant_roles"]
```

---

## 3. Diagrama de Sequência: Autenticação Multi-Tenant & Verificação RBAC

Demonstra o fluxo passo a passo de validação de tenant e autorização por papéis ao realizar uma requisição à API (ex: publicação de novo material didático).

```mermaid
sequenceDiagram
    autonumber
    actor User as Professor (Usuário)
    participant App as React Frontend
    participant Server as Express Server (API)
    participant AuthMW as Auth Middleware
    participant TenantMW as Tenant Context Middleware
    participant RBACMW as RBAC Middleware
    participant DB as PostgreSQL / Supabase RLS

    User->>App: Submete formulário "Novo Material Didático"
    App->>Server: POST /api/materials (Headers: Auth Token, X-Tenant-ID: "tenant-123")
    
    Server->>AuthMW: Validar token de sessão / JWT
    alt Token Inválido / Expirado
        AuthMW-->>App: 401 Unauthorized
        App-->>User: Redireciona para Login
    else Token Válido
        AuthMW->>TenantMW: Anexa req.user { userId, email }
    end

    Server->>TenantMW: Identificar tenant ("tenant-123")
    TenantMW->>DB: Consultar status e vinculo do usuário no Tenant
    DB-->>TenantMW: Validação OK (tenant_id ativo)
    TenantMW->>RBACMW: Anexa req.tenantId = "tenant-123"

    Server->>RBACMW: Validar permissão `materials:upload`
    RBACMW->>DB: Verificar papéis e permissões do user em user_tenant_roles
    
    alt Permissão Negada
        DB-->>RBACMW: Sem permissão `materials:upload`
        RBACMW-->>App: 403 Forbidden ("Acesso negado: permissões insuficientes")
        App-->>User: Exibe alerta de erro
    else Permissão Concedida
        DB-->>RBACMW: Permissão OK (Role: 'teacher')
        RBACMW->>Server: Avança para o Route Handler
        Server->>DB: INSERT INTO materials (tenant_id, title, url, ...)
        DB-->>Server: Material inserido com sucesso
        Server-->>App: 201 Created { success: true, data: material }
        App-->>User: Atualiza lista e exibe mensagem de sucesso
    end
```

---

## 4. Diagrama de Estado: Ciclo de Vida do Usuário & Vínculo com Tenant

```mermaid
stateDiagram-v2
    [*] --> Unregistered: Usuário Acessa a Plataforma
    Unregistered --> Registered: Cadastro Geral (E-mail + Senha)
    
    state Registered {
        [*] --> NoTenant: Sem vínculo com Instituição
        NoTenant --> PendingInvite: Recebe Convite de Escola/Tenant
        PendingInvite --> TenantActive: Aceita Convite (Atribuído Papel 'student' ou 'teacher')
        TenantActive --> TenantSuspended: Inativação Pedagógica/Financeira
        TenantSuspended --> TenantActive: Reativação
        TenantActive --> RoleUpdated: Promoção de Papel (ex: student -> teacher / tenant_admin)
        RoleUpdated --> TenantActive
    }

    Registered --> SuperAdminGranted: Concessão de Privilégios Globais pela NevaPro
    SuperAdminGranted --> Registered: Revogação
```

---

## 5. Diagrama de Atividade: Resolução de Simulado e Processamento de XP

```mermaid
flowchart TD
    A[Início: Aluno seleciona Simulado no Tenant] --> B{Possui Acesso ao Simulado?}
    B -- Não --> C[Exibe mensagem: Simulado Indisponível]
    B -- Sim --> D[Inicia Cronômetro & Carrega Questões do Tenant/Globais]
    D --> E[Aluno responde as Questões]
    E --> F{Tempo Esgotado ou Finalizou?}
    F -- Não --> E
    F -- Sim --> G[Calcula Gabarito e Questões Corretas]
    G --> H[Insere registros em ANSWERS com tenant_id]
    H --> I[Atualiza Caderno de Erros para questões incorretas]
    I --> J[Calcula Recompensa em XP]
    J --> K[Registra XP Log & Atualiza Level/Streak do Aluno]
    K --> L[Atualiza Ranking/Leaderboard do Tenant]
    L --> M[Fim: Apresenta Tela de Desempenho e Recompensas]
```

---

## 6. Diagrama de Componentes: Pipeline de Autorização (RBAC + Multi-Tenancy)

Fluxo real implementado nos middlewares `requireAuth`, `resolveTenant` e `requirePermission`.

```mermaid
flowchart TD
    A[Requisição HTTP] --> B{Token de sessão válido?}
    B -- Não --> C[401 Sessão inválida ou expirada]
    B -- Sim --> D[requireAuth carrega rbacContext via rbacService]
    D --> E{resolveTenant}
    E --> E1[X-Tenant-ID header]
    E --> E2[Subdomínio do Host]
    E --> E3[Tenant padrão do usuário]
    E --> E4[Tenant da plataforma nevapro]
    E1 --> F[req.tenantId anexado]
    E2 --> F
    E3 --> F
    E4 --> F
    F --> G[requirePermission / requireRole]
    G --> H{Permissão no tenant ativo?}
    H -- Não --> I[403 Acesso negado: permissões insuficientes]
    H -- Sim --> J[Route Handler executa operação escopada por tenant_id]
    J --> K[Resposta 200/201]
```

---

## 7. Diagrama de Sequência: Gestão de Tenants e Atribuição de Papéis

Fluxo de `POST /api/tenants/:id/members` (atribuir papel a usuário).

```mermaid
sequenceDiagram
    autonumber
    actor Admin as tenant_admin / super_admin
    participant App as React Frontend
    participant API as Express API
    participant AuthMW as requireAuth
    participant RBACMW as requirePermission
    participant DB as PostgreSQL

    Admin->>App: Solicita atribuir papel (ex.: teacher) a usuário no tenant
    App->>API: POST /api/tenants/:id/members { email, role }
    API->>AuthMW: Validar sessão
    AuthMW->>DB: Carregar rbacContext (roles, permissions, tenants)
    AuthMW-->>API: req.rbacContext
    API->>RBACMW: Validar permissão (users:manage_teachers)
    RBACMW-->>API: OK
    API->>DB: INSERT user_tenant_roles (user_id, tenant_id, role_id) ON CONFLICT DO NOTHING
    DB-->>API: Vínculo criado
    API-->>App: 201 { success: true }
```
