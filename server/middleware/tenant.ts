/**
 * Tenant Context Middleware
 *
 * Resolve o tenant ativo da requisição e o anexa em `req.tenantId` e `req.tenant`.
 *
 * Fontes de identificação (em ordem de prioridade):
 *   1. Header `X-Tenant-ID` (slug, domínio ou id) — usado por clientes multi-tenant
 *   2. Subdomínio do Host (ex.: colegio-alpha.nevapro.com.br → slug `colegio-alpha`)
 *   3. Tenant padrão do usuário autenticado (users.tenant_id / admin_users.tenant_id)
 *   4. Tenant da plataforma (fallback backward-compatible)
 *
 * Uso: deve ser aplicado APÓS `requireAuth` para aproveitar o contexto RBAC.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { resolveActiveTenant, RbacContext, TenantInfo } from '../services/rbacService';
import { log } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: TenantInfo;
    }
  }
}

/** Extrai o slug de tenant a partir do subdomínio do Host (se houver). */
function extractTenantFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase().trim();
  const parts = hostname.split('.');

  // Requer pelo menos 3 partes (ex.: colegio-alpha.nevapro.com.br) para
  // considerar o primeiro segmento um subdomínio de tenant.
  if (parts.length < 3) return null;

  // Ignora subdomínios técnicos conhecidos
  const first = parts[0];
  if (['www', 'api', 'app', 'admin', 'mail', 'vercel'].includes(first)) return null;

  return first;
}

/**
 * Middleware: resolve e anexa o tenant ativo da requisição.
 * Nunca bloqueia a requisição — se nenhum tenant for resolvido,
 * `req.tenantId` permanece indefinido (comportamento legado).
 */
export const resolveTenant = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || undefined;
    const hostTenant = extractTenantFromHost(req.headers.host);

    // Prioridade: header explícito > subdomínio
    const tenant = await resolveActiveTenantForRequest(req, headerTenant || hostTenant || undefined);

    if (tenant) {
      req.tenantId = tenant.id;
      req.tenant = tenant;
    }
  } catch (err) {
    // Não bloqueia: o escopo de tenant é um aprimoramento de isolamento.
    log.warn('[Tenant] Falha ao resolver tenant da requisição:', err);
  }
  next();
};

/**
 * Resolve o tenant ativo considerando o contexto RBAC do usuário.
 * Se o usuário não estiver autenticado, usa apenas o identificador explícito.
 */
async function resolveActiveTenantForRequest(
  req: AuthenticatedRequest,
  explicitTenant?: string,
): Promise<TenantInfo | null> {
  const context = (req as any).rbacContext as RbacContext | undefined;

  if (context) {
    return resolveActiveTenant(context, explicitTenant);
  }

  // Usuário não autenticado ou sem contexto RBAC: usa identificador explícito
  // ou, na ausência dele, o tenant da plataforma (isolamento backward-compatible).
  const { resolveTenant, PLATFORM_TENANT_ID } = await import('../services/rbacService');
  if (explicitTenant) {
    return resolveTenant(explicitTenant);
  }
  return resolveTenant(PLATFORM_TENANT_ID);
}
