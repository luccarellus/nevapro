import { Router, Response } from 'express';
import { query } from '../../src/lib/db';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { issueCsrfToken } from '../middleware/csrf';
import { AuthenticatedRequest } from '../types';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { log } from '../utils/logger';
import { resolveStoredFileUrl } from '../utils/storageUrl';

const router = Router();

router.get('/', requireAuth, resolveTenant, async (req: AuthenticatedRequest & { cookies?: Record<string, string> }, res: Response) => {
  const email = req.user?.email || '';
  const tenantId = req.tenantId;
  const cacheKey = tenantId ? `${userCacheKeys.bootstrap(email)}:${tenantId}` : userCacheKeys.bootstrap(email);
  try {
    // Token anti-CSRF nunca deve vir de cache (depende do cookie corrente).
    const csrfToken = issueCsrfToken(req as any);
    const cached = await getUserCache<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached, csrfToken });
      return;
    }
    // Run 3 queries in parallel instead of a single heavy CTE
    const [userRow, materialsResult, leaderboardResult, xpLogsResult] = await Promise.all([
      query(
        `SELECT id, flash_quiz_completed FROM public.users WHERE email = $1 LIMIT 1`,
        [email],
      ),
      query(
        `SELECT id, title, subject, foco, description, url, type, COALESCE(uploaded_at, created_at) AS "uploadedAt"
         FROM public.materials m
         WHERE ($1::uuid IS NULL OR m.tenant_id = $1)
         ORDER BY m.created_at DESC`,
        [tenantId || null],
      ),
      query(
        `SELECT name, city, xp, level, avatar_url
         FROM public.users
         WHERE role <> 'admin' AND show_in_leaderboard = true
           AND ($1::uuid IS NULL OR tenant_id = $1)
         ORDER BY xp DESC LIMIT 20`,
        [tenantId || null],
      ),
      query(
        `SELECT amount, created_at AS "createdAt", reason
         FROM public.xp_logs x
         WHERE x.user_id = (SELECT id FROM public.users WHERE email = $1 LIMIT 1)
           AND x.created_at >= NOW() - INTERVAL '7 days'`,
        [email],
      ),
    ]);

    const row = {
      flash_quiz_completed: userRow.rows[0]?.flash_quiz_completed ?? false,
      materials: materialsResult.rows,
      leaderboard: leaderboardResult.rows,
      xp_logs: xpLogsResult.rows,
    };
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekly = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - offset));
      const dateKey = date.toISOString().slice(0, 10);
      const xp = (row.xp_logs || []).filter((entry: any) => String(entry.createdAt).slice(0, 10) === dateKey)
        .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0);
      return { day: days[date.getDay()], xp, fullDate: dateKey };
    });
    const xps = weekly.map((entry) => entry.xp);
    const total = xps.reduce((sum, xp) => sum + xp, 0);
    const payload = {
      materials: row.materials || [],
      leaderboard: (row.leaderboard || []).map((entry: any) => ({
        ...entry,
        avatarUrl: resolveStoredFileUrl(entry.avatarUrl),
      })),
      stats: {
        weekly,
        summary: { average: Math.round(total / 7), best: Math.max(...xps, 0), total },
        flashQuizCompleted: row.flash_quiz_completed === true,
        quizSecondsRemaining: 0,
      },
    };
    await setUserCache(cacheKey, payload, 300);
    res.json({ ...payload, csrfToken });
  } catch (error) {
    log.error('[Bootstrap] Error:', error);
    res.status(500).json({ error: 'Erro ao carregar dados iniciais.' });
  }
});

export default router;
