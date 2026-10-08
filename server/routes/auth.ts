import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, authenticateUser, invalidateTokenVersionCache, revokeUserSessions } from '../middleware/auth';
import { getClient, query } from '../../src/lib/db';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { sanitizeInput, normalizeEmail } from '../utils/sanitize';
import { PLATFORM_TENANT_ID } from '../services/rbacService';
import { log } from '../utils/logger';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email';
import { createHash } from 'node:crypto';

/**
 * Tokens de redefinição são armazenados como SHA-256 (nunca em texto claro):
 * um vazamento do banco não permite usar os tokens, assim como password_hash.
 */
const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');


const router = Router();

// ===== Rate limits endurecidos para endpoints de autenticação =====
// Dupla camada: por IP (atacante com 1 IP) + por CONTA (atacante com botnet de
// proxies — a chave é o e-mail alvo, imune a rotação de IP).
// Janelas longas: login 10/5min, recuperação 3/15min (quebra email bombing).
// distributed: usa Redis mesmo remoto — brute force não pode ser por instância.
const loginIpLimiter = rateLimiter(10, 5 * 60_000, { distributed: true });
const loginAccountLimiter = rateLimiter(10, 5 * 60_000, {
  distributed: true,
  keyBy: (req) => normalizeEmail(req.body?.email || ''),
  message: 'Muitas tentativas de login para esta conta. Tente novamente em alguns minutos.',
});
const forgotIpLimiter = rateLimiter(3, 15 * 60_000, { distributed: true });
const forgotAccountLimiter = rateLimiter(2, 15 * 60_000, {
  distributed: true,
  keyBy: (req) => normalizeEmail(req.body?.email || ''),
  message: 'Limite de solicitações de recuperação atingido para este e-mail. Tente novamente em 15 minutos.',
});
const resetIpLimiter = rateLimiter(3, 15 * 60_000, { distributed: true });
const resetAccountLimiter = rateLimiter(5, 15 * 60_000, {
  distributed: true,
  keyBy: (req) => normalizeEmail(req.body?.email || ''),
  message: 'Muitas tentativas de redefinição para esta conta. Tente novamente mais tarde.',
});
const changePwIpLimiter = rateLimiter(3, 15 * 60_000, { distributed: true });
const changePwAccountLimiter = rateLimiter(3, 15 * 60_000, {
  distributed: true,
  keyBy: (req) => normalizeEmail(req.body?.email || ''),
  message: 'Muitas tentativas de alteração de senha para esta conta. Tente novamente mais tarde.',
});

