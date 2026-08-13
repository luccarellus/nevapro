-- EXTENSÕES RECOMENDADAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- MULTI-TENANCY & RBAC (criadas antes das tabelas que referenciam tenants)
-- ============================================================

-- 0.1 TENANTS (instituições/entidades)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'free',
    settings JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 0.2 ROLES (papéis globais têm tenant_id NULL)
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (tenant_id, code)
);

-- Papéis globais: código único quando tenant_id é NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_global_code ON public.roles(code) WHERE tenant_id IS NULL;

-- 0.3 PERMISSIONS
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 0.4 ROLE_PERMISSIONS (matriz papel ↔ permissão)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 0.5 USER_TENANT_ROLES (vínculo usuário ↔ tenant ↔ papel)
--     user_id referencia public.users OU public.admin_users (polimórfico).
CREATE TABLE IF NOT EXISTS public.user_tenant_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, tenant_id, role_id)
);

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    city VARCHAR(255),
    school VARCHAR(255),
    gremio VARCHAR(255),
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    rank INTEGER,
    password_hash VARCHAR(255),
    language_preference VARCHAR(50) DEFAULT 'ingles',
    show_in_leaderboard BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    browser_notifications BOOLEAN DEFAULT true,
    avatar_url TEXT,
    points INTEGER DEFAULT 0,
    answered_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    flash_quiz_completed BOOLEAN DEFAULT false,
    tri_target_score INTEGER DEFAULT 750,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. ADMIN_USERS
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    password_hash VARCHAR(255),
    avatar_url TEXT,
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    answered_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    flash_quiz_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. MATERIALS
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    subject VARCHAR(255),
    foco VARCHAR(255),
    url TEXT NOT NULL,
    description TEXT,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. EVENTS
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date VARCHAR(50),
    time VARCHAR(50),
    type VARCHAR(50),
    category VARCHAR(100),
    questions_count INTEGER DEFAULT 0,
    xp_reward INTEGER DEFAULT 0,
    observation TEXT,
    release_date TIMESTAMP WITH TIME ZONE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. NOTIFICATIONS (Avisos / Mural)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    sender VARCHAR(255),
    date VARCHAR(50),
    category VARCHAR(100),
    tag VARCHAR(100),
    priority VARCHAR(50),
    type VARCHAR(50),
    is_read BOOLEAN DEFAULT false,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. QUESTIONS
CREATE TABLE IF NOT EXISTS public.questions (
    id VARCHAR(255) PRIMARY KEY,
    subject VARCHAR(255),
    text TEXT NOT NULL,
    image_url TEXT,
    correct_option_index INTEGER,
    explanation TEXT,
    difficulty VARCHAR(50),
    xp_reward INTEGER DEFAULT 10,
    year INTEGER,
    index INTEGER,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. QUESTION_OPTIONS
CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id VARCHAR(255) REFERENCES public.questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    image_url TEXT,
    letter VARCHAR(10),
    is_correct BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. SIMULADOS
CREATE TABLE IF NOT EXISTS public.simulados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    year INTEGER,
    total_questions INTEGER DEFAULT 0,
    duration_minutes INTEGER DEFAULT 60,
    xp_reward INTEGER DEFAULT 0,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. SIMULADO_QUESTIONS
CREATE TABLE IF NOT EXISTS public.simulado_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulado_id UUID REFERENCES public.simulados(id) ON DELETE CASCADE,
    question_id VARCHAR(255) REFERENCES public.questions(id) ON DELETE CASCADE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 10. ANSWERS
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    question_id VARCHAR(255) REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_option_index INTEGER,
    is_correct BOOLEAN,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 11. BADGES (Recompensas / Conquistas)
CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price_xp INTEGER DEFAULT 0,
    icon VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 12. USER_BADGES
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    awarded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 13. USER_DAILY_STATS
CREATE TABLE IF NOT EXISTS public.user_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    xp_earned INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, date)
);

