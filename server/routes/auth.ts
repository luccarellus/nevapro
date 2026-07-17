import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, authenticateUser } from '../middleware/auth';
import { query } from '../../src/lib/db';
import { getSupabaseAdminClient } from '../../src/lib/dbQueryBuilder';
import { sanitizeInput, normalizeEmail } from '../utils/sanitize';
import { log } from '../utils/logger';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } from '../types';

const router = Router();

// ============= LOGIN =============
router.post('/login', rateLimiter(5, 60_000), async (req: AuthenticatedRequest, res: Response) => {
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
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
    }

    // Also set legacy cookie for backward compat
    res.cookie('session_token', `${result.user.id}:${cleanEmail}:${result.user.role}:${Date.now() + 86400000}:placeholder`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, user: result.user });
  } catch (err) {
    log.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Falha na autenticação.' });
  }
});

// ============= REGISTER =============
router.post('/register', rateLimiter(5, 60_000), async (req: AuthenticatedRequest, res: Response) => {
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

    // Create in our database
    const { data, error } = await getSupabaseAdminClient()
      .from('users')
      .insert([
        {
          email: cleanEmail,
          name: safeName || cleanEmail.split('@')[0],
          role: 'student',
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

    const userObj = {
      ...data,
      id: data.id,
      role: 'student' as const,
      answeredQuestions: data.answered_questions || 0,
      correctAnswers: data.correct_answers || 0,
      avatarUrl: data.avatar_url || '',
      showInLeaderboard: data.show_in_leaderboard !== false,
      languagePreference: data.language_preference || 'ingles',
    };

    // Set session cookie
    res.cookie('session_token', `${userObj.id}:${cleanEmail}:student:${Date.now() + 86400000}:placeholder`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ success: true, user: userObj });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Auth] Register error:', errorMessage);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// ============= LOGOUT =============
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  // Clear session cookies
  res.clearCookie('sb_session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.clearCookie('session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ success: true });
});

// ============= CHANGE PASSWORD =============
router.post(
  '/change-password',
  rateLimiter(3, 60_000),
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
      // Verify current password via Supabase Auth
      const { getSupabaseAnonClient } = await import('../../src/lib/dbQueryBuilder');
      const { error: authError } = await getSupabaseAnonClient().auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword,
      });

      if (authError) {
        res.status(401).json({ error: 'Senha atual incorreta.' });
        return;
      }

      // Update password via Supabase Auth admin API
      const supabase = getSupabaseAdminClient();
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('auth_user_id')
        .eq('email', cleanEmail)
        .maybeSingle();

      const targetAuthUserId = adminRow?.auth_user_id || req.user?.authUserId;
      if (targetAuthUserId) {
        await supabase.auth.admin.updateUserById(targetAuthUserId, {
          password: newPassword,
        });
      }

      // For students, also update the password_hash in users table
      const isAdmin = !!adminRow;
      if (!isAdmin) {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await supabase.from('users').update({ password_hash: hashedPassword }).eq('email', cleanEmail);
      }

      res.json({ success: true, message: 'Senha atualizada com sucesso.' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('[Change Password] Error:', errorMessage);
      res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
    }
  },
);

export default router;
