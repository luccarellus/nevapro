/**
 * Ownership & Permission Check Middleware
 *
 * Consolidates the repeated pattern:
 *   if (req.user?.role !== 'admin' && req.user?.email !== email) {
 *     res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
 *     return;
 *   }
 *
 * Usage:
 *   router.get('/profile', requireAuth, requireOwnership, handler);
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Middleware that checks if the authenticated user owns the resource
 * identified by the given email (from query, body, or user session).
 *
 * Admin users bypass the check (they can access any resource).
 */
export const requireOwnership = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const targetEmail = (
    (req.query.email as string) ||
    (req.body?.email as string) ||
    req.user?.email ||
    ''
  ).toLowerCase().trim();

  if (!targetEmail) {
    res.status(400).json({ error: 'E-mail é obrigatório para identificar o recurso.' });
    return;
  }

  if (req.user?.role !== 'admin' && req.user?.email !== targetEmail) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  next();
};
