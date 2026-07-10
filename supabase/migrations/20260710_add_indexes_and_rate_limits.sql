-- Migration: Add indexes for frequently queried columns, rate_limits table, and cleanup
-- This migration improves query performance and adds DB-backed rate limiting support

BEGIN;

-- ============================================================
-- 1. ÍNDICES PARA CONSULTAS FREQUENTES
-- ============================================================

-- answers: filtrado por user_id e question_id (Caderno de Erros, estatísticas)
CREATE INDEX IF NOT EXISTS idx_answers_user_id ON public.answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_user_created ON public.answers(user_id, created_at DESC);

-- xp_logs: filtrado por user_id e created_at (gráficos semanais)
CREATE INDEX IF NOT EXISTS idx_xp_logs_user_id ON public.xp_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_logs_user_created ON public.xp_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_logs_reason ON public.xp_logs(reason);

-- questions: filtrado por year (busca de questões ENEM)
CREATE INDEX IF NOT EXISTS idx_questions_year ON public.questions(year);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);

-- users: filtros comuns no admin
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_school ON public.users(school);
CREATE INDEX IF NOT EXISTS idx_users_city ON public.users(city);
CREATE INDEX IF NOT EXISTS idx_users_xp ON public.users(xp DESC);

-- notifications: consulta por user_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);

-- login_attempts: consulta por email
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email);

-- revoked_tokens: limpeza por expires_at
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON public.revoked_tokens(expires_at);

-- materials: ordenação por data
CREATE INDEX IF NOT EXISTS idx_materials_created ON public.materials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON public.materials(subject);

-- events: ordenação por data
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);

-- mural: ordenação por criação
CREATE INDEX IF NOT EXISTS idx_mural_created ON public.mural(created_at DESC);

-- question_options: FK para questions
CREATE INDEX IF NOT EXISTS idx_question_options_question_id ON public.question_options(question_id);

-- admin_users: consulta por email
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);


-- ============================================================
-- 2. TABELA rate_limits (Rate Limiter DB-backed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key VARCHAR(500) PRIMARY KEY,
    count INTEGER DEFAULT 1,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON public.rate_limits(expires_at);


-- ============================================================
-- 3. REMOVER COLUNA 'read' OBSOLETA DA TABELA notifications
-- ============================================================
-- A coluna 'read' boolean é duplicada de 'is_read' e não é usada pelo frontend
ALTER TABLE public.notifications DROP COLUMN IF EXISTS read;


-- ============================================================
-- 4. ADICIONAR COLUNA flash_quiz_completed EM admin_users SE NÃO EXISTIR
-- ============================================================
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS flash_quiz_completed BOOLEAN DEFAULT false;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS answered_questions INTEGER DEFAULT 0;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS correct_answers INTEGER DEFAULT 0;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;

COMMIT;
