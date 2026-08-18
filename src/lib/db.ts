import { Pool } from 'pg';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

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
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
};

export const getClient = () => {
  return pool.connect();
};

const directConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const migrationPool = new Pool({
  connectionString: directConnectionString,
  ssl,
});

export const runMigrationQuery = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await migrationPool.query(text, params);
  return res;
};

export default pool;
