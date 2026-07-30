/**
 * Events CRUD routes — generated via createCrudRouter factory.
 */
import { createCrudRouter } from '../lib/createCrudRouter';
import { CACHE_KEYS } from '../types';
import { validateEventInput } from '../utils/validation';

const router = createCrudRouter({
  table: 'events',
  cacheKey: CACHE_KEYS.EVENTOS,
  validate: validateEventInput,
  notificationType: 'evento',
  extraInvalidateKeys: [CACHE_KEYS.ADMIN_ACTIVITIES],
  orderBy: 'date',
  orderAsc: true,
  fieldMap: { questionsCount: 'questions_count', xpReward: 'xp_reward' },
  defaults: { questions_count: 0, xp_reward: 0 },
  mapRow: (e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date,
    time: e.time,
    type: e.type,
    category: e.category,
    questionsCount: (e as any).questions_count || 0,
    xpReward: (e as any).xp_reward || 0,
    observation: e.observation,
  }),
});

export default router;
