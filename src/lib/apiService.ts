/**
 * Generic API Service Factory
 * Eliminates duplicated CRUD patterns across adminService, eventService, 
 * materialService, muralService, and userService.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

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

async function request<T>(endpoint: string, config: RequestConfig = { method: 'GET' }): Promise<T> {
  const { method, body } = config;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  };

  if (body && method !== 'GET') {
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
    return undefined as T;
  }

  return response.json();
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
