/**
 * Materials CRUD routes — generated via createCrudRouter factory.
 *
 * When a material is deleted, the corresponding file is also removed from
 * Backblaze B2 storage (if the URL points to a B2-stored file).
 * O onBeforeDelete roda com escopo de tenant: nunca remove o arquivo de
 * material de outro tenant.
 */
import { createCrudRouter } from '../lib/createCrudRouter';
import { CACHE_KEYS } from '../types';
import { validateMaterialInput } from '../utils/validation';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { extractObjectKey } from '../utils/extractObjectKey';
import { PERMISSIONS } from '../lib/permissions';

const BUCKET = process.env.B2_BUCKET_NAME || 'neva-avatars';

const router = createCrudRouter({
  table: 'materials',
  cacheKey: CACHE_KEYS.MATERIALS,
  validate: validateMaterialInput,
  notificationType: 'material',
  writePermission: PERMISSIONS.MATERIALS_UPLOAD,
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
  onBeforeDelete: async (id: string, tenantId?: string) => {
    try {
      let query = dbAdmin
        .from('materials')
        .select('url')
        .eq('id', id);
      // Escopo por tenant: impede que o arquivo físico de material de outro
      // tenant seja removido (IDOR cross-tenant).
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query.maybeSingle();

      if (error || !data) return;

      const url = (data as any).url as string | undefined;
      if (!url) return;

      const objectKey = extractObjectKey(url);
      if (!objectKey) return;

      await dbAdmin.storage.from(BUCKET).remove(objectKey);
      log.info(`[Materials] B2 file deleted: ${BUCKET}/${objectKey} (material: ${id})`);
    } catch (err) {
      log.warn(`[Materials] Failed to delete B2 file for material ${id}:`, err);
    }
  },
});

export default router;
