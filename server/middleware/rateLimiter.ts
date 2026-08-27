import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';
import { isRedisConfigured } from '../services/cache';
import { getRedisClient, waitForRedisReady } from '../services/redisClient';

const RATE_LIMITER_CLEANUP_INTERVAL_MS = 60_000;
const RATE_LIMITER_MAX_ENTRIES = 10_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const inMemoryRateLimit = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired in-memory entries
setInterval(() => {
  const now = Date.now();
  for (const [entryKey, entry] of inMemoryRateLimit) {
    if (entry.resetAt <= now) {
      inMemoryRateLimit.delete(entryKey);
    }
  }
  if (inMemoryRateLimit.size > RATE_LIMITER_MAX_ENTRIES) {
    const entries = [...inMemoryRateLimit.entries()].sort(
      ([, a], [, b]) => a.resetAt - b.resetAt,
    );
    const toDelete = entries.slice(0, entries.length - RATE_LIMITER_MAX_ENTRIES);
    for (const [key] of toDelete) {
      inMemoryRateLimit.delete(key);
    }
  }
}, RATE_LIMITER_CLEANUP_INTERVAL_MS).unref();

// Lua script atômico de incremento com expiração em 1 só rtt (<1ms)
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/**
 * Rate Limiter — híbrido Redis ultra-rápido (Lua atômico) + fallback em memória local.
 *
 * Executa verificações no Redis em <1ms via Script Lua de ida e volta única.
 */
export const rateLimiter = (limit: number, windowMs: number) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const path = req.path || req.url || '/';
    const now = Date.now();
    const windowKey = Math.floor(now / windowMs);

    // Tenta Redis primeiro se configurado
    if (isRedisConfigured()) {
      const client = getRedisClient();
      if (client) {
        if (client.status !== 'ready') {
          await waitForRedisReady(50);
        }

        if (client.status === 'ready') {
          const redisKey = `ratelimit:${ip}:${path}:${windowKey}`;
          const ttlSeconds = Math.ceil(windowMs / 1000);

          try {
            // Executa script Lua em 1 única ida e volta (sub-milissegundo)
            const result = await client.eval(RATE_LIMIT_LUA, 1, redisKey, String(ttlSeconds));
            const currentCount = Number(result);

            if (!Number.isNaN(currentCount) && currentCount > limit) {
              res.status(429).json({
                error: 'Muitas requisições. Tente novamente mais tarde.',
              });
              return;
            }

            return next();
          } catch (err) {
            log.warn('[RateLimiter] Erro na execução Redis, usando fallback in-memory');
          }
        }
      }
    }

    // Fallback in-memory
    const memKey = `${ip}:${path}:${windowKey}`;
    const resetAt = (windowKey + 1) * windowMs;
    const current = inMemoryRateLimit.get(memKey) || { count: 0, resetAt };

    current.count += 1;
    current.resetAt = resetAt;
    inMemoryRateLimit.set(memKey, current);

    if (current.count > limit) {
      res.status(429).json({
        error: 'Muitas requisições. Tente novamente mais tarde.',
      });
      return;
    }

    next();
  };
};
