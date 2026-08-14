import { Router, Response } from 'express';
import { log } from '../utils/logger';
import { isB2LogStorageConfigured } from '../services/b2LogStorage';
import { isRedisConfigured, runRedisCommand } from '../services/cache';

const router = Router();

// ============= HEALTH CHECK =============
router.get('/', async (_req, res: Response) => {
  let redisStatus = 'not-configured';
  if (isRedisConfigured()) {
    try {
      const pong = await runRedisCommand(['PING']);
      redisStatus = pong === 'PONG' ? 'connected' : 'unavailable';
    } catch (err) {
      log.warn('[Health] Falha ao verificar Redis:', err);
      redisStatus = 'unavailable';
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {
      backblazeConfigured: isB2LogStorageConfigured(),
      redis: redisStatus,
    },
  });
});

export default router;
