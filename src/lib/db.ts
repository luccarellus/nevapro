import { Pool } from 'pg';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { log } from '../../server/utils/logger';

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

  // Se DB_SSL_REJECT_UNAUTHORIZED for 'true', exige validação estrita do certificado.
  // Se DB_SSL_REJECT_UNAUTHORIZED for 'false' ou NODE_TLS_REJECT_UNAUTHORIZED === '0', desativa validação.
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
  min: 0,                        // Não força conexões ociosas no boot (evita timeout se banco estiver despertando)
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000, // 10s para acomodar cold start/TLS em redes remotas
  statement_timeout: 10_000,
  query_timeout: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: 'nevapro-server',
});

// Impede que erros em conexões ociosas emitam 'unhandled error' no processo
pool.on('error', (err) => {
  log.warn('[DB Pool] Conexão ociosa encerrada pelo servidor (descartada do pool):', err?.message || err);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Log slow queries (> 500ms) — via logger central (B2 + Sentry em error)
  if (duration > 500) {
    log.warn(`[SlowQuery] ${duration}ms | ${text.substring(0, 200)}`);
  }
  return res;
};

export const getClient = () => {
  return pool.connect();
};

export default pool;
