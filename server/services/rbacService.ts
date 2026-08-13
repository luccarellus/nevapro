/**
 * RBAC Service — Resolução de Papéis, Permissões e Tenants
 *
 * Consulta o modelo Multi-Tenancy:
 *   user_tenant_roles → roles → role_permissions → permissions
 *
 * Papéis globais (roles.tenant_id IS NULL) são aplicáveis a qualquer tenant.
 * Papéis por tenant (roles.tenant_id = X) só valem dentro daquele tenant.
 */

import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import {
  ADMIN_ROLE_CODES,
  PermissionCode,
  permissionsForRoles,
  RoleCode,
} from '../lib/permissions';

/** Tenant da plataforma (backward-compatible com o legado single-tenant). */
export const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  plan: string;
}

export interface RbacContext {
  /** Papéis globais + papéis por tenant (códigos únicos). */
  roles: RoleCode[];
  /** Permissões efetivas (união de todos os papéis do usuário). */
  permissions: PermissionCode[];
  /** Tenants aos quais o usuário está vinculado. */
  tenants: TenantInfo[];
  /** Papéis válidos dentro do tenant ativo (ou globais se nenhum tenant ativo). */
  rolesInTenant: RoleCode[];
  /** Tenant padrão do usuário (coluna users.tenant_id / admin_users.tenant_id). */
  defaultTenantId: string | null;
  /** true se o usuário é super_admin (acesso global). */
  isSuperAdmin: boolean;
  /** true se o usuário possui papel administrativo (compatibilidade com legado role='admin'). */
  isAdmin: boolean;
}

const TENANT_CACHE_TTL_MS = 60_000;
const tenantCache = new Map<string, { at: number; tenant: TenantInfo | null }>();

function isRoleCode(value: string): value is RoleCode {
  return value === 'super_admin' || value === 'tenant_admin' || value === 'teacher' || value === 'student';
}

/** Converte códigos do banco em RoleCode, ignorando valores desconhecidos. */
function normalizeRoles(codes: string[]): RoleCode[] {
  return Array.from(new Set(codes.filter(isRoleCode)));
}

/**
 * Garante a existência do tenant da plataforma (idempotente).
 * Executado no boot do servidor.
 */
