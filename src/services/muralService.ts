import { Notice } from '../types';

export const muralService = {
  async getRecados(): Promise<Notice[]> {
    const response = await fetch('/api/recados');
    if (!response.ok) throw new Error('Failed to fetch recados');
    return response.json();
  },

  async addRecado(recado: Partial<Notice>): Promise<Notice> {
    const response = await fetch('/api/recados', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recado),
    });
    if (!response.ok) throw new Error('Failed to add recado');
    return response.json();
  },

  async updateRecado(id: string, recado: Partial<Notice>): Promise<Notice> {
    const response = await fetch(`/api/recados/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recado),
    });
    if (!response.ok) throw new Error('Failed to update recado');
    return response.json();
  },

  async deleteRecado(id: string): Promise<void> {
    const response = await fetch(`/api/recados/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete recado');
  }
};
