-- ============================================================================
-- Neva Pro — Migração: Multi-Tenancy + RBAC (Role-Based Access Control)
-- Data: 2026-08-13
--
-- Aplicável a bancos existentes (idempotente). Para instalações novas, o
-- mesmo modelo já está contemplado em supabase/schema.sql.
--
-- Modelo:
--   tenants          → Instituições/entidades (escolas, cursinhos, grêmios)
--   roles            → Papéis globais (tenant_id NULL) ou por tenant
--   permissions      → Catálogo de permissões granulares (ex.: materials:upload)
--   role_permissions → Matriz papel ↔ permissão
--   user_tenant_roles→ Vínculo usuário ↔ tenant ↔ papel
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABELA TENANTS
-- ============================================================================
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

-- ============================================================================
-- 2. TABELA ROLES (papéis globais têm tenant_id NULL)
-- ============================================================================
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

-- ============================================================================
-- 3. TABELA PERMISSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 4. TABELA ROLE_PERMISSIONS (matriz papel ↔ permissão)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================================
-- 5. TABELA USER_TENANT_ROLES (vínculo usuário ↔ tenant ↔ papel)
--    user_id referencia public.users OU public.admin_users (polimórfico).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_tenant_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, tenant_id, role_id)
);

-- ============================================================================
-- 6. COLUNAS tenant_id NAS TABELAS EXISTENTES
-- ============================================================================
ALTER TABLE public.users            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.admin_users      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.materials        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.events           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.mural            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.simulados        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.questions        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.answers          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_daily_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.xp_logs          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_badges      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_study_tasks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_tri_scores  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ============================================================================
-- 7. ÍNDICES DE TENANT PARA CONSULTAS ESCOPADAS
-- ============================================================================
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

-- ============================================================================
-- 8. SEED — Tenant da plataforma, permissões e papéis padrão
-- ============================================================================

-- 8.1 Tenant da plataforma (backward-compatible com dados atuais)
INSERT INTO public.tenants (id, name, slug, plan, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'NevaPro', 'nevapro', 'platform', true)
ON CONFLICT (slug) DO NOTHING;

-- 8.2 Catálogo de permissões (matriz do PRD)
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

-- 8.3 Papéis padrão (globais — tenant_id NULL)
INSERT INTO public.roles (id, tenant_id, code, name, description) VALUES
  ('10000000-0000-0000-0000-000000000001', NULL, 'super_admin',  'Super Administrador',  'Controle total da plataforma, todos os tenants e banco global de questões.'),
  ('10000000-0000-0000-0000-000000000002', NULL, 'tenant_admin',  'Administrador do Tenant', 'Diretor/coordenador pedagógico da instituição. Gerencia professores, alunos e conteúdo do tenant.'),
  ('10000000-0000-0000-0000-000000000003', NULL, 'teacher',       'Professor',            'Professor/tutor do tenant. Cria conteúdo, simulados e acompanha desempenho.'),
  ('10000000-0000-0000-0000-000000000004', NULL, 'student',       'Estudante',            'Aluno do tenant. Resolve questões/simulados e acumula XP.')
ON CONFLICT (tenant_id, code) WHERE tenant_id IS NULL DO NOTHING;

-- 8.4 Matriz de permissões por papel (role_permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  -- super_admin: todas as permissões
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

-- 8.5 Backfill: vincula usuários existentes ao tenant da plataforma
--      (admin_users → tenant_admin, users → student), preservando o legado.
INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
SELECT au.id, '00000000-0000-0000-0000-000000000001', r.id
FROM public.admin_users au
JOIN public.roles r ON r.code = 'tenant_admin' AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
SELECT u.id, '00000000-0000-0000-0000-000000000001', r.id
FROM public.users u
JOIN public.roles r ON r.code = 'student' AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- 8.6 Atualiza tenant_id padrão nas linhas existentes
UPDATE public.users      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.admin_users SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.materials  SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.events     SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.mural      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.simulados  SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.answers    SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.xp_logs    SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.user_daily_stats SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.user_badges SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.user_study_tasks SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.user_tri_scores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

COMMIT;
