import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';
import { dbAdmin, getSupabaseAdminClient, getSupabaseAnonClient } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { getUserRbacContext } from '../services/rbacService';
import { ADMIN_ROLE_CODES } from '../lib/permissions';

import bcrypt from 'bcryptjs';

const STUDENT_SESSION_TTL_SECONDS = 24 * 60 * 60;

const getStudentSessionSecret = (): string | null =>
  process.env.JWT_SECRET || null;

const createStudentSessionToken = (user: AuthenticatedUser): string => {
  const secret = getStudentSessionSecret();
  if (!secret) {
    throw new Error('JWT_SECRET é obrigatório para assinar sessões de alunos.');
  }

  const payload = Buffer.from(JSON.stringify({
    userId: user.userId,
    email: user.email,
    role: 'student',
    exp: Math.floor(Date.now() / 1000) + STUDENT_SESSION_TTL_SECONDS,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `st.${payload}.${signature}`;
};

const verifyStudentSessionToken = (token: string): AuthenticatedUser | null => {
  if (!token.startsWith('st.')) return null;

  const secret = getStudentSessionSecret();
  const [, payload, signature] = token.split('.');
  if (!secret || !payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      email?: string;
      role?: string;
      exp?: number;
    };
    if (
      !decoded.userId ||
      !decoded.email ||
      decoded.role !== 'student' ||
      !decoded.exp ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) return null;

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: 'student',
    };
  } catch {
    return null;
  }
};

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

    const studentUser = verifyStudentSessionToken(token);
    if (studentUser) {
      await setUserCache(userCacheKeys.auth(tokenHash), studentUser, STUDENT_SESSION_TTL_SECONDS);
      return studentUser;
    }

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
        // Carrega o contexto RBAC (papéis, permissões, tenants)
        const rbacContext = await getUserRbacContext(adminRow.id, 'admin');
        const authenticatedUser: AuthenticatedUser = {
          userId: adminRow.id,
          email,
          role: 'admin',
          authUserId: userData.user.id,
          roles: rbacContext.roles,
          permissions: rbacContext.permissions,
          tenants: rbacContext.tenants,
          tenantId: rbacContext.defaultTenantId || undefined,
          isAdmin: rbacContext.isAdmin,
        };
        (authenticatedUser as any).rbacContext = rbacContext;
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
      // Anexa o contexto RBAC (se carregado na sessão) para os middlewares de autorização
      const rbacContext = (user as any).rbacContext as import('../services/rbacService').RbacContext | undefined;
      if (rbacContext) {
        (req as any).rbacContext = rbacContext;
      } else {
        const { getUserRbacContext: loadCtx } = await import('../services/rbacService');
        const ctx = await loadCtx(user.userId, user.role === 'admin' ? 'admin' : 'student');
        (req as any).rbacContext = ctx;
        user.roles = ctx.roles;
        user.permissions = ctx.permissions;
        user.tenants = ctx.tenants;
        user.tenantId = ctx.defaultTenantId || undefined;
        user.isAdmin = ctx.isAdmin;
      }
      return next();
    }

    res.status(401).json({ error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
  } catch (err) {
    log.error('[Auth Middleware] Error:', err);
    res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
};

/**
 * Middleware: Requires the authenticated user to have admin role (RBAC-aware).
 * Aceita super_admin, tenant_admin e o legado role === 'admin'.
 * Must be used AFTER requireAuth.
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await requireAuth(req, res, () => {
    const ctx = (req as any).rbacContext;
    const isLegacyAdmin = req.user?.role === 'admin';
    const isRbacAdmin = ctx?.isAdmin || (req.user?.roles || []).some((r) => ADMIN_ROLE_CODES.includes(r as any));
    if (!isLegacyAdmin && !isRbacAdmin) {
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

    // Carrega o contexto RBAC (papéis, permissões, tenants)
    const rbacContext = await getUserRbacContext(adminRow.id, 'admin');

    return {
      user: {
        ...adminRow,
        id: adminRow.id,
        role: 'admin',
        answeredQuestions: adminRow.answered_questions || 0,
        correctAnswers: adminRow.correct_answers || 0,
        avatarUrl: resolveStoredFileUrl(adminRow.avatar_url),
        roles: rbacContext.roles,
        permissions: rbacContext.permissions,
        tenants: rbacContext.tenants,
        tenantId: rbacContext.defaultTenantId || undefined,
        isAdmin: rbacContext.isAdmin,
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

    // Carrega o contexto RBAC (papéis, permissões, tenants)
    const rbacContext = await getUserRbacContext(studentRow.id, 'student');

    const authenticatedUser: AuthenticatedUser = {
      userId: studentRow.id,
      email: cleanEmail,
      role: 'student',
      roles: rbacContext.roles,
      permissions: rbacContext.permissions,
      tenants: rbacContext.tenants,
      tenantId: rbacContext.defaultTenantId || undefined,
      isAdmin: rbacContext.isAdmin,
    };

    // Generate student session token & cache it
    const sessionToken = createStudentSessionToken(authenticatedUser);
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');

    // Cache student session for 24 hours
    const sessionCacheValue: any = { ...authenticatedUser, rbacContext };
    await setUserCache(userCacheKeys.auth(tokenHash), sessionCacheValue, STUDENT_SESSION_TTL_SECONDS);

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
        roles: rbacContext.roles,
        permissions: rbacContext.permissions,
        tenants: rbacContext.tenants,
        tenantId: rbacContext.defaultTenantId || undefined,
        isAdmin: rbacContext.isAdmin,
      },
      session: {
        access_token: sessionToken,
      },
    };
  }

  return { error: 'E-mail ou senha inválidos.' };
};
