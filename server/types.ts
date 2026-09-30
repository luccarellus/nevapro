import { Request } from 'express';
import { PermissionCode, RoleCode } from './lib/permissions';
import { RbacContext, TenantInfo } from './services/rbacService';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  /** Papel legado (admin | student) — mantido para compatibilidade com o frontend atual. */
  role: 'admin' | 'student';
  authUserId?: string;
  /** Versão do token no momento da emissão (revogação de sessão). */
  tokenVersion?: number;
  /** Papéis RBAC efetivos do usuário (união global + por tenant). */
  roles?: RoleCode[];
  /** Permissões RBAC efetivas. */
  permissions?: PermissionCode[];
  /** Tenant padrão do usuário. */
  tenantId?: string;
  /** Tenants vinculados ao usuário. */
  tenants?: TenantInfo[];
  /** true se possui papel administrativo (super_admin | tenant_admin). */
  isAdmin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Contexto RBAC completo do usuário autenticado (populado pelo middleware de auth). */
  rbacContext?: RbacContext;
  /** Tenant ativo da requisição (populado por resolveTenant). */
  tenantId?: string;
  tenant?: TenantInfo;
}

export interface ApiError {
  error: string;
  missing?: string[];
}

export interface ApiSuccess<T = unknown> {
  success: boolean;
  data?: T;
  user?: T;
  message?: string;
}

export type CacheKey =
  | 'cache:leaderboard'
  | 'cache:materials'
  | 'cache:recados'
  | 'cache:eventos'
  | 'cache:admin:users'
  | 'cache:admin:activities';

export const CACHE_KEYS: Record<string, CacheKey> = {
  LEADERBOARD: 'cache:leaderboard',
  MATERIALS: 'cache:materials',
  RECADOS: 'cache:recados',
  EVENTOS: 'cache:eventos',
  ADMIN_USERS: 'cache:admin:users',
  ADMIN_ACTIVITIES: 'cache:admin:activities',
} as const;

export const CACHE_TTL: Record<string, number> = {
  [CACHE_KEYS.LEADERBOARD]: 60,
  [CACHE_KEYS.MATERIALS]: 300,
  [CACHE_KEYS.RECADOS]: 300,
  [CACHE_KEYS.EVENTOS]: 300,
  [CACHE_KEYS.ADMIN_USERS]: 120,
  [CACHE_KEYS.ADMIN_ACTIVITIES]: 120,
};

export const CACHE_TTL_QUESTOES = 600;

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
