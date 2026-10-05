/**
 * CRUD Services para eventos, materiais e mural.
 *
 * Usage:
 *   import { eventService, materialService, muralService } from './crudService';
 */

import { createApiService } from '../lib/apiService';
import { StudyEvent, Material, Notice } from '../types';

// Events
const eventsApi = createApiService<StudyEvent>('/api/eventos');
export const eventService = {
  list: eventsApi.list,
  create: eventsApi.create,
  update: eventsApi.update,
  remove: eventsApi.remove,
};

// Materials
const materialsApi = createApiService<Material>('/api/materials');
export const materialService = {
  list: materialsApi.list,
  create: materialsApi.create,
  update: materialsApi.update,
  remove: materialsApi.remove,
};

// Mural (Notices)
const muralApi = createApiService<Notice>('/api/recados');
export const muralService = {
  list: muralApi.list,
  create: muralApi.create,
  update: muralApi.update,
  remove: muralApi.remove,
};
