/**
 * Consolidated CRUD Services
 *
 * Eliminates 3 near-identical service files (eventService, materialService, muralService)
 * by exporting factory-backed instances directly.
 *
 * Usage:
 *   import { eventService, materialService, muralService } from './crudService';
 */

import { createApiService } from '../lib/apiService';
import { StudyEvent, Material, Notice } from '../types';

// Events
const eventsApi = createApiService<StudyEvent>('/api/eventos');
export const eventService = {
  /** @deprecated Use list() */ getEventos: eventsApi.list,
  /** @deprecated Use create() */ addEvento: eventsApi.create,
  /** @deprecated Use update() */ updateEvento: eventsApi.update,
  /** @deprecated Use remove() */ deleteEvento: eventsApi.remove,
  list: eventsApi.list,
  create: eventsApi.create,
  update: eventsApi.update,
  remove: eventsApi.remove,
};

// Materials
const materialsApi = createApiService<Material>('/api/materials');
export const materialService = {
  /** @deprecated Use list() */ getMaterials: materialsApi.list,
  /** @deprecated Use create() */ addMaterial: materialsApi.create,
  /** @deprecated Use update() */ updateMaterial: materialsApi.update,
  /** @deprecated Use remove() */ deleteMaterial: materialsApi.remove,
  list: materialsApi.list,
  create: materialsApi.create,
  update: materialsApi.update,
  remove: materialsApi.remove,
};

// Mural (Notices)
const muralApi = createApiService<Notice>('/api/recados');
export const muralService = {
  /** @deprecated Use list() */ getRecados: muralApi.list,
  /** @deprecated Use create() */ addRecado: muralApi.create,
  /** @deprecated Use update() */ updateRecado: muralApi.update,
  /** @deprecated Use remove() */ deleteRecado: muralApi.remove,
  list: muralApi.list,
  create: muralApi.create,
  update: muralApi.update,
  remove: muralApi.remove,
};
