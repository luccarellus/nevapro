import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';
import { dbAdmin, getSupabaseAdminClient, getSupabaseAnonClient } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { createHash } from 'node:crypto';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';

import bcrypt from 'bcryptjs';

// Extend Express Request globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies a session token (Supabase Auth for admin, cached session for student).
 */
const verifySupabaseSession = async (token: string): Promise<AuthenticatedUser | null> => {
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const cachedUser = await getUserCache<AuthenticatedUser>(userCacheKeys.auth(tokenHash));
    if (cachedUser) return cachedUser;

    // Check if token is a Supabase Auth token (for Admin)
    const { data: userData } = await getSupabaseAdminClient().auth.getUser(token).catch(() => ({ data: null }));
    if (userData?.user?.email) {
      const email = userData.user.email.toLowerCase().trim();
      const { data: adminRow } = await getSupabaseAdminClient()
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (adminRow) {
        const authenticatedUser: AuthenticatedUser = {
          userId: adminRow.id,
          email,
          role: 'admin',
          authUserId: userData.user.id,
        };
        await setUserCache(userCacheKeys.auth(tokenHash), authenticatedUser, 60);
        return authenticatedUser;
      }
    }

    return null;
  } catch (err) {
    log.error('[Auth] Error verifying session:', err);
    return null;
  }
};

/**
 * Middleware: Requires valid Auth session (via Cookie or Bearer Token).
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    let token: string | undefined = req.cookies?.sb_session_token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token) {
      res.status(401).json({ error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
      return;
    }

    const user = await verifySupabaseSession(token);
    if (user) {
      req.user = user;
      return next();
    }

    res.status(401).json({ error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
  } catch (err) {
    log.error('[Auth Middleware] Error:', err);
    res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
};

/**
 * Middleware: Requires the authenticated user to have admin role.
 * Must be used AFTER requireAuth.
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado: recursos exclusivos de administrador.' });
      return;
    }
    next();
  });
};

/**
 * Creates or ensures admin_users record for a Supabase Auth user.
 * Auto-links auth_user_id to admin_users table.
 */
export const ensureAdminUser = async (email: string, authUserId: string): Promise<void> => {
  try {
    const { data: existing } = await getSupabaseAdminClient()
      .from('admin_users')
      .select('id, auth_user_id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      if (!existing.auth_user_id || existing.auth_user_id !== authUserId) {
        await query(
          'UPDATE public.admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2',
          [authUserId, email],
        );
      }
    } else {
      const name = email.split('@')[0];
      await getSupabaseAdminClient().from('admin_users').insert([
        {
          email,
          name,
          role: 'admin',
          auth_user_id: authUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (err) {
    log.error('[ensureAdminUser] Error:', err);
  }
};

/**
 * Unified login:
 * - Admin users: Authenticate via Supabase Auth (auth.users + admin_users).
 * - Students: Authenticate via DB public.users password_hash (bcrypt). NEVER registered in Supabase Auth!
 */
export const authenticateUser = async (email: string, password: string) => {
  const cleanEmail = email.toLowerCase().trim();

  // 1. Check if user is an Admin
  const { data: adminRow } = await getSupabaseAdminClient()
    .from('admin_users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (adminRow) {
    const supabase = getSupabaseAnonClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !authData.user || !authData.session) {
      return { error: 'E-mail ou senha inválidos.' };
    }

    const authUserId = authData.user.id;
    if (adminRow.auth_user_id !== authUserId) {
      await ensureAdminUser(cleanEmail, authUserId);
    }

    return {
      user: {
        ...adminRow,
        id: adminRow.id,
        role: 'admin',
        answeredQuestions: adminRow.answered_questions || 0,
        correctAnswers: adminRow.correct_answers || 0,
        avatarUrl: resolveStoredFileUrl(adminRow.avatar_url),
      },
      session: authData.session,
    };
  }

  // 2. Check if user is a Student (public.users)
  const { data: studentRow } = await getSupabaseAdminClient()
    .from('users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (studentRow) {
    if (!studentRow.password_hash) {
      return { error: 'E-mail ou senha inválidos.' };
    }

    const passwordIsValid = await bcrypt.compare(password, studentRow.password_hash).catch(() => false);
    if (!passwordIsValid) {
      return { error: 'E-mail ou senha inválidos.' };
    }

    // Generate student session token & cache it
    const sessionToken = `st_${studentRow.id}_${crypto.randomUUID().replace(/-/g, '')}`;
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');

    const authenticatedUser: AuthenticatedUser = {
      userId: studentRow.id,
      email: cleanEmail,
      role: 'student',
    };

    // Cache student session for 24 hours
    await setUserCache(userCacheKeys.auth(tokenHash), authenticatedUser, 24 * 60 * 60);

    return {
      user: {
        ...studentRow,
        id: studentRow.id,
        role: 'student',
        answeredQuestions: studentRow.answered_questions || studentRow.answeredQuestions || 0,
        correctAnswers: studentRow.correct_answers || studentRow.correctAnswers || 0,
        avatarUrl: resolveStoredFileUrl(studentRow.avatar_url || studentRow.avatarUrl || studentRow.avatar),
        showInLeaderboard: studentRow.show_in_leaderboard !== false,
        languagePreference: studentRow.language_preference || 'ingles',
        flashQuizCompleted: !!studentRow.flash_quiz_completed,
      },
      session: {
        access_token: sessionToken,
      },
    };
  }

  return { error: 'E-mail ou senha inválidos.' };
};

