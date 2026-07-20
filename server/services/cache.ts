import { CACHE_KEYS, CACHE_TTL } from '../types';

const isUpstashRedisConfigured = (): boolean => {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
};

const runUpstashRedisCommand = async (command: string[]): Promise<unknown | null> => {
  if (!isUpstashRedisConfigured()) return null;

  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis respondeu com status ${response.status}`);
  }

  const [result] = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  if (result?.error) throw new Error(result.error);

  return result?.result;
};

const runUpstashRedisPipeline = async (commands: string[][]): Promise<Array<{ result?: unknown; error?: string }> | null> => {
  if (!isUpstashRedisConfigured()) return null;

  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis pipeline respondeu com status ${response.status}`);
  }

  const results = (await response.json()) as Array<{ result?: unknown; error?: string }>;

  for (const r of results) {
    if (r?.error) throw new Error(r.error);
  }

  return results;
};

/**
 * Cache-aside pattern: tries Redis first, falls back to null (caller should query DB).
 * Silently fails if Redis is unavailable — cache is optional.
 */
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (!isUpstashRedisConfigured()) return null;
  try {
    const raw = await runUpstashRedisCommand(['GET', key]);
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
  try {
    await runUpstashRedisPipeline([
      ['SET', key, JSON.stringify(data)],
      ['EXPIRE', key, String(ttl)],
    ]);
  } catch {
    // Cache é opcional — falha silenciosa
  }
};

/**
 * Invalidates (deletes) specific cache keys.
 * Used by write endpoints to ensure data freshness.
 * Call this whenever data is created, updated, or deleted.
 */
export const cacheInvalidate = async (...keys: string[]): Promise<void> => {
  if (!isUpstashRedisConfigured() || keys.length === 0) return;
  try {
    const commands = keys.map((k) => ['DEL', k]);
    await runUpstashRedisPipeline(commands);
  } catch {
    // Falha silenciosa
  }
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

export { isUpstashRedisConfigured };
