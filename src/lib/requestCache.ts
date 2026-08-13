type CacheEntry = { expiresAt: number; value?: unknown; promise?: Promise<unknown> };

const cache = new Map<string, CacheEntry>();

export async function cachedFetchJson<T>(url: string, ttlMs = 60_000): Promise<T> {
  const now = Date.now();
  const activeTenant = typeof window !== 'undefined' ? localStorage.getItem('neva_active_tenant') : null;
  const cacheKey = activeTenant ? `${url}#tenant:${activeTenant}` : url;

  const existing = cache.get(cacheKey);
  if (existing?.value !== undefined && existing.expiresAt > now) return existing.value as T;
  if (existing?.promise) return existing.promise as Promise<T>;

  const headers: Record<string, string> = {};
  if (activeTenant) {
    headers['X-Tenant-ID'] = activeTenant;
  }

  const promise = fetch(url, { headers }).then(async (response) => {
    if (!response.ok) {
      const error: any = new Error(`Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const value = await response.json() as T;
    cache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });

  cache.set(cacheKey, { promise, expiresAt: now + ttlMs });
  return promise;
}

export function invalidateRequestCache(prefix = '/api/'): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
