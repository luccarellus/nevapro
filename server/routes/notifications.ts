import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdminClient } from '../../src/lib/dbQueryBuilder';
import { log } from '../utils/logger';

const router = Router();

// ============= LIST NOTIFICATIONS =============
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const { data: user } = await getSupabaseAdminClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      res.json([]);
      return;
    }

    const { data, error } = await getSupabaseAdminClient()
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((n: Record<string, unknown>) => ({
      id: n.id,
      user_id: n.user_id,
      title: n.title,
      message: (n as any).content || '',
      type: n.type,
      read: (n as any).is_read || false,
      createdAt: (n as any).created_at || new Date().toISOString(),
    }));

    // Deduplicate
    const seen = new Set<string>();
    const uniqueMapped = [];
    for (const n of mapped) {
      const key = `${n.title}-${n.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMapped.push(n);
      }
    }

    res.json(uniqueMapped);
  } catch (err) {
    log.error('[Notifications] Error:', err);
    res.json([]);
  }
});

// ============= READ ALL =============
router.post('/read-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const { data: user } = await getSupabaseAdminClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      res.json({ success: false, error: 'User not found' });
      return;
    }

    const { error } = await getSupabaseAdminClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    log.error('[Notifications ReadAll] Error:', err);
    res.json({ success: false });
  }
});

// ============= READ SINGLE =============
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: notif } = await getSupabaseAdminClient()
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!notif) {
      res.status(404).json({ error: 'Notificação não encontrada' });
      return;
    }

    // Verify ownership
    const { data: user } = await getSupabaseAdminClient()
      .from('users')
      .select('id')
      .eq('email', req.user?.email || '')
      .maybeSingle();

    if (req.user?.role !== 'admin' && user && notif.user_id !== user.id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { error } = await getSupabaseAdminClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    log.error('[Notification Read] Error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
