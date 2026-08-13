import { query } from '../../src/lib/db.js';
import { log } from '../utils/logger';

/**
 * Adds a global notification visible to ALL users.
 *
 * Uses a single notification with user_id = NULL (global) instead of
 * inserting N rows for N users. This scales to any number of users.
 *
 * The client-side query fetches notifications WHERE user_id IS NULL OR user_id = $1.
 */
export const addNotification = async (
  title: string,
  message: string,
  type: string,
  tenantId?: string | null,
): Promise<void> => {
  try {
    await query(
      `INSERT INTO public.notifications (id, user_id, title, content, type, is_read, tenant_id, created_at)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, false, $4, NOW())`,
      [title, message, type.toLowerCase(), tenantId || null],
    );
    log.info(`[addNotification] Global notification sent: "${title}" (tenant: ${tenantId || 'global'})`);
  } catch (e) {
    log.error('[addNotification] Failed to save notification:', e);
  }
};
