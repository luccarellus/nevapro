/**
 * Mural CRUD routes — generated via createCrudRouter factory.
 */
import { createCrudRouter } from '../lib/createCrudRouter';
import { CACHE_KEYS } from '../types';
import { validateMuralInput } from '../utils/validation';

const router = createCrudRouter({
  table: 'mural',
  cacheKey: CACHE_KEYS.RECADOS,
  validate: validateMuralInput,
  notificationType: 'mural',
  extraInvalidateKeys: [CACHE_KEYS.ADMIN_ACTIVITIES],
  fieldMap: { category: 'type' },
  defaults: { type: 'GERAL' },
  mapRow: (m) => ({
    id: m.id,
    title: m.title,
    content: m.content,
    date: (m as any).created_at || new Date().toISOString(),
    sender: (m as any).sender || 'Administração',
    category: ((m as any).type || 'geral').toLowerCase(),
    tag: (m as any).tag || '',
  }),
});

export default router;
