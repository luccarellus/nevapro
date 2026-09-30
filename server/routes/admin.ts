import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { cacheGet, cacheSet } from '../services/cache';
import { CACHE_KEYS } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { PERMISSIONS } from '../lib/permissions';

const router = Router();

// ============= LIST STUDENTS =============
router.get(
  '/users',
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.USERS_MANAGE_STUDENTS, PERMISSIONS.USERS_MANAGE_TEACHERS),
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const cacheKey = tenantId ? `${CACHE_KEYS.ADMIN_USERS}:${tenantId}` : CACHE_KEYS.ADMIN_USERS;
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Seleção explícita: NUNCA expor password_hash/internal metrics na listagem
    let builder = dbAdmin.from('users').select('id, email, name, role, avatar_url, city, school, gremio, answered_questions, correct_answers, xp, level, streak, points, rank, tenant_id, show_in_leaderboard, language_preference, flash_quiz_completed, created_at, updated_at');
    if (tenantId) {
      builder = builder.eq('tenant_id', tenantId);
    }
    const { data, error } = await builder.order('xp', { ascending: false });

    if (error) throw error;

    const regularStudents = (data || [])
      .filter((u: Record<string, unknown>) => u.role !== 'admin')
      .map((u: Record<string, unknown>) => ({
        ...u,
        answeredQuestions: (u as any).answered_questions || (u as any).answeredQuestions || 0,
        correctAnswers: (u as any).correct_answers || (u as any).correctAnswers || 0,
        avatarUrl: resolveStoredFileUrl((u as any).avatar_url || (u as any).avatarUrl || (u as any).avatar),
      }));

    await cacheSet(cacheKey, regularStudents);
    res.json(regularStudents);
  } catch (err) {
    log.error('[Admin Users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============= ADMIN ACTIVITIES =============
router.get(
  '/activities',
  requireAuth,
  resolveTenant,
  requirePermission(
    PERMISSIONS.ANALYTICS_TENANT_SUMMARY,
    PERMISSIONS.USERS_MANAGE_STUDENTS,
    PERMISSIONS.USERS_MANAGE_TEACHERS,
  ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.tenantId;
      const isSuperAdmin = (req as any).rbacContext?.isSuperAdmin;
      const cacheKey = tenantId ? `${CACHE_KEYS.ADMIN_ACTIVITIES}:${tenantId}` : CACHE_KEYS.ADMIN_ACTIVITIES;
      const cached = await cacheGet<{ activities: unknown[]; production: unknown[] }>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      // Query XP logs scoped by tenant
      const logQuery = isSuperAdmin && !tenantId
        ? `SELECT x.*, u.name as user_name, u.city as user_city
           FROM xp_logs x
           LEFT JOIN users u ON x.user_id = u.id
           ORDER BY x.created_at DESC
           LIMIT 20`
        : `SELECT x.*, u.name as user_name, u.city as user_city
           FROM xp_logs x
           JOIN users u ON x.user_id = u.id
           WHERE ($1::uuid IS NULL OR u.tenant_id = $1)
           ORDER BY x.created_at DESC
           LIMIT 20`;

      const { rows: logs } = await query(logQuery, isSuperAdmin && !tenantId ? [] : [tenantId || null]);

      const activities = (logs || []).map((logEntry: Record<string, unknown>) => {
        const logDate = new Date(logEntry.created_at as string);
        const diff = Math.floor((Date.now() - logDate.getTime()) / 60000);
        let timeStr = 'Agora';
        if (diff > 0 && diff < 60) timeStr = `Há ${diff} min`;
        else if (diff >= 60 && diff < 1440) timeStr = `Há ${Math.floor(diff / 60)}h`;
        else if (diff >= 1440) timeStr = `Há ${Math.floor(diff / 1440)} dias`;

        return {
          id: logEntry.id,
          user: logEntry.user_name || 'Estudante',
          action: `Ganhou ${logEntry.amount} XP: ${logEntry.reason || 'Atividade'}`,
          time: timeStr,
          city: logEntry.user_city || 'Brasil',
        };
      });

      // Weekly production scoped by tenant
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let matsBuilder = dbAdmin
        .from('materials')
        .select('uploaded_at')
        .gte('uploaded_at', sevenDaysAgo.toISOString().split('T')[0]);

      let recsBuilder = dbAdmin
        .from('mural')
        .select('created_at')
        .gte('created_at', sevenDaysAgo.toISOString());

      if (tenantId && (!isSuperAdmin || tenantId)) {
        matsBuilder = matsBuilder.eq('tenant_id', tenantId);
        recsBuilder = recsBuilder.eq('tenant_id', tenantId);
      }

      const [mats, recs] = await Promise.all([
        matsBuilder.execute(),
        recsBuilder.execute(),
      ]);

      const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
      const production: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        production[days[d.getDay()]] = 0;
      }

      for (const m of mats.data || []) {
        const d = new Date((m as any).uploaded_at);
        const day = days[d.getDay()];
        if (production[day] !== undefined) production[day]++;
      }

      for (const r of recs.data || []) {
        const d = new Date((r as any).created_at || (r as any).date);
        const day = days[d.getDay()];
        if (production[day] !== undefined) production[day]++;
      }

      const productionList = Object.entries(production).map(([day, value]) => ({ day, value }));
      const result = { activities, production: productionList };

      await cacheSet(cacheKey, result);
      res.json(result);
    } catch (err) {
      log.error('[Admin Activities] Error:', err);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  },
);

export default router;
