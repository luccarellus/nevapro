/**
 * Tenants & RBAC Management Routes
 *
 * Endpoints de Multi-Tenancy:
 *   GET    /api/tenants                → lista tenants do usuário autenticado
 *   POST   /api/tenants                → cria tenant (tenants:manage)
 *   GET    /api/tenants/:id            → detalhes do tenant (vínculo obrigatório)
 *   PUT    /api/tenants/:id            → atualiza tenant (tenants:manage)
 *   DELETE /api/tenants/:id            → desativa tenant (tenants:manage)
 *   GET    /api/tenants/:id/roles      → papéis disponíveis no tenant
 *   POST   /api/tenants/:id/members    → atribui papel a usuário (users:manage_*)
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { normalizeEmail } from '../utils/sanitize';
import { PERMISSIONS, PermissionCode, ROLE_CODES, RoleCode } from '../lib/permissions';
import { PLATFORM_TENANT_ID } from '../services/rbacService';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// ============= LIST MY TENANTS =============
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = (req as any).rbacContext;
    if (!ctx) {
      res.status(403).json({ error: 'Contexto de autorização indisponível.' });
      return;
    }
    if (ctx.isSuperAdmin) {
      const { data, error } = await dbAdmin
        .from('tenants')
        .select('id, name, slug, domain, plan, active, created_at')
        .order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
      return;
    }
    res.json(ctx.tenants);
  } catch (err) {
    log.error('[Tenants List] Error:', err);
    res.status(500).json({ error: 'Erro ao listar tenants.' });
  }
});

// ============= CREATE TENANT =============
router.post(
  '/',
  rateLimiter(10, 60_000),
  requireAuth,
  requirePermission(PERMISSIONS.TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, slug, domain, plan } = req.body || {};
    if (!name || !slug) {
      res.status(400).json({ error: 'Nome e slug são obrigatórios.' });
      return;
    }
    try {
      const { data, error } = await dbAdmin
        .from('tenants')
        .insert({
          name,
          slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          domain: domain || null,
          plan: plan || 'free',
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('[Tenant Create] Error:', err);
      res.status(400).json({ error: msg.includes('duplicate') ? 'Slug ou domínio já em uso.' : 'Erro ao criar tenant.' });
    }
  },
);

// ============= GET TENANT BY ID =============
router.get('/:id', requireAuth, resolveTenant, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = (req as any).rbacContext;
    const tenantId = req.params.id;

    const isLinked = ctx?.isSuperAdmin || (ctx?.tenants || []).some((t: any) => t.id === tenantId);
    if (!isLinked) {
      res.status(403).json({ error: 'Acesso negado: você não pertence a este tenant.' });
      return;
    }

    const { data, error } = await dbAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Tenant não encontrado.' });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error('[Tenant Get] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar tenant.' });
  }
});

// ============= UPDATE TENANT =============
router.put(
  '/:id',
  rateLimiter(10, 60_000),
  requireAuth,
  requirePermission(PERMISSIONS.TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.params.id;

    // Isolamento cross-tenant: super_admin edita qualquer tenant; demais papéis
    // só podem editar tenants aos quais estão vinculados.
    const ctx = (req as any).rbacContext;
    const isLinked = ctx?.isSuperAdmin || (ctx?.tenants || []).some((t: any) => t.id === tenantId);
    if (!isLinked) {
      res.status(403).json({ error: 'Acesso negado: você não pertence a este tenant.' });
      return;
    }

    const { name, slug, domain, plan, settings, active } = req.body || {};
    try {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (domain !== undefined) updates.domain = domain;
      if (plan !== undefined) updates.plan = plan;
      if (settings !== undefined) updates.settings = settings;
      if (active !== undefined) updates.active = Boolean(active);

      const { data, error } = await dbAdmin
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .select('*')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('[Tenant Update] Error:', err);
      res.status(400).json({ error: msg.includes('duplicate') ? 'Slug ou domínio já em uso.' : 'Erro ao atualizar tenant.' });
    }
  },
);

// ============= DEACTIVATE TENANT =============
router.delete(
  '/:id',
  rateLimiter(5, 60_000),
  requireAuth,
  requirePermission(PERMISSIONS.TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.params.id;

    // Isolamento cross-tenant (mesma política do PUT)
    const ctx = (req as any).rbacContext;
    const isLinked = ctx?.isSuperAdmin || (ctx?.tenants || []).some((t: any) => t.id === tenantId);
    if (!isLinked) {
      res.status(403).json({ error: 'Acesso negado: você não pertence a este tenant.' });
      return;
    }

    if (tenantId === PLATFORM_TENANT_ID) {
      res.status(400).json({ error: 'O tenant da plataforma não pode ser desativado.' });
      return;
    }
    try {
      const { data, error } = await dbAdmin
        .from('tenants')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', tenantId)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      log.error('[Tenant Deactivate] Error:', err);
      res.status(500).json({ error: 'Erro ao desativar tenant.' });
    }
  },
);

// ============= ROLES AVAILABLE IN TENANT =============
router.get('/:id/roles', requireAuth, resolveTenant, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = (req as any).rbacContext;
    const tenantId = req.params.id;
    const isLinked = ctx?.isSuperAdmin || (ctx?.tenants || []).some((t: any) => t.id === tenantId);
    if (!isLinked) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { data, error } = await dbAdmin
      .from('roles')
      .select('id, code, name, description, tenant_id')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    log.error('[Tenant Roles] Error:', err);
    res.status(500).json({ error: 'Erro ao listar papéis.' });
  }
});

// ============= LIST TENANT MEMBERS WITH ROLES =============
router.get(
  '/:id/members',
  requireAuth,
  resolveTenant,
  requirePermission(
    PERMISSIONS.USERS_MANAGE_ADMINS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
    PERMISSIONS.TENANTS_VIEW_SETTINGS,
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.params.id;
    try {
      const { rows } = await query(
        `SELECT utr.id as link_id, utr.user_id, utr.assigned_at,
                r.id as role_id, r.code as role_code, r.name as role_name,
                COALESCE(u.name, au.name, 'Usuário') as user_name,
                COALESCE(u.email, au.email) as user_email,
                COALESCE(u.avatar_url, au.avatar_url) as avatar_url,
                COALESCE(u.xp, au.xp, 0) as xp,
                COALESCE(u.level, au.level, 1) as level,
                CASE WHEN au.id IS NOT NULL THEN 'admin' ELSE 'student' END as source_table
         FROM public.user_tenant_roles utr
         JOIN public.roles r ON r.id = utr.role_id
         LEFT JOIN public.users u ON u.id = utr.user_id
         LEFT JOIN public.admin_users au ON au.id = utr.user_id
         WHERE utr.tenant_id = $1
         ORDER BY utr.assigned_at DESC`,
        [tenantId],
      );

      res.json(rows);
    } catch (err) {
      log.error('[Tenant Members List] Error:', err);
      res.status(500).json({ error: 'Erro ao listar membros do tenant.' });
    }
  },
);

// ============= ASSIGN ROLE TO USER =============
router.post(
  '/:id/members',
  rateLimiter(20, 60_000),
  requireAuth,
  resolveTenant,
  requirePermission(
    PERMISSIONS.USERS_MANAGE_ADMINS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.params.id;
    const { email, role } = req.body || {};

    if (!email || !role) {
      res.status(400).json({ error: 'E-mail e papel são obrigatórios.' });
      return;
    }    if (!ROLE_CODES.includes(role)) {
      res.status(400).json({ error: `Papel inválido. Válidos: ${ROLE_CODES.join(', ')}.` });
      return;
    }

    const ctx = (req as any).rbacContext;
    const targetRole = role as RoleCode;

    // Isolamento cross-tenant: a permissão foi validada contra req.tenantId
    // (header), mas o vínculo é criado no tenant do path. Exigir que coincidam.
    if (req.tenantId !== tenantId) {
      res.status(403).json({ error: 'Acesso negado a este tenant.' });
      return;
    }

    // super_admin é papel GLOBAL: apenas super admin pode atribuí-lo.
    if (targetRole === 'super_admin' && !ctx?.isSuperAdmin) {
      res.status(403).json({ error: 'Somente super admin pode atribuir este papel.' });
      return;
    }

    const permissionMap: Record<RoleCode, PermissionCode> = {
      super_admin: PERMISSIONS.USERS_MANAGE_ADMINS,
      tenant_admin: PERMISSIONS.USERS_MANAGE_ADMINS,
      teacher: PERMISSIONS.USERS_MANAGE_TEACHERS,
      student: PERMISSIONS.USERS_MANAGE_STUDENTS,
    };
    const { hasPermission } = await import('../services/rbacService');
    if (!ctx?.isSuperAdmin && !hasPermission(ctx, permissionMap[targetRole], tenantId)) {
      res.status(403).json({ error: 'Acesso negado: você não pode atribuir este papel.' });
      return;
    }

    try {
      const cleanEmail = normalizeEmail(email);

      // Localiza o usuário (admin_users ou users)
      const { data: adminUser } = await dbAdmin
        .from('admin_users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();
      const { data: studentUser } = adminUser
        ? { data: null }
        : await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();

      const userId = adminUser?.id || studentUser?.id;
      if (!userId) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      // Resolve o papel (global ou específico do tenant)
      const { rows } = await query(
        `SELECT id FROM public.roles
         WHERE code = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
         ORDER BY tenant_id NULLS LAST LIMIT 1`,
        [targetRole, tenantId],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Papel não encontrado no tenant.' });
        return;
      }
      const roleId = rows[0].id;

      // Insere o vínculo (idempotente)
      const { rows: inserted } = await query(
        `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING
         RETURNING id`,
        [userId, tenantId, roleId],
      );

      // Atualiza tenant_id padrão do usuário se ainda não tiver
      const table = adminUser ? 'admin_users' : 'users';
      await query(
        `UPDATE public.${table} SET tenant_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id IS NULL`,
        [tenantId, userId],
      );

      res.status(201).json({
        success: true,
        message: inserted.length > 0 ? 'Papel atribuído com sucesso.' : 'O usuário já possui este papel.',
      });
    } catch (err) {
      log.error('[Tenant Assign Role] Error:', err);
      res.status(500).json({ error: 'Erro ao atribuir papel.' });
    }
  },
);

// ============= REMOVE ROLE FROM USER =============
router.delete(
  '/:id/members/:userId',
  rateLimiter(20, 60_000),
  requireAuth,
  resolveTenant,
  requirePermission(
    PERMISSIONS.USERS_MANAGE_ADMINS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: tenantId, userId } = req.params;

    // Isolamento cross-tenant: a permissão foi validada contra req.tenantId
    // (header), mas o DELETE atua no tenant do path. Exigir que sejam o mesmo.
    if (req.tenantId !== tenantId) {
      res.status(403).json({ error: 'Acesso negado a este tenant.' });
      return;
    }

    try {
      const { rows } = await query(
        `DELETE FROM public.user_tenant_roles
         WHERE user_id = $1 AND tenant_id = $2
         RETURNING id`,
        [userId, tenantId],
      );
      res.json({ success: true, removed: rows.length });
    } catch (err) {
      log.error('[Tenant Remove Role] Error:', err);
      res.status(500).json({ error: 'Erro ao remover papel.' });
    }
  },
);

export default router;
