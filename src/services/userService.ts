import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';

export const userService = {
  async getProfile(email?: string): Promise<UserProfile> {
    try {
      const url = email ? `/api/user/profile?email=${email}` : '/api/user/profile';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch profile');
      return response.json();
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  },

  async updateProfile(data: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    const response = await fetch('/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return response.json();
  },

  async deleteProfile(email?: string): Promise<{ success: boolean }> {
    const url = email ? `/api/user/profile?email=${encodeURIComponent(email)}` : '/api/user/profile';
    const response = await fetch(url, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete profile');
    return response.json();
  },

  async login(credentials: { email: string, password?: string }): Promise<{ success: boolean; user: UserProfile }> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      let errorMsg = 'Falha no login';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {
        errorMsg = 'Servidor indisponível (Erro 500)';
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  async register(userData: any): Promise<{ success: boolean; user: UserProfile }> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      let errorMsg = 'Falha no cadastro';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {
        errorMsg = 'Servidor indisponível (Erro 500)';
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  async getLeaderboard(): Promise<UserProfile[]> {
    try {
      const response = await fetch('/api/leaderboard');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  },

  async changePassword(data: { email: string; currentPassword?: string; newPassword?: string }): Promise<{ success: boolean; message?: string }> {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorMsg = 'Falha ao alterar senha';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }
    return response.json();
  }
};
