import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';

const router = Router();

/**
 * Helper: busca o user_id pelo email.
 */
async function getUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await query('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [email]);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Helper: marca uma notificação global como lida para um usuário.
 * Usa INSERT ... ON CONFLICT DO NOTHING para evitar duplicatas.
 */
async function markGlobalNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  await query(
    `INSERT INTO public.notification_reads (id, user_id, notification_id, read_at)
     VALUES (gen_random_uuid(), $1, $2, NOW())
     ON CONFLICT (user_id, notification_id) DO NOTHING`,
    [userId, notificationId],
  );
}

// ============= LIST NOTIFICATIONS =============
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      res.json([]);
      return;
    }

    // 1. Busca notificações (próprias + globais)
    const { data: notifications, error } = await getSupabaseAdminClient()
      .from('notifications')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 2. Busca registros de leitura do usuário para notificações globais
    const { data: reads } = await getSupabaseAdminClient()
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId);

    const readGlobalIds = new Set((reads || []).map((r: any) => r.notification_id));

    // 3. Mergeia os dados
    const mapped = (notifications || []).map((n: Record<string, unknown>) => {
      const isGlobal = n.user_id === null;

      return {
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        message: (n as any).content || '',
        type: n.type,
        read: isGlobal ? readGlobalIds.has(n.id) : !!(n as any).is_read,
        createdAt: (n as any).created_at || new Date().toISOString(),
      };
    });

    res.json(mapped);
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
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      res.json({ success: false, error: 'User not found' });
      return;
    }

    // 1. Marca notificações do usuário como lidas
    await getSupabaseAdminClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    // 2. Marca notificações globais como lidas — query única e parametrizada
    await query(
      `INSERT INTO public.notification_reads (user_id, notification_id)
       SELECT $1, id FROM public.notifications
       WHERE user_id IS NULL
         AND id <> ALL (
           SELECT notification_id FROM public.notification_reads WHERE user_id = $1
         )`,
      [userId],
    );

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

    const userId = await getUserIdByEmail(req.user?.email || '');

    if (req.user?.role !== 'admin' && userId && notif.user_id && notif.user_id !== userId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    if (notif.user_id === null && userId) {
      // Notificação global — usa notification_reads
      await markGlobalNotificationAsRead(id, userId);
    } else {
      // Notificação do usuário — usa is_read diretamente
      const { error } = await getSupabaseAdminClient()
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) {
    log.error('[Notification Read] Error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
