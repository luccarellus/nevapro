/**
 * Normaliza e-mail para comparações e persistência no frontend.
 * Deve espelhar a lógica de normalização do backend para reduzir divergências
 * de UX (ex.: busca/case-sensitive).
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
