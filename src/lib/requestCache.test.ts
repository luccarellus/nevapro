import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './apiService';
import { cachedFetchJson } from './requestCache';

describe('API mutation cache invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invalidates only the mutated collection and its dependents', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method ? { success: true } : []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const suffix = `?cache-test=${Date.now()}`;
    const eventsUrl = `/api/eventos${suffix}`;
    const materialsUrl = `/api/materials${suffix}`;

    await cachedFetchJson(eventsUrl);
    await cachedFetchJson(materialsUrl);
    await request(`/api/eventos/evt-1${suffix}`, { method: 'PUT', body: {} });
    await cachedFetchJson(eventsUrl);
    await cachedFetchJson(materialsUrl);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      eventsUrl,
      materialsUrl,
      `/api/eventos/evt-1${suffix}`,
      eventsUrl,
    ]);
  });
});
