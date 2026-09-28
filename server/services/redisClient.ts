import Redis, { RedisOptions } from 'ioredis';
import { log } from '../utils/logger';

/**
 * Cliente Redis ultra-rápido (VPS / docker-compose).
 *
 * Configurado com TCP_NODELAY, auto-pipelining, TCP keep-alive e inicialização ansiosa.
 * Se Redis estiver indisponível, falha silenciosamente de forma instantânea sem travar as requisições.
 *
 * Reconexão: o ioredis NÃO reconecta sozinho após o status 'end'. A retryStrategy
 * abaixo nunca retorna null, garantindo reconexão automática e indefinida (com
 * backoff capado em 2s) — sem isso, uma única queda do Redis desativava o cache
 * e o rate-limit distribuído para sempre até reiniciar o processo.
 */
let client: Redis | null = null;

// Tempo máximo de espera por reconexão antes de desistir da requisição atual.
// Requisições nunca bloqueiam mais que isso: caem no fallback (memória/banco).
const RECONNECT_WAIT_MS = 500;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME || 'default';

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
    // Sempre reconecta: backoff crescente capado em 2s. Nunca retorna null
    // (null = desiste para sempre e o cliente morre no status 'end').
    retryStrategy: (times: number) => Math.min(times * 200, 2_000),
    // Reconnecta imediatamente em erros fatais de conexão (ex.: servidor reiniciado)
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'WRONGPASS', 'NOAUTH', 'LOADING', 'CLUSTERDOWN'];
      if (targetErrors.some((e) => err.message.includes(e))) return 2;
      return false;
    },
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
  client.on('ready', () => {
    log.info('[Redis] Redis pronto para receber comandos');
  });
  client.on('close', () => {
    log.warn('[Redis] Conexão com Redis encerrada (reconectando automaticamente)');
  });
  client.on('end', () => {
    log.warn('[Redis] Cliente Redis encerrado (não deveria acontecer com retryStrategy infinita)');
  });
  client.on('reconnecting', (delay: number) => {
    log.info(`[Redis] Reconectando em ${delay}ms...`);
  });

  // Conecta sem bloquear o boot do servidor
  void client.connect().catch(() => {
    // retryStrategy vai reagendar a reconexão automaticamente
  });

  return client;
}

/**
 * Aguarda o Redis ficar pronto (status 'ready').
 * Retorna false IMEDIATAMENTE se o cliente estiver morto ou reconectando fora da janela,
 * nunca travando a requisição por mais que o timeout.
 */
export async function waitForRedisReady(timeoutMs = 100): Promise<boolean> {
  const current = getRedisClient();
  if (!current) return false;
  if (current.status === 'ready') return true;

  // Estados em que não há conexão em andamento: desiste na hora.
  // ('connecting'/'connect'/'reconnecting' podem recuperar dentro da janela.)
  if (current.status === 'end' || current.status === 'wait') return false;

  try {
    const outcome = await new Promise<'ready' | 'timeout'>((resolve) => {
      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve('ready');
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve('timeout');
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        current.removeListener('ready', onReady);
      };
      current.once('ready', onReady);
    });
    return outcome === 'ready';
  } catch {
    return false;
  }
}

/** Encerra o cliente Redis (usado no graceful shutdown). */
export async function closeRedisClient(): Promise<void> {
  if (!client) return;
  const current = client;
  client = null;
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
