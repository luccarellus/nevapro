import { createApiService } from '../lib/apiService';
import { StudyEvent } from '../types';

const api = createApiService<StudyEvent>('/api/eventos');

export const eventService = {
  getEventos: api.list,
  addEvento: api.create,
  updateEvento: api.update,
  deleteEvento: api.remove,
};
