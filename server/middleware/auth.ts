import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { getUserRbacContext } from '../services/rbacService';
import { ADMIN_ROLE_CODES } from '../lib/permissions';

import bcrypt from 'bcryptjs';

const STUDENT_SESSION_TTL_SECONDS = 24 * 60 * 60;
const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;

const getSessionSecret = (): string | null =>
  process.env.JWT_SECRET || null;

/**
 * Versão do token por usuário: incrementada quando a senha muda, o que
 * invalida TODAS as sessões emitidas antes (revogação de sessão).
 * Consulta direta no banco com cache curto para não pesar o hot path.
 */
const tokenVersionCache = new Map<string, { version: number; expiresAt: number }>();
const TOKEN_VERSION_CACHE_TTL_MS = 60_000;

export async function getTokenVersion(userId: string): Promise<number> {
  const cached = tokenVersionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.version;

  let version = 0;
  try {
    // Coluna opcional: ausente => versão 0 (comportamento legado)
    const { rows } = await query(
      `SELECT COALESCE(
         (SELECT token_version FROM public.users WHERE id = $1),
         (SELECT token_version FROM public.admin_users WHERE id = $1),
         0
       ) AS version`,
      [userId],
    );
    version = Number(rows[0]?.version) || 0;
  } catch (err) {
    // Coluna ainda não migrada: mantém 0 e evita derrubar sessões legítimas
    log.warn('[Auth] token_version indisponível (migração pendente?):', err instanceof Error ? err.message : err);
    version = 0;
  }

  tokenVersionCache.set(userId, { version, expiresAt: Date.now() + TOKEN_VERSION_CACHE_TTL_MS });
  return version;
}

/** Invalida a versão em cache (chamar após bump de token_version). */
export function invalidateTokenVersionCache(userId: string): void {
  tokenVersionCache.delete(userId);
}

/**
 * Invalida TODAS as sessões em cache de um usuário (todas as variações de
 * token hash não são enumeráveis, então marcamos o userId como revogado até
 * o bump propagar: verifySession rejeita tokens com versão antiga mesmo se
 * a entrada de cache auth ainda existir no L1).
 */
const revokedUsers = new Map<string, { version: number; expiresAt: number }>();

/** Chama após bump de token_version: grava a nova versão e revoga caches de sessão. */
export async function revokeUserSessions(userId: string): Promise<void> {
  invalidateTokenVersionCache(userId);
  const version = await getTokenVersion(userId);
  revokedUsers.set(userId, { version, expiresAt: Date.now() + TOKEN_VERSION_CACHE_TTL_MS });
}

/**
 * Verificação de revogação no hot path: se o usuário foi marcado como revogado
 * e o token carrega uma versão menor que a atual, a sessão está inválida
 * mesmo que exista entrada no cache L1 de auth.
 */
export function isSessionRevoked(userId: string, tokenVersion: number | undefined): boolean {
  const revoked = revokedUsers.get(userId);
  if (!revoked) return false;
  if (revoked.expiresAt < Date.now()) {
    revokedUsers.delete(userId);
    return false;
  }
  return tokenVersion !== undefined && tokenVersion < revoked.version;
}

/**
 * Creates a signed session token for a user (admin or student).
 * Format: role_prefix.payload_base64url.signature_hmac
 */
