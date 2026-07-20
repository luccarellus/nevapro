import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/auth';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheInvalidate, cacheGet, cacheSet } from '../services/cache';
import { addNotification } from '../services/notification';
import { CACHE_KEYS } from '../types';
import { validateMuralInput } from '../utils/validation';

const router = Router();

// ============= LIST =============
router.get('/', async (req, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.RECADOS);
    if (cached) {
      res.json(cached);
      return;
    }

    const { data, error } = await getSupabaseAdminClient()
      .from('mural')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((m: Record<string, unknown>) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      date: (m as any).created_at || new Date().toISOString(),
      sender: (m as any).sender || 'Administração',
      category: (m as any).type || 'geral',
      tag: (m as any).tag || '',
    }));

    await cacheSet(CACHE_KEYS.RECADOS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error('[Mural] Error:', err);
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
});

// ============= CREATE =============
router.post('/', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const validation = validateMuralInput(req.body);
    if ('error' in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { title, content, type, category, tag } = validation.data;
    const { data: result, error } = await getSupabaseAdminClient()
      .from('mural')
      .insert([
        {
          title,
          content,
          type: type || category || 'GERAL',
          tag,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification('Novo Recado', `${title}`, 'mural');
    const mappedResult = {
      id: result.id,
      title: result.title,
      content: result.content,
      sender: 'Administração',
      date: result.created_at || new Date().toISOString(),
      category: (result.type || 'geral').toLowerCase(),
      tag: result.type || 'Geral',
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error('[Mural Create] Error:', err);
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

// ============= UPDATE =============
router.put('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validation = validateMuralInput(req.body, true);
    if ('error' in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { category, ...fields } = validation.data;
    const updates = { ...fields, ...(category !== undefined ? { type: category } : {}) };

    const { data, error } = await getSupabaseAdminClient()
      .from('mural')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS);
    res.json(data);
  } catch (err) {
    log.error('[Mural Update] Error:', err);
    res.status(500).json({ error: 'Failed to update notice' });
  }
});

// ============= DELETE =============
router.delete('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from('mural').delete().eq('id', id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS);
    res.json({ success: true });
  } catch (err) {
    log.error('[Mural Delete] Error:', err);
    res.status(500).json({ error: 'Failed to delete notice' });
  }
});

export default router;