export async function ensurePlatformTenant(): Promise<void> {
  try {
    const { rows } = await query(
      `INSERT INTO public.tenants (id, name, slug, plan, active)
       VALUES ($1, 'NevaPro', 'nevapro', 'platform', true)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [PLATFORM_TENANT_ID],
    );
    if (rows.length > 0) {
      log.info('[RBAC] Tenant da plataforma garantido.');
    }
  } catch (err) {
    log.error('[RBAC] Falha ao garantir tenant da plataforma:', err);
  }
}

/** Resolve um tenant por slug, domínio ou id (com cache curto). */
export async function resolveTenant(identifier: string): Promise<TenantInfo | null> {
  if (!identifier) return null;
  const cacheKey = identifier.toLowerCase().trim();

  const cached = tenantCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TENANT_CACHE_TTL_MS) {
    return cached.tenant;
  }

  try {
    const { rows } = await query(
      `SELECT id, slug, name, plan
       FROM public.tenants
       WHERE active = true
         AND (id = $1 OR lower(slug) = lower($1) OR lower(domain) = lower($1))
       LIMIT 1`,
      [cacheKey],
    );
    const tenant = rows.length > 0
      ? { id: rows[0].id as string, slug: rows[0].slug as string, name: rows[0].name as string, plan: rows[0].plan as string }
      : null;
    tenantCache.set(cacheKey, { at: Date.now(), tenant });
    return tenant;
  } catch (err) {
    log.error('[RBAC] Erro ao resolver tenant:', err);
    return null;
  }
}

/**
 * Carrega o contexto RBAC completo de um usuário.
 *
 * @param userId  id em public.users OU public.admin_users
 * @param source  'student' | 'admin' — identifica qual tabela contém o usuário
 */
export async function getUserRbacContext(userId: string, source: 'student' | 'admin'): Promise<RbacContext> {
  const empty: RbacContext = {
    roles: [],
    permissions: [],
    tenants: [],
    rolesInTenant: [],
    defaultTenantId: null,
    isSuperAdmin: false,
    isAdmin: source === 'admin',
  };

  if (!userId) return empty;

  try {
    // 1. Papéis vinculados ao usuário (globais + por tenant)
    const { rows: roleRows } = await query(
      `SELECT r.code AS code, r.tenant_id AS tenant_id
       FROM public.user_tenant_roles utr
       JOIN public.roles r ON r.id = utr.role_id
       WHERE utr.user_id = $1`,
      [userId],
    );

    const roles = normalizeRoles(roleRows.map((r: any) => r.code));
    const rolesInTenant = new Set<RoleCode>();

    for (const row of roleRows as Array<{ code: string; tenant_id: string | null }>) {
      if (row.tenant_id == null && isRoleCode(row.code)) rolesInTenant.add(row.code);
    }

    // 2. Tenants vinculados
    const { rows: tenantRows } = await query(
      `SELECT DISTINCT t.id, t.slug, t.name, t.plan
       FROM public.user_tenant_roles utr
       JOIN public.tenants t ON t.id = utr.tenant_id
       WHERE utr.user_id = $1 AND t.active = true`,
      [userId],
    );
    const tenants: TenantInfo[] = tenantRows.map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: t.plan,
    }));

    // 3. Tenant padrão (coluna tenant_id da tabela de origem)
    const table = source === 'admin' ? 'admin_users' : 'users';
    const { rows: defaultRows } = await query(
      `SELECT tenant_id FROM public.${table} WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const defaultTenantId = (defaultRows[0]?.tenant_id as string) || null;

    // 4. Papéis globais valem em qualquer tenant
    const isSuperAdmin = roles.includes('super_admin');
    const isAdmin = isSuperAdmin || roles.some((r) => ADMIN_ROLE_CODES.includes(r)) || source === 'admin';

    const permissions = permissionsForRoles(roles);

    // Papéis aplicáveis dentro do tenant ativo: globais + papéis específicos do tenant
    const activeTenantId = defaultTenantId || tenants[0]?.id || null;
    const activeTenantRoles = new Set<RoleCode>(rolesInTenant);
    for (const row of roleRows as Array<{ code: string; tenant_id: string | null }>) {
      if (row.tenant_id === activeTenantId && isRoleCode(row.code)) {
        activeTenantRoles.add(row.code);
      }
    }

    return {
      roles,
      permissions,
      tenants,
      rolesInTenant: Array.from(activeTenantRoles),
      defaultTenantId,
      isSuperAdmin,
      isAdmin,
    };
  } catch (err) {
    log.error('[RBAC] Erro ao carregar contexto do usuário:', err);
    return empty;
  }
}

/**
 * Verifica se o usuário possui determinada permissão no tenant ativo.
 * - super_admin sempre passa (acesso global).
 * - Papéis globais (tenant_id NULL) valem apenas nos tenants aos quais o
 *   usuário está vinculado (garantia de isolamento entre tenants).
 */
export function hasPermission(context: RbacContext, permission: PermissionCode, tenantId?: string | null): boolean {
  if (!context) return false;
  if (context.isSuperAdmin) return true;
  if (!context.permissions.includes(permission)) return false;

  // Sem tenant ativo definido: papel global aplica-se por padrão.
  if (!tenantId) return true;

  // Com tenant ativo: exige vínculo real do usuário com o tenant.
  const belongsToTenant =
    context.defaultTenantId === tenantId ||
    context.tenants.some((t) => t.id === tenantId);
  return belongsToTenant;
}

/**
 * Define o tenant ativo de uma requisição:
 * 1. Header X-Tenant-ID (slug/domínio/id) — mais específico
 * 2. Tenant padrão do usuário
 * 3. Primeiro tenant vinculado
 * 4. Tenant da plataforma (fallback)
 */
export async function resolveActiveTenant(
  context: RbacContext,
  headerTenant?: string,
): Promise<TenantInfo | null> {
  // Header explícito
  if (headerTenant) {
    const resolved = await resolveTenant(headerTenant);
    if (resolved && context.isSuperAdmin) return resolved;
    if (resolved && context.tenants.some((t) => t.id === resolved.id)) return resolved;
    if (resolved && context.defaultTenantId === resolved.id) return resolved;
  }

  // Tenant padrão
  if (context.defaultTenantId) {
    const resolved = await resolveTenant(context.defaultTenantId);
    if (resolved) return resolved;
  }

  // Primeiro tenant vinculado
  if (context.tenants.length > 0) {
    const resolved = await resolveTenant(context.tenants[0].id);
    if (resolved) return resolved;
  }

  // Fallback: tenant da plataforma
  return resolveTenant(PLATFORM_TENANT_ID);
}
