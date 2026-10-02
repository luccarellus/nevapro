/**
 * Verifica as conexões de Postgres e Redis usadas pela aplicação (lê o .env).
 *
 * Uso: npm run verify:connections
 *
 * - Postgres: testa DATABASE_URL e DIRECT_URL (SELECT 1 + versão + tabelas public
 *   + sonda real de escrita/leitura via temp table de sessão — zero resíduo no banco)
 * - Redis: usa a MESMA estratégia de conexão do app (REDIS_URL tem prioridade sobre
 *   REDIS_HOST/PORT), roda PING + sonda real de escrita/leitura (SET com TTL → GET →
 *   DEL). Se falhar com auth, aponta o provável motivo.
 */
import * as dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { resolveRedisConnectionConfig } from '../services/redisConnectionConfig';

// Mesma estratégia do app (server/instrument.ts): .env.local tem prioridade sobre .env.
// Sem isso, o script pode validar credenciais diferentes das que o app realmente usa.
dotenv.config({ path: ['.env.local', '.env'] });

function maskUrl(url: string): string {
  return url.replace(/(:\/\/[^:@/]+):[^@/]*@/, '$1:***@');
}

function banner(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * Sonda real de escrita/leitura no Postgres.
 * Usa uma TEMP table de sessão: some automaticamente ao fechar a conexão,
 * não exige permissão de CREATE no banco e não deixa nenhum resíduo.
 * Valida o ciclo completo: DDL → INSERT → SELECT → UPDATE → DELETE → verificação.
 */
async function probePostgresReadWrite(client: PoolClient): Promise<void> {
  const token = randomUUID();
  await client.query('CREATE TEMP TABLE verify_probe (id text PRIMARY KEY, value text) ON COMMIT PRESERVE ROWS');
  await client.query('INSERT INTO verify_probe (id, value) VALUES ($1, $2)', [token, 'write']);
  const readBack = await client.query('SELECT value FROM verify_probe WHERE id = $1', [token]);
  if (readBack.rows[0]?.value !== 'write') throw new Error('Valor lido difere do escrito');
  await client.query('UPDATE verify_probe SET value = $2 WHERE id = $1', [token, 'updated']);
  const updated = await client.query('SELECT value FROM verify_probe WHERE id = $1', [token]);
  if (updated.rows[0]?.value !== 'updated') throw new Error('UPDATE não persistiu');
  await client.query('DELETE FROM verify_probe WHERE id = $1', [token]);
  const afterDelete = await client.query('SELECT COUNT(*)::int AS n FROM verify_probe');
  if (afterDelete.rows[0].n !== 0) throw new Error('DELETE não removeu a linha');
}

/**
 * Sonda real de escrita/leitura no Redis.
 * Chave única com TTL curto: expira sozinha mesmo se o script morrer no meio.
 */
async function probeRedisReadWrite(client: Redis): Promise<void> {
  const key = `verify:probe:${randomUUID()}`;
  const payload = JSON.stringify({ probe: true, at: Date.now() });
  await client.set(key, payload, 'EX', 30);
  const readBack = await client.get(key);
  if (readBack !== payload) throw new Error('Valor lido difere do escrito');
  const deleted = await client.del(key);
  if (deleted !== 1) throw new Error('DEL não removeu a chave');
}

async function checkPostgres(label: string, connectionString: string): Promise<boolean> {
  banner(`Postgres — ${label}`);
  const ssl = process.env.DISABLE_DB_SSL === 'true' ? false : undefined;
  const pool = new Pool({
    connectionString,
    ssl,
    max: 1,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 8_000,
  });
  try {
    const client = await pool.connect();
    try {
      const version = await client.query('SELECT version()');
      const tables = await client.query(
        `SELECT COUNT(*)::int AS total FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const expected = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('users','admin_users','tenants','roles')`,
      );
      const missing = ['users', 'admin_users', 'tenants', 'roles'].filter((t) => !expected.rows.some((r: any) => r.table_name === t));
      console.log(`OK ${maskUrl(connectionString)}`);
      console.log(`   Servidor: ${version.rows[0].version.split(',')[0]}`);
      console.log(`   Tabelas em public: ${tables.rows[0].total}`);

      // Sonda real de escrita/leitura (temp table: some ao fechar a conexão)
      try {
        await probePostgresReadWrite(client);
        console.log('   Escrita/leitura: OK (CREATE TEMP TABLE → INSERT → SELECT → UPDATE → DELETE)');
      } catch (probeErr) {
        console.error(`   Escrita/leitura: FALHOU — ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`);
        console.error('   (conexão OK, mas o usuário pode não ter permissão de escrita no banco)');
        return false;
      }

      if (missing.length > 0) console.warn(`   Aviso: tabelas esperadas ausentes: ${missing.join(', ')}`);
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`FALHOU ${maskUrl(connectionString)}`);
    console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function checkRedis(): Promise<boolean> {
  banner('Redis');
  const connection = resolveRedisConnectionConfig(process.env);
  if (!connection) {
    console.log('Aviso: Redis não configurado no .env — o app usará fallback em memória (cache/rate-limit local).');
    return true;
  }

  const target = connection.url || `redis://${connection.host}:${connection.port}`;
  console.log(`Fonte: ${connection.url ? 'REDIS_URL' : 'REDIS_HOST/PORT'} → ${maskUrl(target)}`);

  const redisOptions = {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    username: connection.username,
    password: connection.password,
  };
  const client: Redis = connection.url
    ? new Redis(connection.url, redisOptions)
    : new Redis({ ...redisOptions, host: connection.host, port: connection.port });
  client.on('error', () => {});

  try {
    await client.connect();
    const pong = await client.ping();
    const info = await client.info('server');
    const versionLine = info.split('\n').find((l) => l.startsWith('redis_version:'));
    console.log(`OK PING → ${pong} | ${versionLine?.replace('redis_version:', 'versão ') ?? 'versão desconhecida'}`);

    const pingTimes: number[] = [];
    for (let index = 0; index < 10; index++) {
      const startedAt = performance.now();
      await client.ping();
      pingTimes.push(performance.now() - startedAt);
    }
    pingTimes.sort((a, b) => a - b);
    console.log(
      `   Latência PING: mediana ${pingTimes[5].toFixed(1)}ms, p95 ${pingTimes[9].toFixed(1)}ms ` +
      `(${connection.url ? 'REDIS_URL' : 'REDIS_HOST/PORT'})`,
    );

    // Sonda real de escrita/leitura (chave com TTL de 30s: expira sozinha)
    try {
      await probeRedisReadWrite(client);
      console.log('   Escrita/leitura: OK (SET com TTL → GET → DEL)');
    } catch (probeErr) {
      console.error(`   Escrita/leitura: FALHOU — ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`);
      console.error('   (PING OK, mas o usuário pode estar sem permissão de escrita — ex.: modo read-only, ACL ou maxmemory-policy noepel)');
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FALHOU ${maskUrl(target)}`);
    console.error(`   ${message}`);
    if (/NOAUTH|WRONGPASS|ERR Invalid password|ERR Client sent AUTH/i.test(message)) {
      if (connection.url && !connection.password) {
        console.error('   Dica: defina REDIS_PASSWORD ou inclua as credenciais em REDIS_URL.');
      }
    }
    return false;
  } finally {
    client.disconnect();
  }
}

async function main(): Promise<void> {
  const results: Array<[string, boolean]> = [];
  let ok = true;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL ausente no .env');
    ok = false;
  } else {
    const dbOk = await checkPostgres('DATABASE_URL', databaseUrl);
    results.push(['Postgres (DATABASE_URL)', dbOk]);
    ok = ok && dbOk;
  }

  const directUrl = process.env.DIRECT_URL;
  if (directUrl && directUrl !== databaseUrl) {
    const directOk = await checkPostgres('DIRECT_URL', directUrl);
    results.push(['Postgres (DIRECT_URL)', directOk]);
    ok = ok && directOk;
  }

  const redisOk = await checkRedis();
  results.push(['Redis', redisOk]);
  ok = ok && redisOk;

  banner('Resumo');
  for (const [name, passed] of results) {
    console.log(`${passed ? 'OK  ' : 'FALHOU'} ${name}`);
  }
  if (ok) {
    console.log('Tudo certo — conexões OK. Você pode rodar: npm run dev');
    process.exit(0);
  } else {
    console.log('Há falhas acima. Corrija o .env e rode novamente: npm run verify:connections');
    process.exit(1);
  }
}

main();