-- 14. XP_LOGS
CREATE TABLE IF NOT EXISTS public.xp_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason VARCHAR(255),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 15. PASSWORD_RESET_TOKENS
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 16. REFRESH_TOKENS
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 17. CONSENT_LOGS
CREATE TABLE IF NOT EXISTS public.consent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 18. REVOKED_TOKENS
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    token VARCHAR(500) PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 19. LOGIN_ATTEMPTS
CREATE TABLE IF NOT EXISTS public.login_attempts (
    email VARCHAR(255) PRIMARY KEY,
    attempts INTEGER DEFAULT 1,
    lock_until TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 20. MURAL
CREATE TABLE IF NOT EXISTS public.mural (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    type VARCHAR(50) DEFAULT 'GERAL',
    tag VARCHAR(100),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 21. USER_STUDY_TASKS (Plano de Estudos)
CREATE TABLE IF NOT EXISTS public.user_study_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    estimated_time VARCHAR(50),
    target_tab VARCHAR(50) DEFAULT 'questions',
    done BOOLEAN DEFAULT false,
    task_date DATE DEFAULT CURRENT_DATE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 22. USER_TRI_SCORES (Desempenho TRI)
CREATE TABLE IF NOT EXISTS public.user_tri_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    estimated_score INTEGER NOT NULL,
    math_score INTEGER,
    nature_score INTEGER,
    humanities_score INTEGER,
    languages_score INTEGER,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- INSERIR UM ADMINISTRADOR MASTER PADRÃO
-- IMPORTANTE: Para criar o administrador inicial em produção, execute o SQL abaixo
-- no seu cliente de banco de dados substituindo 'sua_senha_aqui' por uma senha segura.
--
-- INSERT INTO public.admin_users (email, name, role, password_hash) 
-- VALUES ('lucassantos.-@outlook.com', 'Lucas Santos', 'admin', crypt('sua_senha_aqui', gen_salt('bf', 10)))
-- ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- SEED — Multi-Tenancy & RBAC (idempotente)
-- ============================================================

-- Tenant da plataforma (backward-compatible com dados atuais)
INSERT INTO public.tenants (id, name, slug, plan, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'NevaPro', 'nevapro', 'platform', true)
ON CONFLICT (slug) DO NOTHING;

-- Catálogo de permissões (matriz do PRD)
INSERT INTO public.permissions (code, module, description) VALUES
  ('tenants:manage',              'tenants',      'Criar, editar e desativar tenants (somente super_admin).'),
  ('tenants:view_settings',       'tenants',      'Visualizar configurações do tenant.'),
  ('users:manage_admins',         'users',        'Gerenciar administradores de tenants (somente super_admin).'),
  ('users:manage_teachers',       'users',        'Gerenciar professores do tenant.'),
  ('users:manage_students',       'users',        'Gerenciar alunos do tenant (criar, editar, desativar).'),
  ('users:view_self',             'users',        'Visualizar o próprio perfil.'),
  ('questions:create',            'questions',    'Criar questões no banco de questões.'),
  ('questions:delete',            'questions',    'Excluir questões (administrativo).'),
  ('questions:answer',            'questions',    'Responder questões.'),
  ('simulados:publish',           'simulados',    'Publicar e gerenciar simulados.'),
  ('simulados:take',              'simulados',    'Realizar simulados.'),
  ('materials:upload',            'materials',    'Enviar e gerenciar materiais didáticos.'),
  ('mural:post',                  'mural',        'Publicar avisos no mural do tenant.'),
  ('analytics:tenant_summary',    'analytics',    'Acessar relatórios consolidados do tenant.'),
  ('analytics:own_performance',   'analytics',    'Acessar o próprio desempenho e TRI.')
ON CONFLICT (code) DO NOTHING;

-- Papéis padrão (globais — tenant_id NULL)
INSERT INTO public.roles (id, tenant_id, code, name, description) VALUES
  ('10000000-0000-0000-0000-000000000001', NULL, 'super_admin',  'Super Administrador',  'Controle total da plataforma, todos os tenants e banco global de questões.'),
  ('10000000-0000-0000-0000-000000000002', NULL, 'tenant_admin',  'Administrador do Tenant', 'Diretor/coordenador pedagógico da instituição. Gerencia professores, alunos e conteúdo do tenant.'),
  ('10000000-0000-0000-0000-000000000003', NULL, 'teacher',       'Professor',            'Professor/tutor do tenant. Cria conteúdo, simulados e acompanha desempenho.'),
  ('10000000-0000-0000-0000-000000000004', NULL, 'student',       'Estudante',            'Aluno do tenant. Resolve questões/simulados e acumula XP.')
ON CONFLICT (tenant_id, code) WHERE tenant_id IS NULL DO NOTHING;

-- Matriz de permissões por papel (role_permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'tenants:manage','tenants:view_settings','users:manage_admins','users:manage_teachers',
  'users:manage_students','users:view_self','questions:create','questions:delete',
  'questions:answer','simulados:publish','simulados:take','materials:upload',
  'mural:post','analytics:tenant_summary','analytics:own_performance'
)
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'tenants:view_settings','users:manage_teachers','users:manage_students','users:view_self',
  'questions:create','questions:delete','questions:answer','simulados:publish',
  'simulados:take','materials:upload','mural:post','analytics:tenant_summary',
  'analytics:own_performance'
)
WHERE r.code = 'tenant_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'users:manage_students','users:view_self','questions:create','questions:answer',
  'simulados:publish','simulados:take','materials:upload','mural:post',
  'analytics:tenant_summary','analytics:own_performance'
)
WHERE r.code = 'teacher'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'users:view_self','questions:answer','simulados:take','analytics:own_performance'
)
WHERE r.code = 'student'
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÍNDICES PARA CONSULTAS FREQUENTES E PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_answers_user_id ON public.answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_user_created ON public.answers(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_logs_user_id ON public.xp_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_logs_user_created ON public.xp_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_logs_reason ON public.xp_logs(reason);

CREATE INDEX IF NOT EXISTS idx_questions_year ON public.questions(year);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_school ON public.users(school);
CREATE INDEX IF NOT EXISTS idx_users_city ON public.users(city);
CREATE INDEX IF NOT EXISTS idx_users_xp ON public.users(xp DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON public.revoked_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_materials_created ON public.materials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON public.materials(subject);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);

CREATE INDEX IF NOT EXISTS idx_mural_created ON public.mural(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_options_question_id ON public.question_options(question_id);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_user_id ON public.admin_users(auth_user_id);

-- Índices de tenant para consultas escopadas
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON public.tenants(domain);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_user ON public.user_tenant_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_tenant ON public.user_tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_role ON public.user_tenant_roles(role_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_materials_tenant ON public.materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON public.events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mural_tenant ON public.mural(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_simulados_tenant ON public.simulados(tenant_id);
CREATE INDEX IF NOT EXISTS idx_questions_tenant ON public.questions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_answers_tenant ON public.answers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_xp_logs_tenant ON public.xp_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_stats_tenant ON public.user_daily_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_tenant ON public.user_badges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_study_tasks_tenant ON public.user_study_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tri_scores_tenant ON public.user_tri_scores(tenant_id);
