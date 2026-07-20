import { Router, Response } from 'express';
import { query } from '../../src/lib/db';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { log } from '../utils/logger';
import { resolveStoredFileUrl } from '../utils/storageUrl';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = req.user?.email || '';
  const cacheKey = userCacheKeys.bootstrap(email);
  try {
    const cached = await getUserCache<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const { rows } = await query(
      `WITH target AS (SELECT id FROM public.users WHERE email = $1 LIMIT 1)
       SELECT
         COALESCE((SELECT json_agg(json_build_object(
           'id', m.id, 'title', m.title, 'subject', m.subject, 'foco', m.foco,
           'description', m.description, 'url', m.url, 'type', m.type,
           'uploadedAt', COALESCE(m.uploaded_at, m.created_at)
         ) ORDER BY m.created_at DESC) FROM public.materials m), '[]'::json) AS materials,
         COALESCE((SELECT json_agg(json_build_object(
           'name', u.name, 'city', u.city, 'xp', COALESCE(u.xp, 0),
           'level', COALESCE(u.level, 1), 'avatarUrl', COALESCE(u.avatar_url, '')
         ) ORDER BY u.xp DESC) FROM (
           SELECT * FROM public.users WHERE role <> 'admin' AND show_in_leaderboard = true
           ORDER BY xp DESC LIMIT 20
         ) u), '[]'::json) AS leaderboard,
         COALESCE((SELECT json_agg(json_build_object('amount', x.amount, 'createdAt', x.created_at, 'reason', x.reason))
           FROM public.xp_logs x, target t
           WHERE x.user_id = t.id AND x.created_at >= NOW() - INTERVAL '7 days'), '[]'::json) AS xp_logs`,
      [email],
    );
    const row = rows[0] || { materials: [], leaderboard: [], xp_logs: [] };
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
    const lastQuiz = (row.xp_logs || []).filter((entry: any) => entry.reason === 'Flash Quiz: Maranhão')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const elapsed = lastQuiz ? Date.now() - new Date(lastQuiz.createdAt).getTime() : Infinity;
    const payload = {
      materials: row.materials || [],
      leaderboard: (row.leaderboard || []).map((entry: any) => ({
        ...entry,
        avatarUrl: resolveStoredFileUrl(entry.avatarUrl),
      })),
      stats: {
        weekly,
        summary: { average: Math.round(total / 7), best: Math.max(...xps, 0), total },
        flashQuizCompleted: elapsed < 6 * 60 * 60 * 1000,
        quizSecondsRemaining: elapsed < 6 * 60 * 60 * 1000
          ? Math.ceil((6 * 60 * 60 * 1000 - elapsed) / 1000) : 0,
      },
    };
    await setUserCache(cacheKey, payload, 60);
    res.json(payload);
  } catch (error) {
    log.error('[Bootstrap] Error:', error);
    res.status(500).json({ error: 'Erro ao carregar dados iniciais.' });
  }
});

export default router;
