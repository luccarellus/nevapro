/**
 * Generic API Service Factory
 * Eliminates duplicated CRUD patterns across adminService, eventService, 
 * materialService, muralService, and userService.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
import { cachedFetchJson, invalidateEndpoints, invalidateRequestCache } from './requestCache';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface RequestConfig {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
}

// Token anti-CSRF emitido pelo bootstrap e anexado às requisições mutantes.
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token && typeof token === 'string' ? token : null;
}

/** Token anti-CSRF corrente (capturado no bootstrap). */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/**
 * Headers de segurança para requisições mutantes feitas via `fetch`
 * direto (fora de `request`). Sem cookie de sessão o servidor dispensa
 * o token; com sessão ativa o header é obrigatório (403 sem ele).
 */
export function csrfHeaders(): Record<string, string> {
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}

async function request<T>(endpoint: string, config: RequestConfig = { method: 'GET' }): Promise<T> {
  const { method, body } = config;
  if (method === 'GET') return cachedFetchJson<T>(endpoint);

  const activeTenant = typeof window !== 'undefined' ? localStorage.getItem('neva_active_tenant') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(config.headers || {}),
  };
  if (activeTenant) {
    headers['X-Tenant-ID'] = activeTenant;
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, options);

  if (!response.ok) {
    let errorMsg = `Request failed: ${response.status}`;
    try {
      const errBody = await response.json();
      errorMsg = errBody.error || errBody.message || errorMsg;
    } catch {
      // keep default error message
    }
    throw new Error(errorMsg);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    invalidateMutationCache(endpoint);
    return undefined as T;
  }

  const result = await response.json();
  invalidateMutationCache(endpoint);
  return result;
}

function invalidateMutationCache(endpoint: string): void {
  const path = endpoint.split(/[?#]/, 1)[0];
  if (path.startsWith('/api/auth/')) {
    invalidateRequestCache();
    return;
  }

  const specificCollections = ['/api/admin/users', '/api/study-plans/tasks'];
  const collection = specificCollections.find((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    || path.split('/').slice(0, 3).join('/');
  const dependentEndpoints: Record<string, string[]> = {
    '/api/admin/users': ['/api/leaderboard'],
    '/api/user': ['/api/bootstrap', '/api/leaderboard', '/api/performance'],
    // Bootstrap embeds materials list — bust it when materials change
    '/api/materials': ['/api/bootstrap'],
  };
  invalidateEndpoints(collection, ...(dependentEndpoints[collection] || []));
}

/**
 * Creates a typed CRUD service for a given API endpoint.
 * 
 * Usage:
 * ```ts
 * const materialService = createApiService<Material>('/api/materials');
 * const materials = await materialService.list();
 * const created = await materialService.create({ title: '...' });
 * ```
 */
export function createApiService<T extends { id: string }>(basePath: string) {
  return {
    /** GET all items */
    list: (): Promise<T[]> => request<T[]>(basePath),

    /** GET single item by id (if the API supports it) */
    get: (id: string): Promise<T> => request<T>(`${basePath}/${id}`),

    /** POST create new item */
    create: (data: Partial<T>): Promise<T> => request<T>(basePath, {
      method: 'POST',
      body: data,
    }),

    /** PUT update item by id */
    update: (id: string, data: Partial<T>): Promise<T> => request<T>(`${basePath}/${id}`, {
      method: 'PUT',
      body: data,
    }),

    /** DELETE item by id */
    remove: (id: string): Promise<void> => request<void>(`${basePath}/${id}`, {
      method: 'DELETE',
    }),
  };
}

export { request };
export type { ApiResponse, RequestConfig };
