import { Material } from '../types';

export const materialService = {
  async getMaterials(): Promise<Material[]> {
    const response = await fetch('/api/materials');
    if (!response.ok) throw new Error('Failed to fetch materials');
    return response.json();
  },

  async addMaterial(material: Omit<Material, 'id' | 'uploadedAt'>): Promise<Material> {
    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(material),
    });
    if (!response.ok) throw new Error('Failed to add material');
    return response.json();
  },

  async updateMaterial(id: string, material: Partial<Material>): Promise<Material> {
    const response = await fetch(`/api/materials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(material),
    });
    if (!response.ok) throw new Error('Failed to update material');
    return response.json();
  },

  async deleteMaterial(id: string): Promise<void> {
    const response = await fetch(`/api/materials/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete material');
  }
};
