import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { cacheInvalidate } from '../services/cache';

const router = Router();

/**
 * Helper: busca o user_id pelo email.
 */
async function getUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await query('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [email]);
  return rows.length > 0 ? rows[0].id : null;
}

const getRequestUserId = (req: AuthenticatedRequest, email: string): Promise<string | null> =>
  req.user?.role === 'student' && req.user.email === email
    ? Promise.resolve(req.user.userId)
    : getUserIdByEmail(email);

/**
 * Helper: marca uma notificação global como lida para um usuário.
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
router.get('/', requireAuth, resolveTenant, async (req: AuthenticatedRequest, res: Response) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const userId = await getRequestUserId(req, email);
    if (!userId) {
      res.json([]);
      return;
    }

    const tenantId = req.tenantId;
    const cacheKey = tenantId ? `${userCacheKeys.notifications(userId)}:${tenantId}` : userCacheKeys.notifications(userId);
    const cached = await getUserCache<unknown[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const { rows } = await query(
      `SELECT n.id, n.user_id, n.title, n.content AS message, n.type,
              CASE WHEN n.user_id IS NULL THEN (nr.notification_id IS NOT NULL) ELSE n.is_read END AS read,
              n.created_at AS "createdAt"
       FROM public.notifications n
       LEFT JOIN public.notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE (n.user_id = $1 OR n.user_id IS NULL)
         AND ($2::uuid IS NULL OR n.tenant_id = $2 OR n.tenant_id IS NULL)
       ORDER BY n.created_at DESC`,
      [userId, tenantId || null],
    );
    await setUserCache(cacheKey, rows, 45);
    res.json(rows);
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
    const userId = await getRequestUserId(req, email);
    if (!userId) {
      res.json({ success: false, error: 'User not found' });
      return;
    }

    // 1. Marca notificações do usuário como lidas
    await dbAdmin
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
    if (userId) await cacheInvalidate(userCacheKeys.notifications(userId));
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

    const { data: notif } = await dbAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!notif) {
      res.status(404).json({ error: 'Notificação não encontrada' });
      return;
    }

    const userId = await getRequestUserId(req, req.user?.email || '');

    if (req.user?.role !== 'admin' && userId && notif.user_id && notif.user_id !== userId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    if (notif.user_id === null && userId) {
      // Notificação global — usa notification_reads
      await markGlobalNotificationAsRead(id, userId);
    } else {
      // Notificação do usuário — usa is_read diretamente
      const { error } = await dbAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    }

    if (userId) await cacheInvalidate(userCacheKeys.notifications(userId));
    res.json({ success: true });
  } catch (err) {
    log.error('[Notification Read] Error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
