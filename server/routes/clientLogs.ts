import { Router } from 'express';
import { log } from '../utils/logger';

const router = Router();
const LEVELS = new Set(['info', 'warn', 'error']);

router.post('/', (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 20) : [];

  for (const entry of entries) {
    if (!entry || !LEVELS.has(entry.level) || typeof entry.message !== 'string') continue;
    const message = entry.message.slice(0, 2_000);
    const metadata = {
      source: 'browser',
      page: typeof entry.page === 'string' ? entry.page.slice(0, 500) : undefined,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
    };

    if (entry.level === 'error') log.error('[Client]', message, metadata);
    else if (entry.level === 'warn') log.warn('[Client]', message, metadata);
    else log.info('[Client]', message, metadata);
  }

  res.status(202).json({ accepted: entries.length });
});

export default router;
