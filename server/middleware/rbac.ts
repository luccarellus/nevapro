/**
 * RBAC Middleware — requirePermission e requireRole
 *
 * Deve ser usado APÓS `requireAuth` (que popula `req.user` e `req.rbacContext`)
 * e, idealmente, após `resolveTenant` (que popula `req.tenantId`).
 *
 * Exemplos:
 *   router.post('/', requireAuth, resolveTenant, requirePermission('materials:upload'), handler);
 *   router.get('/admin', requireAuth, requireRole('super_admin', 'tenant_admin'), handler);
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { PermissionCode } from '../lib/permissions';
import { RoleCode } from '../lib/permissions';
import { hasPermission } from '../services/rbacService';
import { log } from '../utils/logger';

/**
 * Exige que o usuário autenticado possua PELO MENOS UMA das permissões
 * informadas no tenant ativo da requisição.
 */
export const requirePermission =
  (...permissions: PermissionCode[]) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = (req as any).rbacContext;
      if (!context) {
        res.status(403).json({ error: 'Acesso negado: contexto de autorização indisponível.' });
        return;
      }

      const allowed = permissions.some((permission) => hasPermission(context, permission, req.tenantId));
      if (!allowed) {
        res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
        return;
      }
      next();
    } catch (err) {
      log.error('[RBAC] Erro ao validar permissão:', err);
      res.status(500).json({ error: 'Erro interno de autorização.' });
    }
  };

/**
 * Exige que o usuário autenticado possua PELO MENOS UM dos papéis
 * informados no tenant ativo da requisição.
 */
export const requireRole =
  (...roles: RoleCode[]) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = (req as any).rbacContext;
      if (!context) {
        res.status(403).json({ error: 'Acesso negado: contexto de autorização indisponível.' });
        return;
      }

      const allowed = roles.some((role) => {
        if (role === 'super_admin' && context.isSuperAdmin) return true;
        return context.roles.includes(role);
      });
      if (!allowed) {
        res.status(403).json({ error: 'Acesso negado: papel insuficiente.' });
        return;
      }
      next();
    } catch (err) {
      log.error('[RBAC] Erro ao validar papel:', err);
      res.status(500).json({ error: 'Erro interno de autorização.' });
    }
  };
