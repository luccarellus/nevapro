/**
 * Materials CRUD routes — generated via createCrudRouter factory.
 */
import { createCrudRouter } from '../lib/createCrudRouter';
import { CACHE_KEYS } from '../types';
import { validateMaterialInput } from '../utils/validation';

const router = createCrudRouter({
  table: 'materials',
  cacheKey: CACHE_KEYS.MATERIALS,
  validate: validateMaterialInput,
  notificationType: 'material',
  extraInvalidateKeys: [CACHE_KEYS.ADMIN_ACTIVITIES],
  mapRow: (m) => ({
    id: m.id,
    title: m.title,
    subject: m.subject,
    foco: m.foco,
    description: m.description,
    url: m.url,
    type: m.type,
    uploadedAt: (m as any).uploaded_at || m.created_at,
  }),
});

export default router;
