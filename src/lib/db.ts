import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const isSupabaseDatabase =
  !!connectionString &&
  /supabase/i.test(connectionString);

const ssl =
  process.env.DISABLE_DB_SSL === 'true'
    ? false
    : isSupabaseDatabase || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined;

const pool = new Pool({
  connectionString,
  ssl,
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rows: res.rowCount });
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

