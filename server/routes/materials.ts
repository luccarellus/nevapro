import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/auth';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { cacheInvalidate, cacheGet, cacheSet } from '../services/cache';
import { addNotification } from '../services/notification';
import { CACHE_KEYS } from '../types';
import { validateMaterialInput } from '../utils/validation';

const router = Router();

// ============= LIST =============
router.get('/', async (req, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.MATERIALS);
    if (cached) {
      res.json(cached);
      return;
    }

    const { data, error }: any = await getSupabaseAdminClient()
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((m: Record<string, unknown>) => ({
      id: m.id,
      title: m.title,
      subject: m.subject,
      foco: m.foco,
      description: m.description,
      url: m.url,
      type: m.type,
      uploadedAt: (m as any).uploaded_at || m.created_at,
    }));

    await cacheSet(CACHE_KEYS.MATERIALS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error('[Materials] Error:', err);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// ============= CREATE =============
router.post('/', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const validation = validateMaterialInput(req.body);
    if ('error' in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { title, type, subject, foco, url, description } = validation.data;
    const { data, error } = await getSupabaseAdminClient()
      .from('materials')
      .insert([
        {
          title,
          type,
          subject,
          foco,
          url,
          description,
          uploaded_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification('Novo Material', `"${title}" em ${foco || subject || 'ENEM geral'}.`, 'material');
    const mappedResult = {
      id: data.id,
      title: data.title,
      subject: data.subject,
      foco: data.subject,
      description: data.description,
      url: data.url,
      type: data.type,
      uploadedAt: data.uploaded_at || data.created_at,
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error('[Materials Create] Error:', err);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// ============= UPDATE =============
router.put('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validation = validateMaterialInput(req.body, true);
    if ('error' in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const updates = { ...validation.data, updated_at: new Date().toISOString() };

    const { data, error } = await getSupabaseAdminClient()
      .from('materials')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS);
    res.json(data);
  } catch (err) {
    log.error('[Materials Update] Error:', err);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// ============= DELETE =============
router.delete('/:id', rateLimiter(10, 60_000), requireAdmin, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from('materials').delete().eq('id', id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS);
    res.json({ success: true });
  } catch (err) {
    log.error('[Materials Delete] Error:', err);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// GET by id
router.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await getSupabaseAdminClient()
      .from('materials')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error('[Materials Get] Error:', err);
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

export default router;
