import { Router, Response } from 'express';
import { log } from '../utils/logger';

const router = Router();

// ============= HEALTH CHECK =============
router.get('/', (req, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

export default router;
