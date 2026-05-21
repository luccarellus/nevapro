import { StudyEvent } from '../types';

export const eventService = {
  async getEventos(): Promise<StudyEvent[]> {
    const response = await fetch('/api/eventos');
    if (!response.ok) throw new Error('Failed to fetch eventos');
    return response.json();
  },

  async addEvento(evento: Partial<StudyEvent>): Promise<StudyEvent> {
    const response = await fetch('/api/eventos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(evento),
    });
    if (!response.ok) throw new Error('Failed to add evento');
    return response.json();
  },

  async updateEvento(id: string, evento: Partial<StudyEvent>): Promise<StudyEvent> {
    const response = await fetch(`/api/eventos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(evento),
    });
    if (!response.ok) throw new Error('Failed to update evento');
    return response.json();
  },

  async deleteEvento(id: string): Promise<void> {
    const response = await fetch(`/api/eventos/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete evento');
  }
};
