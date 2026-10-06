import { UserProfile } from '../types';

const SESSION_KEY = 'neva_student_session';

export const getSession = (): Partial<UserProfile> | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<UserProfile>;
  } catch {
    return null;
  }
};

export const saveSession = (profile: Partial<UserProfile>): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
  } catch {
    // Ignora erros de quota/privacidade para não quebrar a experiência
  }
};

export const clearSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Aplica um patch sobre a sessão atual e persiste. Útil para atualizações
 * parciais (ex.: XP, avatar) sem reescrever toda a lógica de merge em vários
 * lugares.
 */
export const mergeSession = (
  patch: Partial<UserProfile>,
): Partial<UserProfile> | null => {
  const session = getSession();
  if (!session) return null;
  const merged = { ...session, ...patch };
  saveSession(merged);
  return merged;
};
