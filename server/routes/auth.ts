import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, authenticateUser } from '../middleware/auth';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { query } from '../../src/lib/db';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { sanitizeInput, normalizeEmail } from '../utils/sanitize';
import { PLATFORM_TENANT_ID } from '../services/rbacService';
import { log } from '../utils/logger';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email';


const router = Router();

// ============= LOGIN =============
router.post('/login', rateLimiter(5, 60_000), verifyRecaptcha(), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }

  const cleanEmail = normalizeEmail(email);

  // Brute force lock check
  try {
    const { rows: attemptRows } = await query(
      'SELECT attempts, lock_until FROM public.login_attempts WHERE email = $1',
      [cleanEmail],
    );
    if (attemptRows.length > 0) {
      const attempt = attemptRows[0];
      if (attempt.lock_until && Date.now() < new Date(attempt.lock_until).getTime()) {
        const waitTime = Math.ceil(
          (new Date(attempt.lock_until).getTime() - Date.now()) / 60000,
        );
        res.status(429).json({
          error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${waitTime} minutos.`,
        });
        return;
      }
    }
  } catch (err) {
    log.error('[Auth Lock Check] Erro:', err);
  }

  try {
    const result = await authenticateUser(cleanEmail, password);
    
    if (result.error) {
      // Increment failed attempts
      try {
        const { rows: currentAttemptRows } = await query(
          'SELECT attempts FROM public.login_attempts WHERE email = $1',
          [cleanEmail],
        );
        if (currentAttemptRows.length > 0) {
          const newAttempts = currentAttemptRows[0].attempts + 1;
          const lockUntil =
            newAttempts >= MAX_LOGIN_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
              : null;
          await query(
            'UPDATE public.login_attempts SET attempts = $1, lock_until = $2, updated_at = NOW() WHERE email = $3',
            [newAttempts, lockUntil, cleanEmail],
          );
        } else {
          await query(
            'INSERT INTO public.login_attempts (email, attempts, lock_until) VALUES ($1, 1, NULL)',
            [cleanEmail],
          );
        }
      } catch (dbErr) {
        log.error('[Auth] Erro ao registrar tentativa falha:', dbErr);
      }

      res.status(401).json({ error: result.error });
      return;
    }

    // Clear login attempts on success
    await query('DELETE FROM public.login_attempts WHERE email = $1', [cleanEmail]).catch(() => {});

    // Store Supabase session token in cookie
    if (result.session?.access_token) {
      res.cookie('sb_session_token', result.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });
    }

    res.json({ success: true, user: result.user });
  } catch (err) {
    log.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Falha na autenticação.' });
  }
});

// ============= REGISTER =============
router.post('/register', rateLimiter(5, 60_000), verifyRecaptcha(), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, city, school, gremio } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
    return;
  }

  const cleanEmail = normalizeEmail(email);
  const safeName = sanitizeInput(name);
  const safeCity = sanitizeInput(city);
  const safeSchool = sanitizeInput(school);
  const safeGremio = sanitizeInput(gremio);

  try {
    // Check admin email conflict
    const { rows: adminExists } = await query(
      'SELECT 1 FROM public.admin_users WHERE email = $1 LIMIT 1',
      [cleanEmail],
    );
    if (adminExists.length > 0) {
      res.status(403).json({ error: 'E-mails administrativos devem ser gerenciados pelo banco de dados.' });
      return;
    }

    // Check existing student
    const { data: existing } = await getSupabaseAdminClient()
      .from('users')
      .select('email')
      .eq('email', cleanEmail)
      .maybeSingle();
    if (existing) {
      res.status(400).json({ error: 'E-mail já cadastrado.' });
      return;
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const newStudentId = crypto.randomUUID();

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([
        {
          id: newStudentId,
          email: cleanEmail,
          name: safeName || cleanEmail.split('@')[0],
          password_hash: passwordHash,
          role: 'student',
          tenant_id: PLATFORM_TENANT_ID,
          city: safeCity,
          school: safeSchool,
          gremio: safeGremio,
          xp: 0,
          level: 1,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Vincula o novo aluno ao papel student no tenant da plataforma (RBAC)
    try {
      const { rows } = await query(
        `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
         SELECT $1, $2, id FROM public.roles WHERE code = 'student' AND tenant_id IS NULL
         ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
        [newStudentId, PLATFORM_TENANT_ID],
      );
      void rows;
    } catch (rbacErr) {
      log.error('[Auth] Erro ao vincular papel student:', rbacErr);
    }

    // Enviar e-mail de boas-vindas assincronamente via Resend
    void sendWelcomeEmail(cleanEmail, safeName || cleanEmail.split('@')[0]).catch((emailErr) => {
      log.error('[Auth] Erro ao enviar e-mail de boas-vindas:', emailErr);
    });

    const userObj = {

      ...data,
      id: data.id,
      role: 'student' as const,
      answeredQuestions: data.answered_questions || 0,
      correctAnswers: data.correct_answers || 0,
      avatarUrl: resolveStoredFileUrl(data.avatar_url),
      showInLeaderboard: data.show_in_leaderboard !== false,
      languagePreference: data.language_preference || 'ingles',
    };

    const loginResult = await authenticateUser(cleanEmail, password);
    if (loginResult.error || !loginResult.session?.access_token) {
      throw new Error('Conta criada, mas não foi possível iniciar a sessão.');
    }
    res.cookie('sb_session_token', loginResult.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ success: true, user: userObj });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Auth] Register error:', errorMessage);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// ============= FORGOT PASSWORD (solicitar link de recuperação) =============
router.post('/forgot-password', rateLimiter(3, 60_000), verifyRecaptcha(), async (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'E-mail é obrigatório.' });
    return;
  }

  const cleanEmail = normalizeEmail(email);

  try {
    const appUrl = process.env.APP_URL || 'https://neva.pro';
    const supabase = getSupabaseAdminClient();

    // Check if Admin
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('name')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (adminRow) {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
        options: { redirectTo: `${appUrl}/reset-password` },
      });

      if (data?.properties?.action_link) {
        await sendPasswordResetEmail(cleanEmail, adminRow.name || cleanEmail.split('@')[0], data.properties.action_link);
      }
      res.json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes.',
      });
      return;
    }

    // Check Student
    const { data: studentRow } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (studentRow) {
      const resetToken = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await supabase.from('password_reset_tokens').delete().eq('user_id', studentRow.id);
      await supabase.from('password_reset_tokens').insert([{
        user_id: studentRow.id,
        token: resetToken,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      }]);

      const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
      await sendPasswordResetEmail(cleanEmail, studentRow.name || cleanEmail.split('@')[0], resetLink);
    }

    // Generic response
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes.',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Forgot Password] Error:', errorMessage);
    res.status(500).json({ error: 'Erro ao solicitar recuperação de senha.' });
  }
});

