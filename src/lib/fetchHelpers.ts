export type ApiErrorPayload = { error?: string; message?: string };

export async function postJson<T>(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Falha na requisição';
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      message = payload.error || payload.message || message;
    } catch {
      message = response.status >= 500 ? 'Servidor indisponível' : message;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const mutationHeaders = (): Record<string, string> => ({});
