import { CACHE_KEYS, CACHE_TTL } from '../types';
import { log } from '../utils/logger';
import { Command } from 'ioredis';
import { getRedisClient, isRemoteRedis, waitForRedisReady } from './redisClient';

/**
 * Arquitetura de Cache de Dupla Camada Ultra-Rápida (L1 In-Memory + L2 Redis).
 *
 * - L1 Cache (Memória Local): Resposta instantânea em 0.01ms para tráfego em rajada.
 * - L2 Cache (Redis Cluster/Single): Sincronização multi-processo de alta performance.
 * - Fail-safe: Se o Redis cair, opera 100% em memória local / banco sem interromper o serviço.
 */

// ===== Camada 1: Cache In-Memory de Alta Velocidade =====
interface MemoryCacheEntry {
  data: unknown;
  expiresAt: number;
}

// Modo remoto (Redis via internet, ~30ms de RTT por comando): compensamos com uma
// camada L1 muito mais agressiva — cada hit no L1 é um RTT evitado.
const L1_CACHE_MAX_ITEMS = isRemoteRedis() ? 20_000 : 2_000;
const L1_DEFAULT_TTL_MS = isRemoteRedis() ? 60_000 : 5_000; // 60s remoto | 5s local
const l1Cache = new Map<string, MemoryCacheEntry>();

function getL1<T>(key: string): T | null {
  const entry = l1Cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    l1Cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setL1(key: string, data: unknown, ttlMs = L1_DEFAULT_TTL_MS): void {
  if (l1Cache.size >= L1_CACHE_MAX_ITEMS) {
    // Evicção LRU simples: remove 10% dos itens mais antigos
    const keysToDelete = Array.from(l1Cache.keys()).slice(0, Math.floor(L1_CACHE_MAX_ITEMS * 0.1));
    for (const k of keysToDelete) {
      l1Cache.delete(k);
    }
  }
  l1Cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function deleteL1(...keys: string[]): void {
  for (const key of keys) {
    l1Cache.delete(key);
  }
}

/** Verifica se o Redis está configurado no ambiente */
export const isRedisConfigured = (): boolean => {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
};

/**
 * Teto de espera para comandos Redis no modo remoto: se o comando demorar mais que
 * isso (rede degradada), devolve null e a chamada cai no fallback imediatamente —
 * a requisição do usuário nunca fica presa a um RTT de internet;
 * o commandTimeout (2.5s) cobre apenas falhas duras de conexão.
 */
const REMOTE_COMMAND_CAP_MS = 150;

function withRemoteCap<T>(promise: Promise<T>): Promise<T | null> {
  if (!isRemoteRedis()) return promise;
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REMOTE_COMMAND_CAP_MS)),
  ]);
}

/**
 * Executa um comando Redis direto (com suporte a fallback e auto-conexão).
 */
export async function runRedisCommand(command: string[]): Promise<unknown | null> {
  const client = getRedisClient();
  if (!client) return null;

  if (client.status !== 'ready') {
    const ready = await waitForRedisReady();
    if (!ready) return null;
  }

  try {
    const cmdName = command[0].toLowerCase();
    const args = command.slice(1);
    const method = (client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[cmdName];

    if (typeof method === 'function') {
      return await method.apply(client, args);
    }
    return await client.call(command[0], ...args);
  } catch (err) {
    log.warn('[Cache] Erro ao executar comando Redis:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Executa um pipeline de comandos Redis em lote.
 */
export async function runRedisPipeline(commands: string[][]): Promise<Array<{ result?: unknown; error?: string }> | null> {
  const client = getRedisClient();
  if (!client) return null;

  if (client.status !== 'ready') {
    const ready = await waitForRedisReady();
    if (!ready) return null;
  }

  try {
    const pipeline = client.pipeline();
    for (const command of commands) {
      const name = command[0].toLowerCase();
      const args = command.slice(1);
      const method = (pipeline as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
      if (typeof method === 'function') {
        method.apply(pipeline, args);
      } else {
        (pipeline as unknown as { sendCommand: (c: Command) => unknown }).sendCommand(new Command(command[0], args));
      }
    }
    const results = await pipeline.exec();
    if (!results) return null;
    return results.map(([err, result]) => (err ? { error: err.message } : { result }));
  } catch (err) {
    log.warn('[Cache] Erro no pipeline Redis:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Cache-aside pattern ultra-otimizado (L1 In-Memory -> L2 Redis -> DB Fallback).
 */
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  // 1. Tenta L1 Cache (Memória local — 0.01ms)
  const l1Result = getL1<T>(key);
  if (l1Result !== null) return l1Result;

  if (!isRedisConfigured()) return null;

  try {
    const client = getRedisClient();
    if (!client) return null;
    if (client.status !== 'ready') {
      const ready = await waitForRedisReady();
      if (!ready) return null;
    }

    // 2. Tenta L2 Cache (Redis — <1ms local, 1 RTT remoto com teto de espera)
    const raw = await withRemoteCap(client.get(key));
    if (!raw) return null;

    const data = JSON.parse(raw) as T;
    // Popula L1 para requisições subsequentes
    setL1(key, data);
    return data;
  } catch {
    return null;
  }
};

/**
 * Armazena dados no cache L1 e L2 com comando atômico SET ... EX.
 */
export const cacheSet = async (key: string, data: unknown, ttlSeconds?: number): Promise<void> => {
  const ttl = ttlSeconds || CACHE_TTL[key] || 300;

  // No modo remoto o L1 retém por mais tempo (capa 60s): cada hit evita um RTT.
  const l1CapMs = isRemoteRedis() ? 60_000 : 15_000;

  // Popula L1 em memória
  setL1(key, data, Math.min(ttl * 1000, l1CapMs));

  if (!isRedisConfigured()) return;

  try {
    const client = getRedisClient();
    if (!client) return;
    if (client.status !== 'ready') {
      const ready = await waitForRedisReady();
      if (!ready) return;
    }

    // Grava no Redis em 1 único comando atômico.
    // Remoto: fire-and-forget — a resposta não pode pagar um RTT de escrita;
    // o L1 local já foi populado acima, e o SET alcança o Redis em paralelo.
    if (isRemoteRedis()) {
      void client.set(key, JSON.stringify(data), 'EX', ttl).catch(() => {});
      return;
    }
    await client.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    log.warn('[Cache] Falha ao gravar no Redis:', err instanceof Error ? err.message : err);
  }
};

/**
 * Invalida chaves específicas nos caches L1 e L2.
 */
export const cacheInvalidate = async (...keys: string[]): Promise<void> => {
  if (keys.length === 0) return;

  // Invalida L1 instantaneamente
  deleteL1(...keys);

  if (!isRedisConfigured()) return;

  try {
    const client = getRedisClient();
    if (!client) return;
    if (client.status !== 'ready') {
      const ready = await waitForRedisReady();
      if (!ready) return;
    }

    // Invalida no Redis em 1 único comando DEL
    await client.del(...keys);
  } catch (err) {
    log.warn('[Cache] Falha ao invalidar chaves no Redis:', err instanceof Error ? err.message : err);
  }
};

/**
 * Helper de alto nível: Busca do cache ou executa o fetcher com revalidação.
 */
export async function cacheOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const freshData = await fetcher();
  if (freshData !== null && freshData !== undefined) {
    void cacheSet(key, freshData, ttlSeconds).catch(() => {});
  }
  return freshData;
}

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
