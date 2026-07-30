import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { query } from '../../src/lib/db.js';
import { log } from '../utils/logger';
import { getB2Client } from '../services/b2Client';


let supabaseAdminClient: ReturnType<typeof createClient> | null = null;
let supabaseAnonClient: ReturnType<typeof createClient> | null = null;


export function getSupabaseAdminClient(): ReturnType<typeof createClient> | any {
  if (supabaseAdminClient) return supabaseAdminClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para Auth/Storage.');
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAdminClient;
}

export function getSupabaseAnonClient() {
  if (supabaseAnonClient) return supabaseAnonClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios para login com Supabase Auth.');
  }

  supabaseAnonClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAnonClient;
}

function sanitizeIdentifier(name: string): string {
  if (!name) return name;
  // Permite estritamente apenas caracteres alfanuméricos e sublinhados
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Identificador de banco de dados inválido ou inseguro: ${name}`);
  }
  return name;
}

function sanitizeSelectCols(cols: string): string {
  if (!cols) return '*';
  // Divide as colunas por vírgula e valida cada uma individualmente
  const parts = cols.split(',');
  for (let part of parts) {
    part = part.trim();
    // Cada coluna deve conter apenas caracteres alfanuméricos, sublinhados, asterisco e parênteses
    if (!/^[a-zA-Z0-9_*\\(\\)]+$/.test(part)) {
      throw new Error(`Coluna de select insegura detectada: ${part}`);
    }
  }
  return cols;
}

class PostgresQueryBuilder {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private selectCols: string = '*';
  private whereCols: string[] = [];
  private whereVals: any[] = [];
  private insertData: any = null;
  private updateData: any = null;
  private limitVal: number | null = null;
  private orderCol: string | null = null;
  private orderAsc: boolean = true;

  constructor(table: string) {
    this.tableName = table;
  }
  
  select(cols = '*') {
    if (this.action === 'select') {
      this.action = 'select';
    }
    this.selectCols = cols;
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.insertData = Array.isArray(data) ? data[0] : data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.whereCols.push(col);
    this.whereVals.push(val);
    return this;
  }
  
  order(col: string, { ascending = true } = {}) {
    this.orderCol = col;
    this.orderAsc = ascending;
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  range(start: number, end: number) {
    this.limitVal = end - start + 1;
    return this;
  }

  gte(col: string, val: any) {
    this.whereCols.push(`${col}__gte`);
    this.whereVals.push(val);
    return this;
  }

  async execute() {
    let sql = '';
    const params: any[] = [];
    
    const safeTable = sanitizeIdentifier(this.tableName);
    const safeSelectCols = sanitizeSelectCols(this.selectCols);

    if (this.action === 'select') {
      sql = `SELECT ${safeSelectCols} FROM ${safeTable}`;
      if (this.whereCols.length > 0) {
        const whereClause = this.whereCols.map((c, i) => {
           const cleanCol = c.replace('__gte', '').replace('__lte', '');
           const safeCol = sanitizeIdentifier(cleanCol);
           const op = c.endsWith('__gte') ? '>=' : (c.endsWith('__lte') ? '<=' : '=');
           return `${safeCol} ${op} $${i+1}`;
        }).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...this.whereVals);
      }
      if (this.orderCol) {
        const safeOrderCol = sanitizeIdentifier(this.orderCol);
        sql += ` ORDER BY ${safeOrderCol} ${this.orderAsc ? 'ASC' : 'DESC'}`;
      }
      if (this.limitVal) {
        sql += ` LIMIT ${this.limitVal}`;
      }
    } else if (this.action === 'insert') {
      const keys = Object.keys(this.insertData);
      const vals = Object.values(this.insertData);
      const placeholders = keys.map((_, i) => `$${i+1}`).join(', ');
      keys.forEach(k => sanitizeIdentifier(k));
      sql = `INSERT INTO ${safeTable} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING ${safeSelectCols}`;
      params.push(...vals);
    } else if (this.action === 'update') {
      const keys = Object.keys(this.updateData);
      const vals = Object.values(this.updateData);
      keys.forEach(k => sanitizeIdentifier(k));
      const setClause = keys.map((k, i) => `${k} = $${i+1}`).join(', ');
      sql = `UPDATE ${safeTable} SET ${setClause}`;
      params.push(...vals);
      
      if (this.whereCols.length > 0) {
        const offset = keys.length;
        const whereClause = this.whereCols.map((c, i) => {
           const cleanCol = c.replace('__gte', '').replace('__lte', '');
           const safeCol = sanitizeIdentifier(cleanCol);
           const op = c.endsWith('__gte') ? '>=' : (c.endsWith('__lte') ? '<=' : '=');
           return `${safeCol} ${op} $${offset + i + 1}`;
        }).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...this.whereVals);
      }
      sql += ` RETURNING ${safeSelectCols}`;
    } else if (this.action === 'delete') {
      sql = `DELETE FROM ${safeTable}`;
      if (this.whereCols.length > 0) {
        const whereClause = this.whereCols.map((c, i) => {
           const cleanCol = c.replace('__gte', '').replace('__lte', '');
           const safeCol = sanitizeIdentifier(cleanCol);
           const op = c.endsWith('__gte') ? '>=' : (c.endsWith('__lte') ? '<=' : '=');
           return `${safeCol} ${op} $${i+1}`;
        }).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...this.whereVals);
      }
    }

    try {
      const res = await query(sql, params);
      return { data: res.rows, error: null };
    } catch (e: any) {
      log.error(`[PG Wrapper Error] ${sql}`, e);
      return { data: null, error: e };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    resolve?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(resolve, reject);
  }

  async maybeSingle() {
    this.limit(1);
    const { data, error } = await this.execute();
    return { data: data && data.length > 0 ? data[0] : null, error };
  }

  async single() {
    this.limit(1);
    const { data, error } = await this.execute();
    if (error) return { data: null, error };
    if (!data || data.length === 0) return { data: null, error: new Error('No rows found') };
    return { data: data[0], error: null };
  }
}

export const dbAdmin = {
  from(table: string) {
    return new PostgresQueryBuilder(table);
  },
  auth: {
    admin: {
      async listUsers(params?: { page?: number; perPage?: number }) {
        try {
          const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({
            page: params?.page,
            perPage: params?.perPage,
          });
          return { data, error };
        } catch (error: any) {
          return { data: { users: [] }, error };
        }
      },
      async deleteUser(id: string, shouldSoftDelete = false) {
        const { data, error } = await getSupabaseAdminClient().auth.admin.deleteUser(id, shouldSoftDelete);
        return { data, error };
      },
      async updateUserById(id: string, data: any) {
        const result = await getSupabaseAdminClient().auth.admin.updateUserById(id, data);
        return result;
      }
    }
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: any, options?: any) {
          try {
            const client = getB2Client();
            const command = new PutObjectCommand({
              Bucket: bucket,
              Key: path,
              Body: file,
              ContentType: options?.contentType || 'application/octet-stream',
            });
            await client.send(command);
            return { data: { path }, error: null };
          } catch (error: any) {
            log.error('[B2 Storage] Upload error:', error);
            return { data: null, error };
          }
        },
        getPublicUrl(path: string, options?: any) {
          const endpointHost = process.env.B2_ENDPOINT?.replace(/^https?:\/\//, '');
          const publicUrl = `https://${bucket}.${endpointHost}/${path}`;
          return { data: { publicUrl } };
        },
        async getObject(path: string) {
          try {
            const client = getB2Client();
            const command = new GetObjectCommand({
              Bucket: bucket,
              Key: path,
            });
            const response = await client.send(command);
            const stream = response.Body;
            const contentType = response.ContentType || 'application/octet-stream';
            return { data: { stream, contentType }, error: null };
          } catch (error: any) {
            log.error('[B2 Storage] GetObject error:', error);
            return { data: null, error };
          }
        },
        async remove(path: string) {
          try {
            const client = getB2Client();
            const command = new DeleteObjectCommand({
              Bucket: bucket,
              Key: path,
            });
            await client.send(command);
            log.info(`[B2 Storage] Object deleted: ${bucket}/${path}`);
            return { data: null, error: null };
          } catch (error: any) {
            log.error('[B2 Storage] Delete error:', error);
            return { data: null, error };
          }
        }
      };
    }
  }
};
