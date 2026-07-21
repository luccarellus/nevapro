import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

const normalizeOrigin = (value: string): string => {
  try {
    const prefixed = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
    return new URL(prefixed).origin;
  } catch {
    return value;
  }
};

/**
 * Retorna dinamicamente o conjunto de origens permitidas para a requisição atual.
 */
const getDynamicAllowedOrigins = (req: Request): Set<string> => {
  const origins = new Set<string>();

  // Host da própria requisição (Same-origin na Vercel ou em qualquer servidor)
  const host = req.get('host');
  if (host) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }

  // Variável FRONTEND_URL (suporta lista separada por vírgulas)
  const frontendEnv = process.env.FRONTEND_URL || 'https://neva.pro';
  frontendEnv.split(',').forEach((url) => {
    const trimmed = url.trim();
    if (trimmed) origins.add(normalizeOrigin(trimmed));
  });

  // Domínios da Vercel injetados automaticamente
  if (process.env.VERCEL_URL) origins.add(normalizeOrigin(process.env.VERCEL_URL));
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL));

  // Origens para ambiente de desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }

  return origins;
};

export const isAllowedOrigin = (req: Request, value?: string | string[]): boolean => {
  const originValue = Array.isArray(value) ? value[0] : value;
  if (!originValue) return false;
  try {
    const parsedOrigin = new URL(originValue).origin;
    const allowedOrigins = getDynamicAllowedOrigins(req);
    return allowedOrigins.has(parsedOrigin);
  } catch {
    return false;
  }
};

/**
 * CSRF Protection Middleware
 * 
 * Strategy:
 * 1. Validates Origin header dynamically against Same-Origin host and allowed domains
 * 2. Falls back to Referer header
 * 3. Requires X-Requested-With if neither Origin nor Referer is present
 * 
 * Skipped in development mode to avoid breaking Vite HMR.
 * Skipped for idempotent methods (GET, HEAD, OPTIONS).
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Skip idempotent methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 1. Origin header validation
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(req, origin)) {
      log.warn(`[CSRF] Origem rejeitada: ${origin} (host da requisição: ${req.get('host')})`);
      res.status(403).json({ error: 'Acesso negado: origem não autorizada.' });
      return;
    }
    return next();
  }

  // 2. Referer header fallback
  const referer = req.headers.referer || (req.headers as Record<string, string | string[] | undefined>).referrer;
  if (referer) {
    try {
      const refererUrl = new URL(Array.isArray(referer) ? referer[0] : referer);
      if (!isAllowedOrigin(req, refererUrl.origin)) {
        log.warn(`[CSRF] Referer rejeitado: ${refererUrl.origin} (host da requisição: ${req.get('host')})`);
        res.status(403).json({ error: 'Acesso negado: referenciador não autorizado.' });
        return;
      }
      return next();
    } catch {
      res.status(400).json({ error: 'Header Referer mal formatado.' });
      return;
    }
  }

  // 3. X-Requested-With check (no Origin/Referer available)
  const requestedWith = req.headers['x-requested-with'];
  if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
    log.warn('[CSRF] Requisição sem Origin/Referer nem X-Requested-With');
    res.status(403).json({ error: 'Acesso negado: cabeçalho de segurança ausente.' });
    return;
  }

  next();
};

