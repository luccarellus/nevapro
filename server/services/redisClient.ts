import Redis from 'ioredis';
import { log } from '../utils/logger';

/**
 * Cliente Redis self-hosted (VPS / docker-compose).
 *
 * Usa a variável REDIS_URL (ex.: redis://redis:6379). Quando não configurada,
 * o app continua funcionando apenas com o fallback em memória.
 *
 * O cliente é criado de forma lazy e NUNCA derruba o servidor: erros de conexão
 * são apenas logados e as chamadas retornam fallback.
 */
let client: Redis | null = null;
let connectPromise: Promise<boolean> | null = null;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;

  client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 3_000),
  });

  client.on('error', (err) => {
    log.warn('[Redis] Erro de conexão:', err?.message);
  });
  client.on('connect', () => {
    log.info('[Redis] Conectado ao Redis local');
  });
  client.on('close', () => {
    log.warn('[Redis] Conexão com Redis encerrada');
  });

  // Conecta sem bloquear o boot do servidor e guarda a promise para que as
  // primeiras chamadas possam aguardar o Redis ficar pronto (sem race).
  connectPromise = client
    .connect()
    .then(() => true)
    .catch(() => false);

  return client;
}

/**
 * Aguarda o Redis ficar pronto (status 'ready').
 * Returns false rapidamente se o Redis estiver indisponível (nunca trava).
 */
export async function waitForRedisReady(timeoutMs = 1_000): Promise<boolean> {
  const current = getRedisClient();
  if (!current) return false;
  if (current.status === 'ready') return true;
  if (!connectPromise) return false;

  try {
    await Promise.race([
      connectPromise,
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return (current.status as string) === 'ready';
  } catch {
    return false;
  }
}

/** Encerra o cliente Redis (usado no graceful shutdown). */
export async function closeRedisClient(): Promise<void> {
  if (!client) return;
  const current = client;
  client = null;
  connectPromise = null;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
