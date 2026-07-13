import { request } from '../lib/apiService';
import { UserProfile } from '../types';

const normalizeUserProfile = (profile: any): UserProfile => ({
  ...profile,
  answeredQuestions: profile.answeredQuestions ?? profile.answered_questions ?? 0,
  correctAnswers: profile.correctAnswers ?? profile.correct_answers ?? 0,
  accuracyPercent: profile.accuracyPercent ?? profile.accuracy_percent ?? 0,
  avatarUrl: profile.avatarUrl ?? profile.avatar_url ?? profile.avatar ?? '',
  languagePreference: profile.languagePreference ?? profile.language_preference,
  showInLeaderboard: profile.showInLeaderboard ?? profile.show_in_leaderboard,
  flashQuizCompleted: profile.flashQuizCompleted ?? profile.flash_quiz_completed,
});

export const userService = {
  async getProfile(email?: string): Promise<UserProfile> {
    const url = email ? `/api/user/profile?email=${encodeURIComponent(email)}` : '/api/user/profile';
    const response = await fetch(url);
    if (!response.ok) {
      const error: any = new Error('Failed to fetch profile');
      error.status = response.status;
      throw error;
    }
    return normalizeUserProfile(await response.json());
  },

  async updateProfile(data: Partial<UserProfile>): Promise<{ success: boolean; user: UserProfile }> {
    const result = await request<{ success: boolean; user: UserProfile }>('/api/user/profile', {
      method: 'POST',
      body: data,
    });
    return {
      ...result,
      user: result.user ? normalizeUserProfile(result.user) : result.user,
    };
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
    const result = await response.json();
    return {
      ...result,
      user: result.user ? normalizeUserProfile(result.user) : result.user,
    };
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
    const result = await response.json();
    return {
      ...result,
      user: result.user ? normalizeUserProfile(result.user) : result.user,
    };
  },

  async getLeaderboard(): Promise<UserProfile[]> {
    try {
      const users = await request<UserProfile[]>('/api/leaderboard');
      return users.map(normalizeUserProfile);
    } catch {
      console.error('Error fetching leaderboard:');
      return [];
    }
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
