import { Router, Request, Response } from 'express';
import { getRedisClient } from '../services/redisClient';
import { log } from '../utils/logger';

const router = Router();

/**
 * Diagnostic endpoint for Redis connectivity and latency.
 * Tests connection by setting and retrieving a dummy key, measuring latency.
 */
router.get('/redis', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  const testKey = `diag:redis:test:${Date.now()}`;
  const testValue = `test_val_${Math.random().toString(36).substring(7)}`;

  try {
    const client = getRedisClient();
    if (!client) {
      res.status(503).json({
        status: 'error',
        connected: false,
        latency_ms: null,
        error: 'Cliente Redis não pôde ser inicializado (REDIS_HOST ou REDIS_URL ausente).',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Ping check
    const pingStart = Date.now();
    const pingRes = await client.ping();
    const pingLatency = Date.now() - pingStart;

    // Set dummy key with 10 seconds TTL
    await client.set(testKey, testValue, 'EX', 10);

    // Retrieve dummy key
    const retrieved = await client.get(testKey);

    // Clean up
    await client.del(testKey);

    const totalLatency = Date.now() - startTime;

    if (retrieved !== testValue) {
      res.status(500).json({
        status: 'error',
        connected: true,
        latency_ms: totalLatency,
        ping_latency_ms: pingLatency,
        error: `Inconsistência de leitura: gravou "${testValue}" mas leu "${retrieved}".`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Server info
    let version = 'unknown';
    let uptimeSeconds = 0;
    try {
      const serverInfo = await client.info('server');
      version = serverInfo.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
      const uptimeMatch = serverInfo.match(/uptime_in_seconds:([^\r\n]+)/)?.[1];
      if (uptimeMatch) uptimeSeconds = parseInt(uptimeMatch, 10);
    } catch {}

    res.json({
      status: 'ok',
      connected: true,
      latency_ms: totalLatency,
      ping_latency_ms: pingLatency,
      ping_response: pingRes,
      test_key: testKey,
      verified: true,
      error: null,
      server_info: {
        host: process.env.REDIS_HOST || 'nevapro_neva-redis',
        port: Number(process.env.REDIS_PORT) || 6379,
        version,
        uptime_seconds: uptimeSeconds,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const totalLatency = Date.now() - startTime;
    log.error('[Diagnostics] Erro ao testar Redis:', err);
    res.status(500).json({
      status: 'error',
      connected: false,
      latency_ms: totalLatency,
      error: err?.message || 'Falha na conexão com o servidor Redis.',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