// ============= RESET PASSWORD =============
router.post(
  '/reset-password',
  rateLimiter(3, 60_000),
  verifyRecaptcha(),
  async (req: AuthenticatedRequest, res: Response) => {
    const { password, access_token, token, email } = req.body;

    if (!password || password.length < 6) {
      res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
      return;
    }

    try {
      const supabase = getSupabaseAdminClient();

      // Admin via Supabase Auth access_token
      if (access_token) {
        const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
        if (userError || !userData?.user) {
          res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo.' });
          return;
        }

        const { error: updateError } = await supabase.auth.admin.updateUserById(userData.user.id, {
          password,
        });

        if (updateError) {
          res.status(400).json({ error: updateError.message || 'Erro ao redefinir senha.' });
          return;
        }

        res.json({ success: true, message: 'Senha redefinida com sucesso.' });
        return;
      }

      // Student via DB token
      if (token) {
        const { data: tokenRow } = await supabase
          .from('password_reset_tokens')
          .select('user_id, expires_at')
          .eq('token', token)
          .maybeSingle();

        if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
          res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo.' });
          return;
        }

        const bcrypt = await import('bcryptjs');
        const newHash = await bcrypt.hash(password, 10);

        const { error: updateErr } = await supabase
          .from('users')
          .update({ password_hash: newHash, updated_at: new Date().toISOString() })
          .eq('id', tokenRow.user_id);

        if (updateErr) throw updateErr;

        await supabase.from('password_reset_tokens').delete().eq('user_id', tokenRow.user_id);

        res.json({ success: true, message: 'Senha redefinida com sucesso.' });
        return;
      }

      res.status(400).json({ error: 'Token de recuperação ausente. O link pode ter expirado.' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('[Reset Password] Error:', errorMessage);
      res.status(500).json({ error: 'Erro interno ao redefinir senha.' });
    }
  },
);

// ============= LOGOUT =============
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  // Revoke Supabase session
  try {
    const sbToken = req.cookies?.sb_session_token;
    if (sbToken) {
      const { getSupabaseAnonClient } = await import('../lib/dbQueryBuilder');
      await getSupabaseAnonClient().auth.signOut();
    }
  } catch {
    // Fallback: apenas limpa o cookie mesmo se o signOut falhar
  }

  // Clear session cookie
  res.clearCookie('sb_session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ success: true });
});

// ============= CHANGE PASSWORD =============
router.post(
  '/change-password',
  rateLimiter(3, 60_000),
  verifyRecaptcha(),
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
      return;
    }

    const cleanEmail = normalizeEmail(email);

    if (req.user?.role !== 'admin' && req.user?.email !== cleanEmail) {
      res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
      return;
    }

    try {
      const supabase = getSupabaseAdminClient();
      const bcrypt = await import('bcryptjs');

      // 1. Check Admin user
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('auth_user_id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (adminRow) {
        const { getSupabaseAnonClient } = await import('../lib/dbQueryBuilder');
        const { error: authError } = await getSupabaseAnonClient().auth.signInWithPassword({
          email: cleanEmail,
          password: currentPassword,
        });

        if (authError) {
          res.status(401).json({ error: 'Senha atual incorreta.' });
          return;
        }

        const targetAuthUserId = adminRow?.auth_user_id || req.user?.authUserId;
        if (targetAuthUserId) {
          await supabase.auth.admin.updateUserById(targetAuthUserId, {
            password: newPassword,
          });
        }

        res.json({ success: true, message: 'Senha atualizada com sucesso.' });
        return;
      }

      // 2. Check Student user
      const { data: studentRow } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!studentRow || !studentRow.password_hash) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const isValidCurrent = await bcrypt.compare(currentPassword, studentRow.password_hash).catch(() => false);
      if (!isValidCurrent) {
        res.status(401).json({ error: 'Senha atual incorreta.' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('email', cleanEmail);

      if (updateErr) throw updateErr;

      res.json({ success: true, message: 'Senha atualizada com sucesso.' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('[Change Password] Error:', errorMessage);
      res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
    }
  },
);

export default router;
