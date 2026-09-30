/**
 * LGPD Consent Routes — /api/lgpd
 *
 * Registro de consentimento de cookies (LGPD). Mantém os registros fora do
 * banco relacional, em armazenamento de logs (Backblaze B2).
 */

import { Router, Request, Response } from 'express';
import { log } from '../utils/logger';
import { isB2LogStorageConfigured, storeB2Log } from '../services/b2LogStorage';

const router = Router();

router.post('/consent-log', async (req: Request, res: Response) => {
  const { preferences, userAgent } = req.body;
  if (!preferences) {
    res.status(400).json({ error: 'Preferências de consentimento são obrigatórias.' });
    return;
  }
  try {
    const consentTypes = Object.entries(preferences)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .slice(0, 20);
    await storeB2Log('consent', {
      consentTypes: consentTypes.length > 0 ? consentTypes : ['necessary_only'],
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: userAgent || req.headers['user-agent'] || '',
    });
    log.info('[LGPD] Consent preferences saved:', consentTypes);
    res.json({ success: true });
  } catch (err) {
    log.error('[LGPD] Failed to save consent:', err);
    res.status(500).json({ error: 'Erro ao registrar consentimento.' });
  }
});

export default router;
