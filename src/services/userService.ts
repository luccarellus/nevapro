import { request, csrfHeaders } from '../lib/apiService';
import { UserProfile } from '../types';
import { cachedFetchJson, invalidateRequestCache } from '../lib/requestCache';
import { executeRecaptcha } from '../lib/recaptcha';

export const userService = {
  async getProfile(email?: string): Promise<UserProfile> {
    const url = email ? `/api/user/profile?email=${encodeURIComponent(email)}` : '/api/user/profile';
    return cachedFetchJson<UserProfile>(url, 60_000);
  },

  async updateProfile(data: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('update_profile').catch(() => '');
    const result = await request<{ success: boolean; user: UserProfile }>('/api/user/profile', {
      method: 'POST',
      body: { ...data, recaptcha_token },
    });
    invalidateRequestCache();
    return result;
  },

  async deleteProfile(email?: string): Promise<{ success: boolean }> {
    const recaptcha_token = await executeRecaptcha('delete_profile').catch(() => '');
    const url = email 
      ? `/api/user/profile?email=${encodeURIComponent(email)}` 
      : '/api/user/profile';
    return request(url, { method: 'DELETE', body: { recaptcha_token } });
  },

  async login(credentials: { email: string; password?: string }): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('login').catch(() => '');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ ...credentials, recaptcha_token }),
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
    const result = await response.json();
    invalidateRequestCache();
    return result;
  },

  async register(userData: any): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('register').catch(() => '');
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ ...userData, recaptcha_token }),
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
    const result = await response.json();
    invalidateRequestCache();
    return result;
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
    const recaptcha_token = await executeRecaptcha('forgot_password').catch(() => '');
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, recaptcha_token }),
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
    const recaptcha_token = await executeRecaptcha('change_password').catch(() => '');
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
      },
      body: JSON.stringify({ ...data, recaptcha_token }),
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
