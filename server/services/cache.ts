import { CACHE_KEYS, CACHE_TTL } from '../types';

/**
 * Returns whether Upstash Redis is configured.
 */
export const isUpstashRedisConfigured = (): boolean => {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
};

/**
 * Sends a single Redis command via Upstash REST API.
 * Returns the command result or null if Redis is unavailable.
 */
export async function runRedisCommand(command: string[]): Promise<unknown | null> {
  if (!isUpstashRedisConfigured()) return null;

  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
  });

  if (!response.ok) return null;

  try {
    const [result] = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (result?.error) return null;
    return result?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends multiple Redis commands in a pipeline via Upstash REST API.
 * Returns an array of results or null if Redis is unavailable.
 */
export async function runRedisPipeline(commands: string[][]): Promise<Array<{ result?: unknown; error?: string }> | null> {
  if (!isUpstashRedisConfigured()) return null;

  try {
    const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) return null;
    return (await response.json()) as Array<{ result?: unknown; error?: string }>;
  } catch {
    return null;
  }
}

/**
 * Cache-aside pattern: tries Redis first, falls back to null (caller should query DB).
 * Silently fails if Redis is unavailable — cache is optional.
 */
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (!isUpstashRedisConfigured()) return null;
  try {
    const raw = await runRedisCommand(['GET', key]);
    if (!raw || typeof raw !== 'string') return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Stores data in Redis cache with the appropriate TTL.
 * Silently fails if Redis is unavailable.
 */
export const cacheSet = async (key: string, data: unknown, ttlSeconds?: number): Promise<void> => {
  if (!isUpstashRedisConfigured()) return;
  const ttl = ttlSeconds || CACHE_TTL[key] || 300;
  await runRedisPipeline([
    ['SET', key, JSON.stringify(data)],
    ['EXPIRE', key, String(ttl)],
  ]);
};

/**
 * Invalidates (deletes) specific cache keys.
 * Used by write endpoints to ensure data freshness.
 * Call this whenever data is created, updated, or deleted.
 */
export const cacheInvalidate = async (...keys: string[]): Promise<void> => {
  if (!isUpstashRedisConfigured() || keys.length === 0) return;
  const commands = keys.map((k) => ['DEL', k]);
  await runRedisPipeline(commands);
};

/**
 * Invalidates all content-related cache keys.
 * Convenience method for bulk cache invalidation.
 */
export const cacheInvalidateAllContent = async (): Promise<void> => {
  await cacheInvalidate(
    CACHE_KEYS.MATERIALS,
    CACHE_KEYS.RECADOS,
    CACHE_KEYS.EVENTOS,
    CACHE_KEYS.LEADERBOARD,
    CACHE_KEYS.ADMIN_USERS,
    CACHE_KEYS.ADMIN_ACTIVITIES,
  );
};


