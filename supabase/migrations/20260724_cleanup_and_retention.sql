-- ============================================================
-- MIGRAÇÃO DE LIMPEZA E RETENÇÃO AUTOMÁTICA DE LOGS E TOKENS
-- Data: 24/07/2026
-- ============================================================

CREATE OR REPLACE FUNCTION public.clean_unnecessary_logs()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    deleted_audit_logs INT := 0;
    deleted_refresh_tokens INT := 0;
    deleted_login_attempts INT := 0;
    deleted_consent_logs INT := 0;
    deleted_revoked_tokens INT := 0;
    deleted_reset_tokens INT := 0;
    result JSON;
BEGIN
    -- 1. Limpeza dos logs de auditoria do Supabase Auth (retenção de 14 dias)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'audit_log_entries') THEN
        DELETE FROM auth.audit_log_entries
        WHERE created_at < NOW() - INTERVAL '14 days';
        GET DIAGNOSTICS deleted_audit_logs = ROW_COUNT;
    END IF;

    -- 2. Limpeza de refresh tokens revogados ou antigos no Supabase Auth (retenção de 14 dias)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'refresh_tokens') THEN
        DELETE FROM auth.refresh_tokens
        WHERE revoked = true 
           OR updated_at < NOW() - INTERVAL '14 days'
           OR created_at < NOW() - INTERVAL '30 days';
        GET DIAGNOSTICS deleted_refresh_tokens = ROW_COUNT;
    END IF;

    -- 3. Limpeza de tentativas de login antigas/desbloqueadas no schema public (retenção de 7 dias)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'login_attempts') THEN
        DELETE FROM public.login_attempts
        WHERE updated_at < NOW() - INTERVAL '7 days'
           OR (lock_until IS NOT NULL AND lock_until < NOW() - INTERVAL '1 day');
        GET DIAGNOSTICS deleted_login_attempts = ROW_COUNT;
    END IF;

    -- 4. Limpeza de logs de consentimento LGPD antigos (retenção de 90 dias)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consent_logs') THEN
        DELETE FROM public.consent_logs
        WHERE created_at < NOW() - INTERVAL '90 days';
        GET DIAGNOSTICS deleted_consent_logs = ROW_COUNT;
    END IF;

    -- 5. Limpeza de tokens revogados customizados expirados
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'revoked_tokens') THEN
        DELETE FROM public.revoked_tokens
        WHERE expires_at < NOW();
        GET DIAGNOSTICS deleted_revoked_tokens = ROW_COUNT;
    END IF;

    -- 6. Limpeza de tokens de redefinição de senha expirados
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'password_reset_tokens') THEN
        DELETE FROM public.password_reset_tokens
        WHERE expires_at < NOW();
        GET DIAGNOSTICS deleted_reset_tokens = ROW_COUNT;
    END IF;

    -- Monta o resumo em JSON
    result := json_build_object(
        'timestamp', NOW(),
        'deleted_audit_logs', deleted_audit_logs,
        'deleted_refresh_tokens', deleted_refresh_tokens,
        'deleted_login_attempts', deleted_login_attempts,
        'deleted_consent_logs', deleted_consent_logs,
        'deleted_revoked_tokens', deleted_revoked_tokens,
        'deleted_reset_tokens', deleted_reset_tokens
    );

    RETURN result;
END;
$$;

-- Concede permissão de execução para a função aos papéis postgres e service_role
GRANT EXECUTE ON FUNCTION public.clean_unnecessary_logs() TO postgres, service_role;
