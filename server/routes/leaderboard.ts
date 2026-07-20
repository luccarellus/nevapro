import { Router, Response } from 'express';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheGet, cacheSet } from '../services/cache';
import { CACHE_KEYS } from '../types';

const router = Router();

// ============= LEADERBOARD =============
router.get('/', async (req, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.LEADERBOARD);
    if (cached) {
      res.json(cached);
      return;
    }

    const { data, error } = await getSupabaseAdminClient()
      .from('users')
      .select('name, city, xp, level, avatar_url')
      .not('role', 'is', null)
      .neq('role', 'admin')
      .eq('show_in_leaderboard', true)
      .order('xp', { ascending: false })
      .limit(20);

    if (error) throw error;

    const filteredLeaderboard = (data || []).map((u: Record<string, unknown>) => ({
      name: u.name,
      city: u.city,
      xp: (u as any).xp || 0,
      level: (u as any).level || 1,
      avatarUrl: (u as any).avatar_url || '',
    }));

    await cacheSet(CACHE_KEYS.LEADERBOARD, filteredLeaderboard);
    res.json(filteredLeaderboard);
  } catch (err) {
    log.error('[Leaderboard] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

export default router;
