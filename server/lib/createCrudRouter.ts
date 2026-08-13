/**
 * CRUD Router Factory
 *
 * Eliminates the ~90% duplicated CRUD pattern across events, materials, and mural routes.
 *
 * Instead of repeating:
 *   GET    /         → cache → select → map → cache → response
 *   POST   /         → validate → insert → cacheInvalidate → notification → response
 *   PUT    /:id      → validate → update → cacheInvalidate → response
 *   DELETE /:id      → delete → cacheInvalidate → response
 *   GET    /:id      → maybeSingle → response
 *
 * Usage:
 *   const router = createCrudRouter<RowType>({
 *     table: 'materials',
 *     cacheKey: CACHE_KEYS.MATERIALS,
 *     validate: validateMaterialInput,
 *     notificationType: 'material',
 *     mapRow: (row) => ({ id: row.id, title: row.title, ... }),
 *   });
 *   export default router;
 */

import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheInvalidate, cacheGet, cacheSet } from '../services/cache';
import { addNotification } from '../services/notification';
import { CACHE_KEYS } from '../types';
import { PermissionCode } from './permissions';

type Row = Record<string, unknown>;
type ValidationFn = (body: unknown, partial?: boolean) => { data: Row } | { error: string };
type RowMapper = (row: Row) => Record<string, unknown>;

interface CrudRouterOptions {
  /** Supabase table name (e.g. 'materials', 'events', 'mural') */
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
  /**
   * Optional: maps validation field names (camelCase) to DB column names (snake_case).
   * E.g. { questionsCount: 'questions_count', xpReward: 'xp_reward' }
   */
  fieldMap?: Record<string, string>;
  /**
   * Optional: default values for DB fields when not provided in request.
   * E.g. { questions_count: 0, xp_reward: 0 }
   */
  defaults?: Record<string, unknown>;
  /**
   * Optional: async callback executed BEFORE deleting a row.
   * Useful for cleaning up associated resources (e.g. deleting files from B2).
   * Receives the id of the item being deleted.
   */
  onBeforeDelete?: (id: string) => Promise<void>;
}

/**
 * Maps camelCase field names to snake_case DB columns.
 * Only renames fields that exist in both the source and the mapping.
 * Does NOT overwrite existing target keys (preserves original field precedence).
 */
function mapFieldNames(data: Row, fieldMap?: Record<string, string>): Row {
  if (!fieldMap) return data;
  const result: Row = { ...data };
  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (camel in result && camel !== snake) {
      // Only set if the target key doesn't already exist in original data
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

  // Default: pass through with underscore→camelCase conversion for known fields
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
 * Creates a fully wired CRUD router for a Supabase table.
 */
export function createCrudRouter(options: CrudRouterOptions): Router {
  const router = Router();
  const mapRow = createRowMapper(options);
  const orderColumn = options.orderBy || 'created_at';
  const orderAsc = options.orderAsc ?? false;

  // ===== LIST =====
  router.get('/', resolveTenant, async (req, res: Response) => {
    try {
      const tenantScoped = options.tenantScoped !== false;
      const tenantId = req.tenantId;

      // Cache por tenant para garantir isolamento
      const cacheKey = tenantScoped && tenantId ? `${options.cacheKey}:${tenantId}` : options.cacheKey;
      const cached = await cacheGet<unknown[]>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      let builder = getSupabaseAdminClient().from(options.table).select('*');
      if (tenantScoped && tenantId) {
        builder = builder.eq('tenant_id', tenantId);
      }
      const { data, error } = await builder.order(orderColumn, { ascending: orderAsc });

      if (error) throw error;

      const mapped = (data || []).map((row: Row) => mapRow(row));
      await cacheSet(cacheKey, mapped);
      res.json(mapped);
    } catch (err) {
      log.error(`[${options.table} List] Error:`, err);
      res.status(500).json({ error: 'Failed to fetch data' });
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

      // Map camelCase fields to snake_case DB columns
      const insertData: Row = {
        ...options.defaults,
        ...mapFieldNames(validation.data, options.fieldMap),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Escopo de tenant: associa o registro ao tenant ativo da requisição
      if (options.tenantScoped !== false && req.tenantId && !insertData.tenant_id) {
        insertData.tenant_id = req.tenantId;
      }

      // Handle table-specific date columns
      if (options.table === 'materials') {
        insertData.uploaded_at = new Date().toISOString();
      }

      const { data: result, error } = await getSupabaseAdminClient()
        .from(options.table)
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      // Invalidate caches (incluindo o do tenant)
      const invalidateKeys = [options.cacheKey, ...(options.extraInvalidateKeys || [])];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);

      // Send notification (escopada ao tenant ativo da requisição)
      const title = (result.title as string) || validation.data.title as string || 'Novo item';
      await addNotification(
        `Novo ${options.notificationType}`,
        title,
        options.notificationType,
        req.tenantId || null,
      );

      res.status(201).json(mapRow(result));
    } catch (err) {
      log.error(`[${options.table} Create] Error:`, err);
      res.status(500).json({ error: 'Failed to create' });
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

      // Escopo de tenant no update: só atualiza registros do tenant ativo
      let builder = getSupabaseAdminClient().from(options.table).update(updates);
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { data, error } = await builder.eq('id', id).select().single();

      if (error) throw error;
      const invalidateKeys = [options.cacheKey];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);
      res.json(data);
    } catch (err) {
      log.error(`[${options.table} Update] Error:`, err);
      res.status(500).json({ error: 'Failed to update' });
    }
  });

  // ===== DELETE =====
  router.delete('/:id', rateLimiter(10, 60_000), ...writeGuard, async (req, res: Response) => {
    try {
      const { id } = req.params;

      // Run pre-delete cleanup (e.g. B2 file deletion)
      if (options.onBeforeDelete) {
        await options.onBeforeDelete(id);
      }

      let builder = getSupabaseAdminClient().from(options.table).delete();
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { error } = await builder.eq('id', id);

      if (error) throw error;
      const invalidateKeys = [options.cacheKey];
      if (req.tenantId) invalidateKeys.push(`${options.cacheKey}:${req.tenantId}`);
      await cacheInvalidate(...invalidateKeys);
      res.json({ success: true });
    } catch (err) {
      log.error(`[${options.table} Delete] Error:`, err);
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  // ===== GET BY ID =====
  router.get('/:id', resolveTenant, async (req, res: Response) => {
    try {
      const { id } = req.params;
      let builder = getSupabaseAdminClient().from(options.table).select('*');
      if (options.tenantScoped !== false && req.tenantId) {
        builder = builder.eq('tenant_id', req.tenantId);
      }
      const { data, error } = await builder.eq('id', id).maybeSingle();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(data);
    } catch (err) {
      log.error(`[${options.table} Get] Error:`, err);
      res.status(500).json({ error: 'Failed to fetch' });
    }
  });

  return router;
}
