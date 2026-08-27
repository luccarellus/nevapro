import Redis, { RedisOptions } from 'ioredis';
import { log } from '../utils/logger';

/**
 * Cliente Redis ultra-rápido (VPS / docker-compose).
 *
 * Configurado com TCP_NODELAY, auto-pipelining, TCP keep-alive e inicialização ansiosa.
 * Se Redis estiver indisponível, falha silenciosamente de forma instantânea sem travar as requisições.
 */
let client: Redis | null = null;
let connectPromise: Promise<boolean> | null = null;

export function getRedisClient(): Redis | null {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME || 'default';
  const url = process.env.REDIS_URL;

  if (!url && !host) return null;
  if (client) return client;

  const redisOptions: RedisOptions = {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 300,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    enableAutoPipelining: true,
    keepAlive: 5_000,
    noDelay: true,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 150, 500)),
  };

  if (url) {
    client = new Redis(url, redisOptions);
  } else {
    client = new Redis({
      host,
      port,
      password: password || undefined,
      username: username || undefined,
      ...redisOptions,
    });
  }

  client.on('error', (err) => {
    log.warn('[Redis] Erro de conexão:', err?.message);
  });
  client.on('connect', () => {
    log.info('[Redis] Conectado ao Redis');
  });
  client.on('close', () => {
    log.warn('[Redis] Conexão com Redis encerrada');
  });

  // Conecta sem bloquear o boot do servidor
  connectPromise = client
    .connect()
    .then(() => true)
    .catch(() => false);

  return client;
}

/**
 * Aguarda o Redis ficar pronto (status 'ready').
 * Retorna false IMEDIATAMENTE se o status não for ready/connecting (nunca trava a requisição).
 */
export async function waitForRedisReady(timeoutMs = 100): Promise<boolean> {
  const current = getRedisClient();
  if (!current) return false;
  if (current.status === 'ready') return true;
  if (current.status !== 'connecting' && current.status !== 'connect') {
    return false;
  }
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

// Inicializa a conexão de forma ansiosa no boot se o Redis estiver configurado
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    getRedisClient();
  } catch {
    // Ignora erros na inicialização estática
  }
}
