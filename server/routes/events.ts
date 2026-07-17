import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/auth';
import { getSupabaseAdminClient } from '../../src/lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheInvalidate, cacheGet, cacheSet } from '../services/cache';
import { addNotification } from '../services/notification';
import { CACHE_KEYS } from '../types';

const router = Router();

// ============= LIST =============
router.get('/', async (req, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.EVENTOS);
    if (cached) {
      res.json(cached);
      return;
    }

    const { data, error }: any = await getSupabaseAdminClient()
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map((e: Record<string, unknown>) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      type: e.type,
      category: e.category,
      questionsCount: (e as any).questions_count || 0,
      xpReward: (e as any).xp_reward || 0,
      observation: e.observation,
    }));

    await cacheSet(CACHE_KEYS.EVENTOS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error('[Events] Error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ============= CREATE =============
router.post('/', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { title, description, date, time, type, category, questionsCount, xpReward, observation } = req.body;
    const { data: result, error } = await getSupabaseAdminClient()
      .from('events')
      .insert([
        {
          title,
          description,
          date,
          time,
          type,
          category,
          questions_count: questionsCount || 0,
          xp_reward: xpReward || 0,
          observation,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification('Novo Evento', `${title}`, 'evento');
    const mappedResult = {
      id: result.id,
      title: result.title,
      description: result.description,
      date: result.date,
      time: result.time,
      type: result.type,
      category: result.category,
      questionsCount: result.questions_count || 0,
      xpReward: result.xp_reward || 0,
      observation: result.observation,
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error('[Events Create] Error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// ============= UPDATE =============
router.put('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await getSupabaseAdminClient()
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS);
    res.json(data);
  } catch (err) {
    log.error('[Events Update] Error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// ============= DELETE =============
router.delete('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from('events').delete().eq('id', id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS);
    res.json({ success: true });
  } catch (err) {
    log.error('[Events Delete] Error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// GET by id
router.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await getSupabaseAdminClient()
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error('[Events Get] Error:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

export default router;
