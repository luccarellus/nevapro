import Redis, { RedisOptions } from 'ioredis';
import { log } from '../utils/logger';
import { resolveRedisConnectionConfig } from './redisConnectionConfig';

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

// ===== Modo de conexão: local (rede interna, ~0.3ms) vs remoto (internet, ~30ms+) =====
// No modo remoto o app minimiza RTTs: rate-limit local, L1 maior, timeouts folgados.
// Auto-detecção: host na mesma rede/privado => local; senão remoto.
// Override manual: REDIS_REMOTE_MODE="true" | "false"
export const isRemoteRedis = (): boolean => {
  const override = process.env.REDIS_REMOTE_MODE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  const connection = resolveRedisConnectionConfig(process.env);
  const host = connection?.url ? hostFromRedisUrl(connection.url) : connection?.host || '';
  return !isPrivateHost(host);
};

function hostFromRedisUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isPrivateHost(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (h === 'redis' || h === 'nevapro_redis' || h.endsWith('.local')) return true; // docker-compose / mDNS
  // RFC1918 + CGNAT (rede privada => latência ~sub-ms)
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  return false; // IP público => presumir internet (latência alta)
}

// RTT medido no boot (ativa keep-alive e dimensiona timeouts). 0 = ainda não medido.
let measuredRttMs = 0;

/** RTT (round-trip) médio até o Redis, medido no boot. 0 se ainda não medido. */
export function getRedisRttMs(): number {
  return measuredRttMs;
}

export function getRedisClient(): Redis | null {
  const connection = resolveRedisConnectionConfig(process.env);
  if (!connection) return null;
  if (client) return client;

  const redisOptions: RedisOptions = {
    lazyConnect: true,
    // Timeout de comando adaptativo: local é rígido (300ms); remoto é folgado
    // (2.5s ~ 8x o RTT típico de internet ~30ms) para sobreviver a jitter de rede.
    commandTimeout: isRemoteRedis() ? 2_500 : 300,
    connectTimeout: isRemoteRedis() ? 5_000 : 2_000,
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

  if (connection.url) {
    client = new Redis(connection.url, {
      ...redisOptions,
      username: connection.username,
      password: connection.password,
    });
  } else {
    client = new Redis({
      host: connection.host,
      port: connection.port,
      password: connection.password,
      username: connection.username,
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

  // Conecta sem bloquear o boot do servidor; no modo remoto, aquece a conexão
  // medindo o RTT (também cria o socket cedo para a primeira requisição não pagar o handshake).
  void client.connect().then(async () => {
    if (isRemoteRedis()) {
      const t0 = Date.now();
      await client!.ping();
      measuredRttMs = Date.now() - t0;
      log.info(`[Redis] RTT medido no boot: ${measuredRttMs}ms (modo remoto)`);
    }
  }).catch(() => {
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
if (resolveRedisConnectionConfig(process.env)) {
  try {
    getRedisClient();
  } catch {
    // Ignora erros na inicialização estática
  }
}
