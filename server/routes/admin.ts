import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { getClient, query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '../services/cache';
import { CACHE_KEYS, CACHE_TTL } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { extractObjectKey } from '../utils/extractObjectKey';
import { invalidateUserCache } from '../services/userCache';
import { PERMISSIONS } from '../lib/permissions';

const B2_BUCKET = process.env.B2_BUCKET_NAME || 'neva-avatars';

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

    // TTL explícito: chaves com sufixo de tenant ("cache:admin:users:{id}")
    // não batem no mapa CACHE_TTL e cairiam no default genérico de 300s.
    await cacheSet(cacheKey, regularStudents, CACHE_TTL[CACHE_KEYS.ADMIN_USERS]);
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

      await cacheSet(cacheKey, result, CACHE_TTL[CACHE_KEYS.ADMIN_ACTIVITIES]);
      res.json(result);
    } catch (err) {
      log.error('[Admin Activities] Error:', err);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  },
);

// ============= UPDATE USER (tenant-scoped) =============
/**
 * Espelha AdminController@updateUser (Laravel): admin/tenant_admin atualiza
 * nome/cidade/escola/leaderboard/contadores de um estudante do seu tenant.
 * Valores numéricos são validados no servidor; correctAnswers nunca pode
 * exceder answeredQuestions.
 */
router.put(
  '/users/:id',
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.USERS_MANAGE_STUDENTS, PERMISSIONS.USERS_MANAGE_TEACHERS),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    const body = req.body || {};

    // Validação (espelha $request->validate do Laravel)
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 255)) {
      res.status(422).json({ error: 'Nome inválido.' });
      return;
    }
    if (body.city !== undefined && body.city !== null && (typeof body.city !== 'string' || body.city.length > 120)) {
      res.status(422).json({ error: 'Cidade inválida.' });
      return;
    }
    if (body.school !== undefined && body.school !== null && (typeof body.school !== 'string' || body.school.length > 255)) {
      res.status(422).json({ error: 'Escola inválida.' });
      return;
    }
    if (body.showInLeaderboard !== undefined && typeof body.showInLeaderboard !== 'boolean') {
      res.status(422).json({ error: 'showInLeaderboard deve ser booleano.' });
      return;
    }
    const intField = (value: unknown): number | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error('invalid_int');
      }
      return value;
    };
    let xp: number | undefined;
    let answeredQuestions: number | undefined;
    let correctAnswers: number | undefined;
    try {
      xp = intField(body.xp);
      answeredQuestions = intField(body.answeredQuestions);
      correctAnswers = intField(body.correctAnswers);
    } catch {
      res.status(422).json({ error: 'Contador inválido: esperado inteiro não negativo.' });
      return;
    }

    try {
      // Escopo do tenant: super_admin (sem tenant) gerencia todos;
      // tenant_admin só os do próprio tenant (findOrFail → 404 fora do escopo).
      let finder = dbAdmin.from('users').select('id, email, answered_questions, correct_answers').eq('id', id);
      if (req.tenantId) {
        finder = finder.eq('tenant_id', req.tenantId);
      }
      const { data: user, error: fetchError } = await finder.maybeSingle();
      if (fetchError) throw fetchError;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const currentAnswered = Number(user.answered_questions) || 0;
      const currentCorrect = Number(user.correct_answers) || 0;
      const answered = answeredQuestions ?? currentAnswered;
      const correct = correctAnswers ?? currentCorrect;
      if (correct > answered) {
        res.status(422).json({ error: 'Respostas corretas não podem exceder o total respondido.' });
        return;
      }

      const dbUpdate: Record<string, unknown> = {};
      if (body.name !== undefined) dbUpdate.name = body.name;
      if (body.city !== undefined) dbUpdate.city = body.city;
      if (body.school !== undefined) dbUpdate.school = body.school;
      if (body.showInLeaderboard !== undefined) dbUpdate.show_in_leaderboard = body.showInLeaderboard;
      if (xp !== undefined) dbUpdate.xp = xp;
      if (answeredQuestions !== undefined) dbUpdate.answered_questions = answeredQuestions;
      if (correctAnswers !== undefined) dbUpdate.correct_answers = correctAnswers;

      if (Object.keys(dbUpdate).length > 0) {
        const { error: updateError } = await dbAdmin
          .from('users')
          .update(dbUpdate)
          .eq('id', id);
        if (updateError) throw updateError;
      }

      await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_ACTIVITIES, CACHE_KEYS.ADMIN_USERS);
      await invalidateUserCache(user.email, user.id);
      res.json({ success: true });
    } catch (err) {
      log.error('[Admin Update User] Error:', err);
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  },
);

// ============= DELETE USER (tenant-scoped) =============
/**
 * Espelha AdminController@deleteUser (Laravel): remove o estudante do
 * tenant em transação (papéis no tenant + tokens Sanctum + usuário) e o
 * avatar do B2. Admin da conta própria não é alvo desta rota.
 */
router.delete(
  '/users/:id',
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.USERS_MANAGE_STUDENTS, PERMISSIONS.USERS_MANAGE_TEACHERS),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;

    try {
      let finder = dbAdmin.from('users').select('id, email, avatar_url').eq('id', id);
      if (req.tenantId) {
        finder = finder.eq('tenant_id', req.tenantId);
      }
      const { data: user, error: fetchError } = await finder.maybeSingle();
      if (fetchError) throw fetchError;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const objectKey = user.avatar_url ? extractObjectKey(String(user.avatar_url)) : null;

      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_tenant_roles WHERE user_id = $1', [id]);
        await client.query(
          'DELETE FROM personal_access_tokens WHERE tokenable_id = $1 AND tokenable_type = $2',
          [id, 'App\\Models\\StudentUser'],
        );
        await client.query('DELETE FROM users WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      if (objectKey) {
        try {
          await dbAdmin.storage.from(B2_BUCKET).remove(objectKey);
        } catch (err) {
          log.warn(`[Admin Delete User] Falha ao remover avatar de ${user.email}:`, err);
        }
      }

      await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_ACTIVITIES, CACHE_KEYS.ADMIN_USERS);
      await invalidateUserCache(user.email, user.id);
      res.json({ success: true });
    } catch (err) {
      log.error('[Admin Delete User] Error:', err);
      res.status(500).json({ error: 'Erro ao remover usuário.' });
    }
  },
);

export default router;
