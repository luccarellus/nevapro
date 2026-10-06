import { csrfHeaders } from './apiService';

/**
 * Headers comuns para requisições JSON (GET ou mutação sem CSRF obrigatório).
 */
export const baseJsonHeaders = {
  'Content-Type': 'application/json',
} as const;

/**
 * Headers obrigatórios para requisições mutadoras que o servidor pode
 * exigir CSRF quando há sessão ativa.
 */
export const mutationHeaders = (): Record<string, string> => ({
  ...baseJsonHeaders,
  'X-Requested-With': 'XMLHttpRequest',
  ...csrfHeaders(),
});
