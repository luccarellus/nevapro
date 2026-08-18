import { CACHE_KEYS, CACHE_TTL } from '../types';
import { log } from '../utils/logger';
import { Command } from 'ioredis';
import { getRedisClient, waitForRedisReady } from './redisClient';

/**
 * Camada de cache Redis (self-hosted via REDIS_URL).
 *
 * Usado na VPS (docker-compose injeta REDIS_URL=redis://redis:6379).
 * Sem Redis configurado, as funções falham silenciosamente e o caller usa o
 * fallback (banco de dados / memória) — o app nunca quebra sem Redis.
 */

/** Returns whether Redis (REDIS_URL) is configured. */
export const isRedisConfigured = (): boolean => {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
};

/**
 * Executa comandos no Redis local (ioredis) via pipeline.
 * Returns null se o Redis não estiver disponível/falhar.
 */
async function runLocalRedisPipeline(commands: string[][]): Promise<Array<{ result?: unknown; error?: string }> | null> {
  const client = getRedisClient();
  if (!client) return null;

  // Aguarda a conexão ficar pronta (rápido quando o Redis está de pé;
  // retorna false imediatamente quando indisponível, sem travar requisições)
  const ready = await waitForRedisReady();
  if (!ready) return null;

  try {
    // Nota: no ioredis v6 a forma `multi(commandsArray)` está quebrada e
    // `sendCommand` com Command cru devolve Buffers. Usamos os métodos
    // encadeados do pipeline, que retornam valores tipados (string/number).
    const pipeline = client.pipeline();
    for (const command of commands) {
      const name = command[0].toLowerCase();
      const args = command.slice(1);
      const method = (pipeline as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
      if (typeof method === 'function') {
        method.apply(pipeline, args);
      } else {
        // Fallback para comandos sem método tipado no pipeline
        (pipeline as unknown as { sendCommand: (c: Command) => unknown }).sendCommand(new Command(command[0], args));
      }
    }
    const results = await pipeline.exec();
    if (!results) return null;
    return results.map(([err, result]) => (err ? { error: err.message } : { result }));
  } catch (err) {
    log.warn('[Cache] Redis indisponível, usando fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Executa um pipeline de comandos Redis.
 * Returns null se o Redis não estiver disponível.
 */
export async function runRedisPipeline(commands: string[][]): Promise<Array<{ result?: unknown; error?: string }> | null> {
  return runLocalRedisPipeline(commands);
}

/**
 * Executa um único comando Redis.
 * Returns o resultado ou null se indisponível.
 */
export async function runRedisCommand(command: string[]): Promise<unknown | null> {
  const results = await runRedisPipeline([command]);
  if (!results || results.length === 0) return null;
  if (results[0]?.error) return null;
  return results[0]?.result ?? null;
}

/**
 * Cache-aside pattern: tenta Redis primeiro, retorna null se indisponível
 * (o caller deve consultar o banco).
 */
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await runRedisCommand(['GET', key]);
    if (!raw || typeof raw !== 'string') return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Armazena dados no cache Redis com TTL.
 * Falha silenciosamente se Redis indisponível — cache é opcional.
 */
export const cacheSet = async (key: string, data: unknown, ttlSeconds?: number): Promise<void> => {
  if (!isRedisConfigured()) return;
  const ttl = ttlSeconds || CACHE_TTL[key] || 300;
  await runRedisPipeline([
    ['SET', key, JSON.stringify(data)],
    ['EXPIRE', key, String(ttl)],
  ]);
};

/**
 * Invalida (apaga) chaves específicas do cache.
 * Chame sempre que dados forem criados, atualizados ou deletados.
 */
export const cacheInvalidate = async (...keys: string[]): Promise<void> => {
  if (!isRedisConfigured() || keys.length === 0) return;
  const commands = keys.map((k) => ['DEL', k]);
  await runRedisPipeline(commands);
};

/**
 * Invalida todas as chaves de cache relacionadas a conteúdo.
 */
export const cacheInvalidateAllContent = async (): Promise<void> => {
  await cacheInvalidate(
    CACHE_KEYS.MATERIALS,
    CACHE_KEYS.RECADOS,
    CACHE_KEYS.EVENTOS,
    CACHE_KEYS.LEADERBOARD,
    CACHE_KEYS.ADMIN_USERS,
    CACHE_KEYS.ADMIN_ACTIVITIES,
  );
};
