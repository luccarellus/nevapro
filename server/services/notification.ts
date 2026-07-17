import { query } from '../../src/lib/db.js';
import { log } from '../utils/logger';

/**
 * Creates a notification for ALL users using a single efficient SQL query.
 * 
 * Before: N+1 — fetched all user IDs, then inserted N records (expensive with 10k+ users).
 * After: Single INSERT FROM SELECT query — efficient regardless of user count.
 */
export const addNotification = async (
  title: string,
  message: string,
  type: string,
): Promise<void> => {
  try {
    await query(
      `INSERT INTO public.notifications (id, user_id, title, content, type, is_read, created_at)
       SELECT gen_random_uuid(), id, $1, $2, $3, false, NOW()
       FROM public.users`,
      [title, message, type.toLowerCase()],
    );
    log.info(`[addNotification] Notification sent to all users: "${title}"`);
  } catch (e) {
    log.error('[addNotification] Failed to save notification:', e);
  }
};
