import { invalidateRequestCache, cachedFetchJson } from '../lib/requestCache';
import { request } from '../lib/apiService';
import { postJson } from '../lib/fetchHelpers';
import { csrfHeaders } from '../lib/apiService';
import { UserProfile } from '../types';
import { executeRecaptcha } from '../lib/recaptcha';

export interface WeeklyActivityStats {
  weekly: { day: string; xp: number; fullDate: string }[];
  questionsAnswered: number;
}

export const userService = {
  async getProfile(email?: string): Promise<UserProfile> {
    const url = email ? `/api/user/profile?email=${encodeURIComponent(email)}` : '/api/user/profile';
    return cachedFetchJson<UserProfile>(url, 60_000);
  },

  async getActivityStats(): Promise<WeeklyActivityStats> {
    return request<WeeklyActivityStats>('/api/user/stats');
  },

  async updateProfile(data: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('update_profile').catch(() => '');
    const result = await request<{ success: boolean; user: UserProfile }>('/api/user/profile', {
      method: 'POST',
      body: { ...data, recaptcha_token },
    });
    return result;
  },

  async deleteProfile(email?: string): Promise<{ success: boolean }> {
    const recaptcha_token = await executeRecaptcha('delete_profile').catch(() => '');
    const url = email 
      ? `/api/user/profile?email=${encodeURIComponent(email)}` 
      : '/api/user/profile';
    const result = await request<{ success: boolean }>(url, { method: 'DELETE', body: { recaptcha_token } });
    invalidateRequestCache();
    return result;
  },

  async login(credentials: { email: string; password?: string }): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('login').catch(() => '');
    const result = await postJson<{ success: boolean; user: UserProfile }>('/api/auth/login', { ...credentials, recaptcha_token }, {});
    invalidateRequestCache();
    return result;
  },

  async register(userData: any): Promise<{ success: boolean; user: UserProfile }> {
    const recaptcha_token = await executeRecaptcha('register').catch(() => '');
    const result = await postJson<{ success: boolean; user: UserProfile }>('/api/auth/register', { ...userData, recaptcha_token }, {});
    invalidateRequestCache();
    return result;
  },

  async getLeaderboard(): Promise<UserProfile[]> {
    try {
      return request('/api/leaderboard');
    } catch {
      console.error('Error fetching leaderboard:');
      return [];
    }
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message?: string }> {
    const recaptcha_token = await executeRecaptcha('forgot_password').catch(() => '');
    const result = await postJson<{ success: boolean; message?: string }>('/api/auth/forgot-password', { email, recaptcha_token }, {});
    return result;
  },

  async changePassword(data: { email: string; currentPassword?: string; newPassword?: string }): Promise<{ success: boolean; message?: string }> {
    const recaptcha_token = await executeRecaptcha('change_password').catch(() => '');
    const result = await postJson<{ success: boolean; message?: string }>('/api/auth/change-password', { ...data, recaptcha_token }, { ...csrfHeaders() });
    return result;
  },
};
