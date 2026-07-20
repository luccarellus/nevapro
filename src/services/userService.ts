import { request } from '../lib/apiService';
import { UserProfile } from '../types';

export const userService = {
  async getProfile(email?: string): Promise<UserProfile> {
    const url = email ? `/api/user/profile?email=${encodeURIComponent(email)}` : '/api/user/profile';
    const response = await fetch(url);
    if (!response.ok) {
      const error: any = new Error('Failed to fetch profile');
      error.status = response.status;
      throw error;
    }
    return response.json();
  },

  async updateProfile(data: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    return request('/api/user/profile', {
      method: 'POST',
      body: data,
    });
  },

  async deleteProfile(email?: string): Promise<{ success: boolean }> {
    const url = email 
      ? `/api/user/profile?email=${encodeURIComponent(email)}` 
      : '/api/user/profile';
    return request(url, { method: 'DELETE' });
  },

  async login(credentials: { email: string; password?: string }): Promise<{ success: boolean; user: UserProfile }> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      let errorMsg = 'Falha no login';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch {
        errorMsg = 'Servidor indisponível (Erro 500)';
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  async register(userData: any): Promise<{ success: boolean; user: UserProfile }> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      let errorMsg = 'Falha no cadastro';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch {
        errorMsg = 'Servidor indisponível (Erro 500)';
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  async getLeaderboard(): Promise<UserProfile[]> {
    try {
      return request<UserProfile[]>('/api/leaderboard');
    } catch {
      console.error('Error fetching leaderboard:');
      return [];
    }
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message?: string }> {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      let errorMsg = 'Erro ao solicitar recuperação';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    return response.json();
  },

  async changePassword(data: { email: string; currentPassword?: string; newPassword?: string }): Promise<{ success: boolean; message?: string }> {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorMsg = 'Falha ao alterar senha';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    return response.json();
  },
};