export const createSessionToken = (user: AuthenticatedUser): string => {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('JWT_SECRET é obrigatório para assinar sessões.');
  }

  const prefix = user.role === 'admin' ? 'adm' : 'st';
  const ttl = user.role === 'admin' ? ADMIN_SESSION_TTL_SECONDS : STUDENT_SESSION_TTL_SECONDS;

  const payload = Buffer.from(JSON.stringify({
    userId: user.userId,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttl,
    tv: user.tokenVersion ?? 0,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${prefix}.${payload}.${signature}`;
};

/**
 * Verifies a signed session token.
 * Returns the authenticated user or null if invalid/expired.
 */
export const verifySessionToken = (token: string): AuthenticatedUser | null => {
  const secret = getSessionSecret();
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [prefix, payload, signature] = parts;
  if (!secret || !payload || !signature) return null;

  // Accept both legacy 'st.' prefix and 'adm.' prefix
  if (prefix !== 'st' && prefix !== 'adm') return null;

  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      email?: string;
      role?: string;
      exp?: number;
      tv?: number;
    };
    if (
      !decoded.userId || !decoded.email ||
      (decoded.role !== 'admin' && decoded.role !== 'student') ||
      !decoded.exp || decoded.exp <= Math.floor(Date.now() / 1000)
    ) return null;

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as 'admin' | 'student',
      tokenVersion: decoded.tv ?? 0,
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
 * Verifies a session token (HMAC-signed for both admin and student).
 */
const verifySession = async (token: string): Promise<AuthenticatedUser | null> => {
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const cachedUser = await getUserCache<AuthenticatedUser>(userCacheKeys.auth(tokenHash));
    if (cachedUser) return cachedUser;

    const user = verifySessionToken(token);
    if (!user) return null;

    // Revogação: sessões emitidas antes de um bump de token_version morrem aqui.
    // isSessionRevoked cobre o caso de bump recente, quando a entrada em cache
    // de auth (L1 até 5 min) ainda existir com a versão antiga do token.
    if (isSessionRevoked(user.userId, (user as any).tokenVersion)) {
      return null;
    }
    const currentVersion = await getTokenVersion(user.userId);
    if ((user as any).tokenVersion !== undefined && (user as any).tokenVersion !== currentVersion) {
      return null;
    }

    if (user.role === 'student') {
      // Carrega o contexto RBAC UMA vez e cacheia junto com a sessão.
      // Sem isso, cada requisição do aluno rodava 3 queries no Postgres
      // (fallback do requireAuth) — maior custo do hot path autenticado.
      const rbacContext = await getUserRbacContext(user.userId, 'student');
      const authenticatedUser: AuthenticatedUser = {
        ...user,
        roles: rbacContext.roles,
        permissions: rbacContext.permissions,
        tenants: rbacContext.tenants,
        tenantId: rbacContext.defaultTenantId || undefined,
        isAdmin: rbacContext.isAdmin,
      };
      (authenticatedUser as any).rbacContext = rbacContext;
      await setUserCache(userCacheKeys.auth(tokenHash), authenticatedUser, STUDENT_SESSION_TTL_SECONDS);
      return authenticatedUser;
    }

    // Admin: load RBAC context
    const { data: adminRow } = await dbAdmin
      .from('admin_users')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();

    if (adminRow) {
      const rbacContext = await getUserRbacContext(adminRow.id, 'admin');
      const authenticatedUser: AuthenticatedUser = {
        userId: adminRow.id,
        email: user.email,
        role: 'admin',
        roles: rbacContext.roles,
        permissions: rbacContext.permissions,
        tenants: rbacContext.tenants,
        tenantId: rbacContext.defaultTenantId || undefined,
        isAdmin: rbacContext.isAdmin,
      };
      (authenticatedUser as any).rbacContext = rbacContext;
      // Cache admin sessions for 10 minutes (RBAC changes rarely)
      await setUserCache(userCacheKeys.auth(tokenHash), authenticatedUser, 600);
      return authenticatedUser;
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
    let token: string | undefined = req.cookies?.session_token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token) {
      res.status(401).json({ error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
      return;
    }

    const user = await verifySession(token);
    if (user) {
      req.user = user;
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
 * Unified login:
 * - Admin users: Authenticate via admin_users table (bcrypt password_hash).
 * - Students: Authenticate via public.users table (bcrypt password_hash).
 */
export const authenticateUser = async (email: string, password: string) => {
  const cleanEmail = email.toLowerCase().trim();

  // Single query: try admin first, then student — avoids N+1 sequential lookups
  const { rows } = await query(
    `SELECT 'admin' AS user_type, au.id, au.email, au.name, au.password_hash,
            au.avatar_url, au.answered_questions, au.correct_answers, au.tenant_id,
            au.xp, au.level, au.streak, au.flash_quiz_completed,
            NULL::varchar AS city, NULL::varchar AS school, NULL::varchar AS gremio,
            0 AS points, 0 AS rank
     FROM public.admin_users au WHERE au.email = $1
     UNION ALL
     SELECT 'student' AS user_type, u.id, u.email, u.name, u.password_hash,
            u.avatar_url, u.answered_questions, u.correct_answers, u.tenant_id,
            u.xp, u.level, u.streak, u.flash_quiz_completed,
            u.city, u.school, u.gremio,
            u.points, u.rank
     FROM public.users u WHERE u.email = $1
     LIMIT 1`,
    [cleanEmail],
  );

  if (rows.length === 0) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const userRow = rows[0];
  const userType = userRow.user_type as 'admin' | 'student';

  if (!userRow.password_hash) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  const passwordIsValid = await bcrypt.compare(password, userRow.password_hash).catch(() => false);
  if (!passwordIsValid) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  // Nunca expor o hash para fora do processo (rotas devolvem este objeto)
  delete userRow.password_hash;

  const rbacContext = await getUserRbacContext(userRow.id, userType);

  const authenticatedUser: AuthenticatedUser = {
    userId: userRow.id,
    email: cleanEmail,
    role: userType,
    roles: rbacContext.roles,
    permissions: rbacContext.permissions,
    tenants: rbacContext.tenants,
    tenantId: rbacContext.defaultTenantId || undefined,
    isAdmin: rbacContext.isAdmin,
  };

  const sessionToken = createSessionToken(authenticatedUser);

  // Cache student sessions for full TTL; admin sessions shorter (loaded fresh each time for RBAC)
  if (userType === 'student') {
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const sessionCacheValue: any = { ...authenticatedUser, rbacContext };
    await setUserCache(userCacheKeys.auth(tokenHash), sessionCacheValue, STUDENT_SESSION_TTL_SECONDS);
  }

  return {
    user: {
      ...userRow,
      role: userType,
      answeredQuestions: userRow.answered_questions || 0,
      correctAnswers: userRow.correct_answers || 0,
      avatarUrl: resolveStoredFileUrl(userRow.avatar_url),
      showInLeaderboard: userRow.show_in_leaderboard !== false,
      languagePreference: userRow.language_preference || 'ingles',
      flashQuizCompleted: !!userRow.flash_quiz_completed,
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
};
