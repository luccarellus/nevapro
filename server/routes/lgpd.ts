/**
 * LGPD Consent Routes — /api/lgpd
 *
 * Registro de consentimento de cookies (LGPD). Mantém os registros fora do
 * banco relacional, em armazenamento de logs (Backblaze B2).
 */

import { Router, Request, Response } from 'express';
import { log } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { storeB2Log } from '../services/b2LogStorage';

const router = Router();

/** Limite por IP: o log vai para o B2 — sem teto, um abuso vira custo. */
router.post('/consent-log', rateLimiter(10, 60_000), async (req: Request, res: Response) => {
  const { preferences, userAgent } = req.body || {};
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    res.status(400).json({ error: 'Preferências de consentimento são obrigatórias.' });
    return;
  }
  for (const value of Object.values(preferences)) {
    if (typeof value !== 'boolean') {
      res.status(400).json({ error: 'Preferências de consentimento devem ser booleanas.' });
      return;
    }
  }
  const safeUserAgent =
    typeof userAgent === 'string' ? userAgent.slice(0, 512) : (req.headers['user-agent'] || '');
  try {
    const consentTypes = Object.entries(preferences)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .slice(0, 20);
    await storeB2Log('consent', {
      consentTypes: consentTypes.length > 0 ? consentTypes : ['necessary_only'],
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: safeUserAgent,
    });
    log.info('[LGPD] Consent preferences saved:', consentTypes);
    res.json({ success: true });
  } catch (err) {
    log.error('[LGPD] Failed to save consent:', err);
    res.status(500).json({ error: 'Erro ao registrar consentimento.' });
  }
});

export default router;
