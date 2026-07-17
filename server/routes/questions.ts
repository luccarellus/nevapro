import { Router, Response } from 'express';
import { log } from '../utils/logger';

const router = Router();

const BASE_URL = 'https://api.enem.dev/v1';

// Proxy para questões do ENEM
router.get('/', async (req, res: Response) => {
  const { year, limit, offset } = req.query;

  if (!year) {
    res.status(400).json({ error: 'Year parameter is required' });
    return;
  }

  try {
    const apiUrl = `${BASE_URL}/questions/${year}?limit=${limit || 50}&offset=${offset || 0}`;
    const response = await fetch(apiUrl, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `ENEM API error: ${response.statusText}` });
      return;
    }

    const data = await response.json();
    res.json({ questions: data.questions || data });
  } catch (err) {
    log.error('[Questions Proxy] Error:', err);
    res.status(500).json({ error: 'Failed to fetch questions from ENEM API' });
  }
});

export default router;
