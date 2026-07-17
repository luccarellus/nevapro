import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: 'admin' | 'student';
  authUserId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface ApiError {
  error: string;
  missing?: string[];
}

export interface ApiSuccess<T = unknown> {
  success: boolean;
  data?: T;
  user?: T;
  message?: string;
}

export type CacheKey =
  | 'cache:leaderboard'
  | 'cache:materials'
  | 'cache:recados'
  | 'cache:eventos'
  | 'cache:admin:users'
  | 'cache:admin:activities';

export const CACHE_KEYS: Record<string, CacheKey> = {
  LEADERBOARD: 'cache:leaderboard',
  MATERIALS: 'cache:materials',
  RECADOS: 'cache:recados',
  EVENTOS: 'cache:eventos',
  ADMIN_USERS: 'cache:admin:users',
  ADMIN_ACTIVITIES: 'cache:admin:activities',
} as const;

export const CACHE_TTL: Record<string, number> = {
  [CACHE_KEYS.LEADERBOARD]: 60,
  [CACHE_KEYS.MATERIALS]: 300,
  [CACHE_KEYS.RECADOS]: 300,
  [CACHE_KEYS.EVENTOS]: 300,
  [CACHE_KEYS.ADMIN_USERS]: 120,
  [CACHE_KEYS.ADMIN_ACTIVITIES]: 120,
};

export const CACHE_TTL_QUESTOES = 600;

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
