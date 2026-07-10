import { createApiService } from '../lib/apiService';
import { Material } from '../types';

const api = createApiService<Material>('/api/materials');

export const materialService = {
  getMaterials: api.list,
  addMaterial: api.create,
  updateMaterial: api.update,
  deleteMaterial: api.remove,
};
