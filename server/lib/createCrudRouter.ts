/**
 * CRUD Router Factory
 *
 * Eliminates the ~90% duplicated CRUD pattern across events, materials, and mural routes.
 */

import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheInvalidate, cacheGet, cacheSet } from '../services/cache';
import { addNotification } from '../services/notification';
import { CACHE_KEYS } from '../types';
import { PermissionCode } from './permissions';

type Row = Record<string, unknown>;
type ValidationFn = (body: unknown, partial?: boolean) => { data: Row } | { error: string };
type RowMapper = (row: Row) => Record<string, unknown>;

interface CrudRouterOptions {
  /** Table name (e.g. 'materials', 'events', 'mural') */
  table: string;
  /** Cache key for the list endpoint */
  cacheKey: string;
  /** Validation function (e.g. validateMaterialInput) */
  validate: ValidationFn;
  /** Notification type sent on create (e.g. 'material', 'evento', 'mural') */
  notificationType: string;
  /** Permission required for create/update/delete (default: any admin role) */
  writePermission?: PermissionCode;
  /** Optional: whether the table is tenant-scoped (has tenant_id column). Default: true. */
  tenantScoped?: boolean;
  /** Optional: maps DB rows to API response shape */
  mapRow?: RowMapper;
  /** Optional: additional cache keys to invalidate on create (e.g. admin activities) */
  extraInvalidateKeys?: string[];
  /** Optional: custom order column (default: 'created_at') */
  orderBy?: string;
  /** Optional: sort direction (default: false = descending) */
  orderAsc?: boolean;
  /** Optional: maps validation field names (camelCase) to DB column names (snake_case). */
  fieldMap?: Record<string, string>;
  /** Optional: default values for DB fields when not provided in request. */
  defaults?: Record<string, unknown>;
  /** Optional: async callback executed BEFORE deleting a row. */
  onBeforeDelete?: (id: string) => Promise<void>;
}

function mapFieldNames(data: Row, fieldMap?: Record<string, string>): Row {
  if (!fieldMap) return data;
  const result: Row = { ...data };
  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (camel in result && camel !== snake) {
      if (!(snake in data)) {
        result[snake] = result[camel];
      }
      delete result[camel];
    }
  }
  return result;
}

function createRowMapper(options: CrudRouterOptions): RowMapper {
  if (options.mapRow) return options.mapRow;
  return (row: Row) => {
    const mapped: Record<string, unknown> = { ...row };
    const fieldMap: Record<string, string> = {
      created_at: 'createdAt',
      uploaded_at: 'uploadedAt',
      questions_count: 'questionsCount',
      xp_reward: 'xpReward',
    };
    for (const [snake, camel] of Object.entries(fieldMap)) {
      if (snake in row && !(camel in row)) {
        mapped[camel] = row[snake];
      }
    }
    return mapped;
  };
}

/**
 * Creates a fully wired CRUD router for a database table.
 */
export function createCrudRouter(options: CrudRouterOptions): Router {
  const router = Router();
  const mapRow = createRowMapper(options);
  const orderColumn = options.orderBy || 'created_at';
  const orderAsc = options.orderAsc ?? false;

  // ===== LIST (autenticado: conteúdo pode ser restrito por tenant/instituição) =====
  router.get('/', requireAuth, resolveTenant, async (req, res: Response) => {
    try {
      const tenantScoped = options.tenantScoped !== false;
      const tenantId = req.tenantId;

      const cacheKey = tenantScoped && tenantId ? `${options.cacheKey}:${tenantId}` : options.cacheKey;
      const cached = await cacheGet<unknown[]>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      let builder = dbAdmin.from(options.table).select('*');
      if (tenantScoped && tenantId) {
        builder = builder.eq('tenant_id', tenantId);
      }
      const { data, error } = await builder.order(orderColumn, { ascending: orderAsc });

      if (error) throw error;

      const mapped = (data || []).map((row: Row) => mapRow(row));
      await cacheSet(cacheKey, mapped);
      res.json(mapped);
    } catch (err: any) {
      log.error(`[${options.table} List] Error:`, err);
      res.status(500).json({ error: 'Erro interno ao listar.' });
    }
  });

  // ===== CREATE =====
  const writeGuard = options.writePermission
    ? [requireAuth, resolveTenant, requirePermission(options.writePermission)]
    : [requireAdmin, resolveTenant];

  router.post('/', rateLimiter(10, 60_000), ...writeGuard, async (req, res: Response) => {
    try {
      const validation = options.validate(req.body);
      if ('error' in validation) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const insertData: Row = {
        ...options.defaults,
        ...mapFieldNames(validation.data, options.fieldMap),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (options.tenantScoped !== false && req.tenantId && !insertData.tenant_id) {
        insertData.tenant_id = req.tenantId;
      }

      if (options.table === 'materials') {
        insertData.uploaded_at = new Date().toISOString();
      }

      const { data: result, error } = await dbAdmin
        .from(options.table)
        .insert(insertData)
        .select('*')
        .single();

      if (error) throw error;

      const invalidateKeys = [options.cacheKey, ...(options.extraInvalidateKeys || [])];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);

      const title = (result.title as string) || validation.data.title as string || 'Novo item';
      await addNotification(
        `Novo ${options.notificationType}`,
        title,
        options.notificationType,
        req.tenantId || null,
      );

      res.status(201).json(mapRow(result));
    } catch (err: any) {
      log.error(`[${options.table} Create] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to create' });
    }
  });

  // ===== UPDATE =====
  router.put('/:id', rateLimiter(10, 60_000), ...writeGuard, async (req, res: Response) => {
    try {
      const { id } = req.params;
      const validation = options.validate(req.body, true);
      if ('error' in validation) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const updates: Row = {
        ...mapFieldNames(validation.data, options.fieldMap),
        updated_at: new Date().toISOString(),
      };

      let builder = dbAdmin.from(options.table).update(updates);
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { data, error } = await builder.eq('id', id).select('*').single();

      if (error) throw error;
      const invalidateKeys = [options.cacheKey];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);
      res.json(mapRow(data));
    } catch (err: any) {
      log.error(`[${options.table} Update] Error:`, err);
      res.status(500).json({ error: 'Erro interno ao atualizar.' });
    }
  });

  // ===== DELETE =====
  router.delete('/:id', rateLimiter(10, 60_000), ...writeGuard, async (req, res: Response) => {
    try {
      const { id } = req.params;

      if (options.onBeforeDelete) {
        await options.onBeforeDelete(id);
      }

      let builder = dbAdmin.from(options.table).delete();
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { error } = await builder.eq('id', id);

      if (error) throw error;
      const invalidateKeys = [options.cacheKey];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);
      res.json({ success: true });
    } catch (err: any) {
      log.error(`[${options.table} Delete] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to delete' });
    }
  });

  // ===== GET BY ID (autenticado + mesmo tenant; sem tenant resolve → 404) =====
  router.get('/:id', requireAuth, resolveTenant, async (req, res: Response) => {
    try {
      const { id } = req.params;
      // Escopo por tenant garante isolamento entre instituições. Sem tenant
      // resolvido, nega (evita furo cross-tenant pela rota por ID).
      if (options.tenantScoped !== false && !req.tenantId) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      let builder = dbAdmin.from(options.table).select('*');
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { data, error } = await builder.eq('id', id).maybeSingle();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(mapRow(data));
    } catch (err) {
      log.error(`[${options.table} Get] Error:`, err);
      res.status(500).json({ error: 'Erro interno ao buscar.' });
    }
  });

  return router;
}
