import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';
import { dbAdmin, getSupabaseAdminClient, getSupabaseAnonClient } from '../../src/lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';

// Extend Express Request globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies a Supabase session token and returns the authenticated user.
 * Uses Supabase Auth's built-in JWT verification via getUser().
 */
const verifySupabaseSession = async (token: string): Promise<AuthenticatedUser | null> => {
  try {
    const { data: userData, error } = await getSupabaseAdminClient().auth.getUser(token);
    if (error || !userData?.user) return null;

    const supabaseUser = userData.user;
    const email = supabaseUser.email?.toLowerCase().trim();
    if (!email) return null;

    // Check if user is an admin (via admin_users table)
    const { data: adminRow } = await getSupabaseAdminClient()
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (adminRow) {
      return {
        userId: supabaseUser.id,
        email,
        role: 'admin',
        authUserId: supabaseUser.id,
      };
    }

    // Check if user is a student (via users table)
    const { data: studentRow } = await getSupabaseAdminClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (studentRow) {
      return {
        userId: studentRow.id,
        email,
        role: 'student',
        authUserId: supabaseUser.id,
      };
    }

    // Authenticated via Supabase but not in our DB — treat as student
    return {
      userId: supabaseUser.id,
      email,
      role: 'student',
      authUserId: supabaseUser.id,
    };
  } catch (err) {
    log.error('[Auth] Error verifying Supabase session:', err);
    return null;
  }
};

/**
 * Middleware: Requires valid Supabase Auth session (via Cookie or Bearer Token).
 * Fetches the user profile from Supabase Auth + admin_users/users tables.
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
      // Fallback: check for legacy session_token (for backward compatibility)
      token = req.cookies?.session_token;
      if (token) {
        // Legacy token — try to get user info from DB
        try {
          const parts = token.split(':');
          if (parts.length === 5) {
            const [userId, email, role] = parts;
            req.user = { userId, email, role: role as 'admin' | 'student' };
            return next();
          }
        } catch {
          // Invalid legacy token — continue to error
        }
      }
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
 * Unified login: authenticates via Supabase Auth,
 * then returns the user profile from admin_users or users table.
 */
export const authenticateUser = async (email: string, password: string) => {
  const supabase = getSupabaseAnonClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const cleanEmail = email.toLowerCase().trim();
  const authUserId = authData.user.id;

  // Check admin_users
  const { data: adminRow } = await getSupabaseAdminClient()
    .from('admin_users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (adminRow) {
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
        avatarUrl: adminRow.avatar_url || '',
      },
      session: authData.session,
    };
  }

  // Check students
  const { data: studentRow } = await getSupabaseAdminClient()
    .from('users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (studentRow) {
    return {
      user: {
        ...studentRow,
        id: studentRow.id,
        role: 'student',
        answeredQuestions: studentRow.answered_questions || studentRow.answeredQuestions || 0,
        correctAnswers: studentRow.correct_answers || studentRow.correctAnswers || 0,
        avatarUrl: studentRow.avatar_url || studentRow.avatarUrl || studentRow.avatar || '',
        showInLeaderboard: studentRow.show_in_leaderboard !== false,
        languagePreference: studentRow.language_preference || 'ingles',
        flashQuizCompleted: !!studentRow.flash_quiz_completed,
      },
      session: authData.session,
    };
  }

  return { error: 'Usuário não encontrado no sistema.' };
};
