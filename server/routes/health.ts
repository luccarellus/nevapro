import { Router, Response } from 'express';
import { log } from '../utils/logger';
import { isB2LogStorageConfigured } from '../services/b2LogStorage';
import { isRedisConfigured, runRedisCommand } from '../services/cache';
import { getRedisRttMs, isRemoteRedis } from '../services/redisClient';
import { query } from '../../src/lib/db';
import { requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * Health check público (liveness/readiness de orquestradores).
 *
 * Expõe o MÍNIMO necessário: status e timestamp. Detalhes internos (memória,
 * uptime, modo/RTT do Redis, dependências) ficam em /details — sem autenticação,
 * essa superfície ajuda reconhecimento de infraestrutura.
 */
router.get('/', async (_req, res: Response) => {
  let dbStatus = 'connected';
  try {
    await query('SELECT 1');
  } catch (err) {
    log.error('[Health] Falha ao verificar Postgres:', err);
    dbStatus = 'unavailable';
  }

  const healthy = dbStatus === 'connected';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health detalhado — SOMENTE ADMIN (monitoramento interno).
 * Memória, uptime, status das dependências e métricas de cache.
 */
router.get('/details', requireAdmin, async (_req, res: Response) => {
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

  let dbStatus = 'connected';
  try {
    await query('SELECT 1');
  } catch (err) {
    log.error('[Health] Falha ao verificar Postgres:', err);
    dbStatus = 'unavailable';
  }

  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {
      backblazeConfigured: isB2LogStorageConfigured(),
      redis: redisStatus,
      postgres: dbStatus,
      redisMode: isRedisConfigured() ? (isRemoteRedis() ? 'remote' : 'local') : 'not-configured',
      redisRttMs: getRedisRttMs(),
    },
  });
});

export default router;
