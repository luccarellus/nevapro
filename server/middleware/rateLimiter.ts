import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';
import { isRedisConfigured, runRedisCommand } from '../services/cache';

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



/**
 * Rate Limiter — hybrid Redis + in-memory fallback.
 * 
 * Uses Redis (self-hosted via REDIS_URL) quando disponível.
 * Falls back to in-memory Map when Redis is unavailable.
 * 
 * @param limit Maximum number of requests allowed within the window
 * @param windowMs Time window in milliseconds
 */
export const rateLimiter = (limit: number, windowMs: number) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const path = req.path || req.url || '/';
    const now = Date.now();
    const windowKey = Math.floor(now / windowMs);

    // Try Redis first
    if (isRedisConfigured()) {
      const redisKey = `ratelimit:${ip}:${path}:${windowKey}`;
      const ttlSeconds = Math.ceil(windowMs / 1000);

      try {
        // Single INCR command instead of SET+INCR pipeline
        // TTL is set on first increment (when count === 1)
        const incrResult = await runRedisCommand(['INCR', redisKey]);
        const currentCount = typeof incrResult === 'number' ? incrResult : Number(incrResult);

        if (currentCount === 1) {
          // First request in this window — set expiry
          await runRedisCommand(['EXPIRE', redisKey, String(ttlSeconds)]);
        }

        if (!Number.isNaN(currentCount) && currentCount > limit) {
          res.status(429).json({
            error: 'Muitas requisições. Tente novamente mais tarde.',
          });
          return;
        }

        return next();
      } catch (err) {
        log.warn('[RateLimiter] Redis indisponível, usando fallback in-memory');
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
