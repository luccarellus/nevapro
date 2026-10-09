import { Pool } from 'pg';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { log } from '../../server/utils/logger';
import { executeLocalQuery, initLocalDb } from './localDb';

dotenv.config({ override: true });

const connectionString = process.env.DATABASE_URL;

const getSslConfig = () => {
  if (process.env.DISABLE_DB_SSL === 'true') {
    return false;
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd && !process.env.DB_CA_CERT) {
    return undefined;
  }

  let caContent: string | undefined;
  if (process.env.DB_CA_CERT) {
    try {
      caContent = fs.existsSync(process.env.DB_CA_CERT)
        ? fs.readFileSync(process.env.DB_CA_CERT, 'utf-8')
        : process.env.DB_CA_CERT;
    } catch {
      caContent = process.env.DB_CA_CERT;
    }
  }

  let rejectUnauthorized = false;
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true') {
    rejectUnauthorized = true;
  } else if (
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  ) {
    rejectUnauthorized = false;
  } else if (caContent) {
    rejectUnauthorized = true;
  } else {
    rejectUnauthorized = false;
  }

  return {
    rejectUnauthorized,
    ...(caContent ? { ca: caContent } : {}),
  };
};

const ssl = getSslConfig();

const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000, // Timeout curto de 3s para fallback imediato
  statement_timeout: 4_000,
  query_timeout: 4_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: 'nevapro-server',
});

let isRemotePostgresAvailable = false;
let hasCheckedPostgres = false;

// Sonda de conectividade com timeout curto (1.5s)
async function checkPostgresHealth(): Promise<boolean> {
  if (!connectionString) {
    hasCheckedPostgres = true;
    initLocalDb();
    return false;
  }
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    if (client) {
      await client.query('SELECT 1');
      client.release();
      isRemotePostgresAvailable = true;
      hasCheckedPostgres = true;
      log.info('[DB] Conectado ao PostgreSQL com sucesso.');
      return true;
    }
    return false;
  } catch {
    isRemotePostgresAvailable = false;
    hasCheckedPostgres = true;
    log.info('[DB] PostgreSQL remoto indisponível (firewall/timeout). Utilizando banco SQLite local integrado para resiliência.');
    initLocalDb();
    return false;
  }
}

// Inicia verificação imediatamente
void checkPostgresHealth();

// Impede que erros em conexões ociosas emitam 'unhandled error' no processo
pool.on('error', (err) => {
  log.warn('[DB Pool] Conexão ociosa encerrada pelo servidor (descartada do pool):', err?.message || err);
});

export const query = async (text: string, params?: any[]) => {
  if (hasCheckedPostgres && !isRemotePostgresAvailable) {
    return executeLocalQuery(text, params);
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    isRemotePostgresAvailable = true;
    hasCheckedPostgres = true;
    const duration = Date.now() - start;
    if (duration > 500) {
      log.warn(`[SlowQuery] ${duration}ms | ${text.substring(0, 200)}`);
    }
    return res;
  } catch (err: any) {
    // Se o PostgreSQL remoto falhar por timeout ou queda de rede, cai no banco local SQLite
    if (
      !isRemotePostgresAvailable ||
      err?.message?.includes('timeout') ||
      err?.code === 'ECONNREFUSED' ||
      err?.message?.includes('Connection terminated')
    ) {
      isRemotePostgresAvailable = false;
      hasCheckedPostgres = true;
      return executeLocalQuery(text, params);
    }
    throw err;
  }
};

export const getClient = async () => {
  if (hasCheckedPostgres && !isRemotePostgresAvailable) {
    return {
      query: (t: string, p?: any[]) => executeLocalQuery(t, p),
      release: () => {},
    };
  }
  try {
    return await pool.connect();
  } catch {
    isRemotePostgresAvailable = false;
    hasCheckedPostgres = true;
    return {
      query: (t: string, p?: any[]) => executeLocalQuery(t, p),
      release: () => {},
    };
  }
};

export default pool;
