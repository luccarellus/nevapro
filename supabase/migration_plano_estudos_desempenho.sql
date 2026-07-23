-- MIGRATION: Suporte para Plano de Estudos e Desempenho TRI no Supabase
-- Execute este script no SQL Editor do seu projeto Supabase se desejar persistir as tarefas e notas no banco.

-- 1. Tabela de Tarefas Diárias do Plano de Estudos
CREATE TABLE IF NOT EXISTS public.user_study_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    estimated_time VARCHAR(50),
    target_tab VARCHAR(50) DEFAULT 'questions',
    done BOOLEAN DEFAULT false,
    task_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index para busca rápida de tarefas do dia por usuário
CREATE INDEX IF NOT EXISTS idx_user_study_tasks_user_date ON public.user_study_tasks(user_id, task_date);

-- 2. Tabela de Histórico de Notas TRI Estimadas
CREATE TABLE IF NOT EXISTS public.user_tri_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    estimated_score INTEGER NOT NULL,
    math_score INTEGER,
    nature_score INTEGER,
    humanities_score INTEGER,
    languages_score INTEGER,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index para histórico do aluno
CREATE INDEX IF NOT EXISTS idx_user_tri_scores_user ON public.user_tri_scores(user_id, calculated_at DESC);

-- 3. Adicionar campo de Meta TRI do Aluno na tabela de usuários
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tri_target_score INTEGER DEFAULT 750;

-- 4. Habilitar RLS (Row Level Security) para segurança das novas tabelas
ALTER TABLE public.user_study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tri_scores ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para user_study_tasks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_user_study_tasks') THEN
        CREATE POLICY service_role_all_user_study_tasks ON public.user_study_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_user_study_tasks') THEN
        CREATE POLICY authenticated_read_user_study_tasks ON public.user_study_tasks FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE lower(email) = public.jwt_email()));
    END IF;
END $$;

-- Políticas de RLS para user_tri_scores
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_user_tri_scores') THEN
        CREATE POLICY service_role_all_user_tri_scores ON public.user_tri_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_user_tri_scores') THEN
        CREATE POLICY authenticated_read_user_tri_scores ON public.user_tri_scores FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE lower(email) = public.jwt_email()));
    END IF;
END $$;
