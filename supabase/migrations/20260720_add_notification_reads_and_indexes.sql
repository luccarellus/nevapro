-- ============================================================
-- Migration: notification_reads + índices faltantes
-- ============================================================

-- 1. TABELA NOTIFICATION_READS
-- Permite rastrear quais usuários leram notificações globais (user_id IS NULL).
-- Para notificações com user_id definido, o campo is_read da própria tabela
-- ainda é usado (otimização para o caso comum).

CREATE TABLE IF NOT EXISTS public.notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, notification_id)
);

-- Índices para consultas frequentes em notification_reads
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON public.notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id ON public.notification_reads(notification_id);

-- Habilita RLS (consistente com as demais tabelas)
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: admins podem tudo, usuários podem ver apenas seus próprios registros
DROP POLICY IF EXISTS "notification_reads_select_own" ON public.notification_reads;
CREATE POLICY "notification_reads_select_own" ON public.notification_reads
    FOR SELECT TO authenticated
    USING (
        user_id IN (SELECT id FROM public.users WHERE email = auth.jwt() ->> 'email')
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "notification_reads_insert_own" ON public.notification_reads;
CREATE POLICY "notification_reads_insert_own" ON public.notification_reads
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id IN (SELECT id FROM public.users WHERE email = auth.jwt() ->> 'email')
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "notification_reads_delete" ON public.notification_reads;
CREATE POLICY "notification_reads_delete" ON public.notification_reads
    FOR DELETE TO authenticated
    USING (public.is_admin());

REVOKE ALL ON public.notification_reads FROM anon;


-- 2. ÍNDICES FALTANTES PARA PERFORMANCE

-- Índice composto para consultas de notificações por tipo (usado no addNotification)
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Índice composto para consultas de eventos por data + tipo
CREATE INDEX IF NOT EXISTS idx_events_date_type ON public.events(date, type);

-- Índice composto para consultas de respostas incorretas (caderno de erros)
CREATE INDEX IF NOT EXISTS idx_answers_user_correct ON public.answers(user_id, is_correct);

-- Índice para materiais por tipo (filtro pdf/video/link)
CREATE INDEX IF NOT EXISTS idx_materials_type ON public.materials(type);

-- Índice composto para XP logs por razão + usuário (Flash Quiz check)
CREATE INDEX IF NOT EXISTS idx_xp_logs_reason_user ON public.xp_logs(reason, user_id);

-- Índice para consultas de notificações por created_at (ordenar por data)
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);
