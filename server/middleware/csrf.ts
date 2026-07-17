import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

const ALLOWED_ORIGIN = normalizeOrigin(process.env.FRONTEND_URL || 'https://neva.pro');
const ALLOWED_ORIGINS = new Set([
  ALLOWED_ORIGIN,
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']
    : []),
]);

const isAllowedOrigin = (value?: string | string[]): boolean => {
  const originValue = Array.isArray(value) ? value[0] : value;
  if (!originValue) return false;
  try {
    return ALLOWED_ORIGINS.has(new URL(originValue).origin);
  } catch {
    return false;
  }
};

/**
 * CSRF Protection Middleware
 * 
 * Strategy:
 * 1. Validates Origin header (most reliable in modern browsers)
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
    if (!isAllowedOrigin(origin)) {
      log.warn(`[CSRF] Origem rejeitada: ${origin} (esperado: ${ALLOWED_ORIGIN})`);
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
      if (!isAllowedOrigin(refererUrl.origin)) {
        log.warn(`[CSRF] Referer rejeitado: ${refererUrl.origin} (esperado: ${ALLOWED_ORIGIN})`);
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
