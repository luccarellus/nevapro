import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { log } from '../utils/logger';
import { cacheGet, cacheSet } from '../services/cache';
import { CACHE_KEYS } from '../types';

const router = Router();

// ============= LEADERBOARD (autenticado: expõe nomes/xp de usuários) =============
router.get('/', requireAuth, resolveTenant, async (req, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const cacheKey = tenantId ? `${CACHE_KEYS.LEADERBOARD}:${tenantId}` : CACHE_KEYS.LEADERBOARD;
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    let builder = dbAdmin
      .from('users')
      .select('name, city, xp, level, avatar_url')
      .not('role', 'is', null)
      .neq('role', 'admin')
      .eq('show_in_leaderboard', true);

    if (tenantId) {
      builder = builder.eq('tenant_id', tenantId);
    }

    const { data, error } = await builder.order('xp', { ascending: false }).limit(20);

    if (error) throw error;

    const filteredLeaderboard = (data || []).map((u: Record<string, unknown>) => ({
      name: u.name,
      city: u.city,
      xp: (u as any).xp || 0,
      level: (u as any).level || 1,
      avatarUrl: resolveStoredFileUrl((u as any).avatar_url),
    }));

    await cacheSet(cacheKey, filteredLeaderboard);
    res.json(filteredLeaderboard);
  } catch (err) {
    log.error('[Leaderboard] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar ranking' });
  }
});

export default router;
