import { createApiService } from '../lib/apiService';
import { Notice } from '../types';

const api = createApiService<Notice>('/api/recados');

export const muralService = {
  getRecados: api.list,
  addRecado: api.create,
  updateRecado: api.update,
  deleteRecado: api.remove,
};
