import { setCsrfToken } from './apiService';

type CacheEntry = { expiresAt: number; value?: unknown; promise?: Promise<unknown>; staleAt?: number };

const cache = new Map<string, CacheEntry>();

// Endpoint-specific TTLs (in ms)
const ENDPOINT_TTLS: Record<string, number> = {
  '/api/bootstrap': 60_000,      // Bootstrap: 60s (heavy endpoint, cache aggressively)
  '/api/leaderboard': 120_000,   // Leaderboard: 2min (stable data)
  '/api/materials': 120_000,     // Materials: 2min (stable data)
  '/api/questoes': 300_000,      // Questions: 5min (external API, cache long)
  '/api/user/profile': 30_000,   // Profile: 30s (user-specific)
  '/api/user/stats': 60_000,     // Stats: 60s
  '/api/notifications': 45_000,  // Notifications: 45s
  '/api/performance': 60_000,    // Performance: 60s
};

function getEndpointTtl(url: string): number {
  // Extract the base path (first 2 segments) for matching
  const pathParts = url.split('?')[0].split('/');
  const basePath = '/' + (pathParts[1] || '') + '/' + (pathParts[2] || '');
  
  for (const [pattern, ttl] of Object.entries(ENDPOINT_TTLS)) {
    if (basePath.startsWith(pattern) || url.startsWith(pattern)) {
      return ttl;
    }
  }
  return 60_000; // default 60s
}

export async function cachedFetchJson<T>(url: string, ttlMs?: number): Promise<T> {
  const now = Date.now();
  const activeTenant = typeof window !== 'undefined' ? localStorage.getItem('neva_active_tenant') : null;
  const cacheKey = activeTenant ? `${url}#tenant:${activeTenant}` : url;

  const existing = cache.get(cacheKey);
  
  // Fresh cache hit
  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value as T;
  }
  
  // Stale-while-revalidate: return stale data but refresh in background
  if (existing?.value !== undefined && existing.staleAt && existing.staleAt > now && !existing.promise) {
    // Return stale data immediately, refresh in background
    const refreshPromise = fetchAndCache(url, cacheKey, ttlMs);
    cache.set(cacheKey, { ...existing, promise: refreshPromise });
    return existing.value as T;
  }
  
  // In-flight request
  if (existing?.promise) return existing.promise as Promise<T>;

  return fetchAndCache(url, cacheKey, ttlMs);
}

async function fetchAndCache<T>(url: string, cacheKey: string, ttlMs?: number): Promise<T> {
  const activeTenant = typeof window !== 'undefined' ? localStorage.getItem('neva_active_tenant') : null;
  const headers: Record<string, string> = {};
  if (activeTenant) {
    headers['X-Tenant-ID'] = activeTenant;
  }

  const effectiveTtl = ttlMs || getEndpointTtl(url);

  const promise = fetch(url, { headers }).then(async (response) => {
    if (!response.ok) {
      const error: any = new Error(`Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const value = await response.json() as T;
    // Captura o token anti-CSRF emitido pelo bootstrap, se presente.
    if (url.split('?')[0] === '/api/bootstrap' && (value as any)?.csrfToken) {
      setCsrfToken((value as any).csrfToken);
    }
    // Set expiry and stale time (stale = 80% of TTL, allows stale-while-revalidate)
    const staleAt = Date.now() + effectiveTtl * 0.8;
    cache.set(cacheKey, { value, expiresAt: Date.now() + effectiveTtl, staleAt });
    return value;
  }).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });

  cache.set(cacheKey, { promise, expiresAt: Date.now() + effectiveTtl });
  return promise;
}

/**
 * Invalida cache de forma granular por padrão de URL.
 * Use prefixos específicos para não limpar tudo.
 */
export function invalidateRequestCache(prefix = '/api/'): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Invalida cache de endpoints específicos (mais granular).
 */
export function invalidateEndpoints(...patterns: string[]): void {
  for (const key of cache.keys()) {
    if (patterns.some(p => key.includes(p))) {
      cache.delete(key);
    }
  }
}

/**
 * Prefetch um endpoint em background (para dados que o usuário vai precisar em breve).
 */
export function prefetchEndpoint(url: string): void {
  const existing = cache.get(url);
  if (existing?.value !== undefined && existing.expiresAt > Date.now()) return;
  // Fire and forget - just warm the cache
  cachedFetchJson(url).catch(() => {});
}
