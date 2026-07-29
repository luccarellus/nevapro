import { Router, Response } from 'express';
import { log } from '../utils/logger';
import { isB2LogStorageConfigured } from '../services/b2LogStorage';

const router = Router();

// ============= HEALTH CHECK =============
router.get('/', (req, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {
      backblazeConfigured: isB2LogStorageConfigured(),
    },
  });
});

export default router;
