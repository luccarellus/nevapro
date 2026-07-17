import { Router, Response } from 'express';
import { getSupabaseAdminClient } from '../../src/lib/dbQueryBuilder';
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
      .select('name, email, city, xp, level, role, show_in_leaderboard, avatar_url');

    if (error) throw error;

    const filteredLeaderboard = (data || [])
      .filter((u: Record<string, unknown>) => {
        if (u.role === 'admin') return false;
        if ((u as any).show_in_leaderboard === false) return false;
        return true;
      })
      .map((u: Record<string, unknown>) => ({
        name: u.name,
        city: u.city,
        xp: (u as any).xp || 0,
        level: (u as any).level || 1,
        avatarUrl: (u as any).avatar_url || '',
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);

    await cacheSet(CACHE_KEYS.LEADERBOARD, filteredLeaderboard);
    res.json(filteredLeaderboard);
  } catch (err) {
    log.error('[Leaderboard] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

export default router;