// ============= LOGIN =============
router.post('/login', loginIpLimiter, loginAccountLimiter, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Corpo da requisição inválido.' });
    return;
  }
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }

  const cleanEmail = normalizeEmail(email);

  try {
    // Run reCAPTCHA, brute force check, and auth ALL in parallel for maximum speed
    const [recaptchaResult, lockCheck, authResult] = await Promise.allSettled([
      (async () => {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        const token = req.body?.recaptcha_token;
        if (!secretKey || !token || typeof token !== 'string') return null;
        const params = new URLSearchParams({ secret: secretKey, response: token });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
          const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) return null;
          const data = await response.json() as any;
          return data;
        } catch {
          clearTimeout(timeout);
          return null;
        }
      })(),
      query('SELECT attempts, lock_until FROM public.login_attempts WHERE email = $1', [cleanEmail]),
      authenticateUser(cleanEmail, password),
    ]);

    // Check reCAPTCHA result — em produção, falha de bot BLOQUEIA o login.
    // Erros de browser/domínio não registrado (ex.: browser-error em preview/dev) NÃO bloqueiam usuários legítimos.
    if (recaptchaResult.status === 'fulfilled' && recaptchaResult.value) {
      const recaptchaData = recaptchaResult.value;
      if (recaptchaData.success === false) {
        const errorCodes = recaptchaData['error-codes'] || [];
        const isClientOrConfigError = errorCodes.some(
          (code: string) =>
            code === 'browser-error' ||
            code === 'invalid-input-secret' ||
            code === 'bad-request' ||
            code === 'missing-input-response' ||
            code === 'hostname-mismatch'
        );
        if (isClientOrConfigError) {
          log.info('[Auth] reCAPTCHA erro de ambiente/browser permitido:', errorCodes.join(', '));
        } else {
          log.warn('[Auth] reCAPTCHA falhou no login:', errorCodes.join(', '));
        }
        if (!isClientOrConfigError && process.env.NODE_ENV === 'production') {
          res.status(403).json({ error: 'Verificação de segurança falhou. Tente novamente.' });
          return;
        }
      } else if (typeof recaptchaData.score === 'number' && recaptchaData.score < 0.3) {
        log.warn(`[Auth] reCAPTCHA score muito baixo no login: ${recaptchaData.score}`);
        if (process.env.NODE_ENV === 'production') {
          res.status(403).json({ error: 'Atividade suspeita identificada. Tente novamente mais tarde.' });
          return;
        }
      }
    }

    // Check brute force lock (non-blocking — if query fails, proceed with login)
    if (lockCheck.status === 'fulfilled') {
      const attemptRows = lockCheck.value.rows;
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
    }

    const result = authResult.status === 'fulfilled'
      ? authResult.value
      : { error: 'Falha na autenticação.' };
    
    if (result.error) {
      // Increment failed attempts — atomicamente, para evitar TOCTOU que zera
      // o contador sob requisições paralelas (brute force distribuído).
      try {
        const { rows: upsertRows } = await query(
          `INSERT INTO public.login_attempts (email, attempts, lock_until)
           VALUES ($1, 1, NULL)
           ON CONFLICT (email) DO UPDATE
             SET attempts = login_attempts.attempts + 1,
                 lock_until = CASE
                   WHEN login_attempts.attempts + 1 >= $2
                   THEN NOW() + ($3::bigint || ' milliseconds')::interval
                   ELSE NULL
                 END,
                 updated_at = NOW()
           RETURNING attempts, lock_until`,
          [cleanEmail, MAX_LOGIN_ATTEMPTS, String(LOCKOUT_DURATION_MS)],
        );
        if (upsertRows.length > 0 && upsertRows[0].lock_until) {
          // Alcançou o lockout com este incremento: bloqueia já nesta resposta.
          res.status(429).json({
            error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutos.`,
          });
          return;
        }
      } catch (dbErr) {
        log.error('[Auth] Erro ao registrar tentativa falha:', dbErr);
      }

      res.status(401).json({ error: result.error });
      return;
    }

    // Clear login attempts on success
    await query('DELETE FROM public.login_attempts WHERE email = $1', [cleanEmail]).catch(() => {});

    // Store session token in cookie
    if (result.session?.access_token) {
      res.cookie('session_token', result.session.access_token, {
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
router.post('/register', rateLimiter(5, 15 * 60_000), async (req: AuthenticatedRequest, res: Response) => {
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
    // Check admin email conflict + existing student in parallel
    const [adminCheck, existingCheck] = await Promise.all([
      query('SELECT 1 FROM public.admin_users WHERE email = $1 LIMIT 1', [cleanEmail]),
      dbAdmin.from('users').select('email').eq('email', cleanEmail).maybeSingle(),
    ]);

    // Resposta uniforme para qualquer conflito de e-mail: evita enumeração
    // de contas existentes (inclusive quais são administrativas).
    if (adminCheck.rows.length > 0 || existingCheck.data) {
      res.status(409).json({ error: 'Não foi possível concluir o cadastro com este e-mail. Se for você, tente entrar ou recuperar a senha.' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const newStudentId = crypto.randomUUID();

    const { data, error } = await dbAdmin
      .from('users')
      .insert({
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
      })
      .select('*')
      .single();

    if (error) throw error;

    // Vincula o novo aluno ao papel student no tenant da plataforma (RBAC)
    try {
      await query(
        `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
         SELECT $1, $2, id FROM public.roles WHERE code = 'student' AND tenant_id IS NULL
         ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
        [newStudentId, PLATFORM_TENANT_ID],
      );
    } catch (rbacErr) {
      log.error('[Auth] Erro ao vincular papel student:', rbacErr);
    }

    // Enviar e-mail de boas-vindas assincronamente via Resend
    void sendWelcomeEmail(cleanEmail, safeName || cleanEmail.split('@')[0]).catch((emailErr) => {
      log.error('[Auth] Erro ao enviar e-mail de boas-vindas:', emailErr);
    });

    // Nunca retornar password_hash ao cliente
    const { password_hash: _ignored, ...safeData } = data;
    const userObj = {
      ...safeData,
      id: safeData.id,
      role: 'student' as const,
      answeredQuestions: safeData.answered_questions || 0,
      correctAnswers: safeData.correct_answers || 0,
      avatarUrl: resolveStoredFileUrl(safeData.avatar_url),
      showInLeaderboard: safeData.show_in_leaderboard !== false,
      languagePreference: safeData.language_preference || 'ingles',
    };

    const loginResult = await authenticateUser(cleanEmail, password);
    if (loginResult.error || !loginResult.session?.access_token) {
      throw new Error('Conta criada, mas não foi possível iniciar a sessão.');
    }
    res.cookie('session_token', loginResult.session.access_token, {
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
router.post('/forgot-password', forgotIpLimiter, forgotAccountLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'E-mail é obrigatório.' });
    return;
  }

  const cleanEmail = normalizeEmail(email);

  try {
    const appUrl = process.env.APP_URL || 'https://neva.pro';

    // Check if Admin
    const { data: adminRow } = await dbAdmin
      .from('admin_users')
      .select('name')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (adminRow) {
      // For admins: generate a password reset token stored in password_reset_tokens table
      const resetToken = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      // Delete old tokens for this email
      await query(
        `DELETE FROM public.password_reset_tokens WHERE user_id IN (
           SELECT id FROM public.admin_users WHERE email = $1
         )`,
        [cleanEmail],
      );

      // Insert new token (armazenado como hash — o texto claro só existe no e-mail)
      await query(
        `INSERT INTO public.password_reset_tokens (id, user_id, token, expires_at, created_at)
         SELECT gen_random_uuid(), id, $1, $2, NOW()
         FROM public.admin_users WHERE email = $3`,
        [hashResetToken(resetToken), expiresAt, cleanEmail],
      );

      const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
      // Envio de e-mail não-fatal: a resposta já é genérica (anti-enumeração),
      // então falha de entrega não deve quebrar o fluxo nem vazar existência de conta.
      await sendPasswordResetEmail(cleanEmail, adminRow.name || cleanEmail.split('@')[0], resetLink)
        .catch((emailErr) => {
          log.error('[Forgot Password] Falha no envio (Resend):', emailErr instanceof Error ? emailErr.message : emailErr);
        });
      res.json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes.',
      });
      return;
    }

    // Check Student
    const { data: studentRow } = await dbAdmin
      .from('users')
      .select('id, name')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (studentRow) {
      const resetToken = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await query('DELETE FROM public.password_reset_tokens WHERE user_id = $1', [studentRow.id]);
      await query(
        `INSERT INTO public.password_reset_tokens (id, user_id, token, expires_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
        [studentRow.id, hashResetToken(resetToken), expiresAt],
      );

      const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
      await sendPasswordResetEmail(cleanEmail, studentRow.name || cleanEmail.split('@')[0], resetLink)
        .catch((emailErr) => {
          log.error('[Forgot Password] Falha no envio (Resend):', emailErr instanceof Error ? emailErr.message : emailErr);
        });
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
  resetIpLimiter,
  resetAccountLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const { password, token } = req.body;

    if (!password || password.length < 6) {
      res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
      return;
    }

    try {
      // Student/Admin via DB token (unified flow — both use password_reset_tokens)
      if (token) {
        const { rows: tokenRows } = await query(
          `SELECT prt.user_id, prt.expires_at,
                  CASE WHEN au.id IS NOT NULL THEN 'admin' ELSE 'student' END AS user_type
           FROM public.password_reset_tokens prt
           LEFT JOIN public.admin_users au ON au.id = prt.user_id
           LEFT JOIN public.users u ON u.id = prt.user_id
           WHERE prt.token = $1`,
          [hashResetToken(token)],
        );

        if (tokenRows.length === 0) {
          res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo.' });
          return;
        }

        const tokenRow = tokenRows[0];
        if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
          res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo.' });
          return;
        }

        const bcrypt = await import('bcryptjs');
        const newHash = await bcrypt.hash(password, 10);
        const targetTable = tokenRow.user_type === 'admin' ? 'admin_users' : 'users';

        // Transação única: senha + token_version + DELETE do token. Sem isso,
        // um crash entre statements deixa o token reutilizável (replay).
        const client = await getClient();
        try {
          await client.query('BEGIN');
          // DELETE primeiro e de forma condicional: garante uso único do token
          // mesmo sob requisições paralelas (só uma consegue deletar).
          const del = await client.query(
            'DELETE FROM public.password_reset_tokens WHERE token = $1',
            [hashResetToken(token)],
          );
          if (del.rowCount === 0) {
            await client.query('ROLLBACK');
            res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo.' });
            return;
          }
          await client.query(
            `UPDATE public.${targetTable} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [newHash, tokenRow.user_id],
          );
          // Revoga todas as sessões ativas do usuário (senhas comprometidas etc.)
          try {
            await client.query(
              `UPDATE public.${targetTable} SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1`,
              [tokenRow.user_id],
            );
          } catch {
            // coluna opcional até a migração rodar — não aborta a troca de senha
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
        invalidateTokenVersionCache(tokenRow.user_id);
        void revokeUserSessions(tokenRow.user_id).catch(() => {});

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
router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  // Revogação server-side: bump de token_version invalida o token HMAC mesmo
  // que o cookie tenha sido capturado (logout apenas no cookie não revoga).
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return;
  }
  try {
    const targetTable = user.role === 'admin' ? 'admin_users' : 'users';
    const { rows } = await query(
      `UPDATE public.${targetTable}
       SET token_version = COALESCE(token_version, 0) + 1
       WHERE id = $1
       RETURNING token_version`,
      [user.userId],
    );
    if (rows.length === 0) {
      res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      return;
    }
    invalidateTokenVersionCache(user.userId);
    await revokeUserSessions(user.userId);
  } catch (err) {
    log.error('[Logout] Falha ao revogar sessão:', err);
    res.status(500).json({ error: 'Não foi possível encerrar a sessão.' });
    return;
  }
  // Clear session cookie
  res.clearCookie('session_token', {
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
  changePwIpLimiter,
  changePwAccountLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
      return;
    }

    const cleanEmail = normalizeEmail(email);

    // Política: troca de senha restrita à própria conta (admins usam fluxo
    // próprio de redefinição em /api/admin).
    if (req.user?.email !== cleanEmail) {
      res.status(403).json({ error: 'Acesso negado: você só pode alterar a própria senha.' });
      return;
    }

    try {
      const bcrypt = await import('bcryptjs');

      // 1. Check Admin user
      const { data: adminRow } = await dbAdmin
        .from('admin_users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (adminRow) {
        const { data: fullAdmin } = await dbAdmin
          .from('admin_users')
          .select('password_hash')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (!fullAdmin?.password_hash) {
          res.status(401).json({ error: 'Senha atual incorreta.' });
          return;
        }

        const isValidCurrent = await bcrypt.compare(currentPassword, fullAdmin.password_hash).catch(() => false);
        if (!isValidCurrent) {
          res.status(401).json({ error: 'Senha atual incorreta.' });
          return;
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await query(
          'UPDATE public.admin_users SET password_hash = $1, updated_at = NOW(), token_version = COALESCE(token_version, 0) + 1 WHERE email = $2 RETURNING id',
          [newHash, cleanEmail],
        );
        if (adminRow?.id) {
          invalidateTokenVersionCache(adminRow.id as string);
          void revokeUserSessions(adminRow.id as string).catch(() => {});
        }

        res.json({ success: true, message: 'Senha atualizada com sucesso.' });
        return;
      }

      // 2. Check Student user
      const { data: studentRow } = await dbAdmin
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
      const { error: updateErr } = await dbAdmin
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('email', cleanEmail);

      if (updateErr) throw updateErr;

      // Revoga as outras sessões do aluno após troca de senha
      if (studentRow?.id) {
        await query(
          'UPDATE public.users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1',
          [studentRow.id],
        ).catch(() => {});
        invalidateTokenVersionCache(studentRow.id);
        void revokeUserSessions(studentRow.id).catch(() => {});
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
