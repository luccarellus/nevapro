import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { query } from '../../src/lib/db.js';
import { log } from '../utils/logger';
import { getB2Client } from '../services/b2Client';


function sanitizeIdentifier(name: string): string {
  if (!name) return name;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Identificador de banco de dados inválido ou inseguro: ${name}`);
  }
  return name;
}

function sanitizeSelectCols(cols: string): string {
  if (!cols) return '*';
  const parts = cols.split(',');
  for (let part of parts) {
    part = part.trim();
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
  private orConditions: { col: string; val: any }[] = [];
  private isNotNullCol: string | null = null;
  private notEqCol: string | null = null;
  private notEqVal: any = null;

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

  /** WHERE col IS NOT NULL */
  not(col: string, op: 'is', val: any) {
    if (op === 'is') {
      if (val === null) {
        this.isNotNullCol = col;
      }
    }
    return this;
  }

  /** WHERE col != val */
  neq(col: string, val: any) {
    this.notEqCol = col;
    this.notEqVal = val;
    return this;
  }

  /**
   * Supabase-style .or() — e.g. `.or('tenant_id.is.null,tenant_id.eq.xxx')`
   * Translates to: (tenant_id IS NULL OR tenant_id = $n)
   */
  or(condition: string) {
    const parts = condition.split(',');
    for (const part of parts) {
      const match = part.trim().match(/^(\w+)\.(is|eq)\.(.+)$/);
      if (match) {
        const [, col, op, val] = match;
        if (op === 'is' && val === 'null') {
          this.orConditions.push({ col, val: null });
        } else if (op === 'eq') {
          this.orConditions.push({ col, val });
        }
      }
    }
    return this;
  }

  async execute(): Promise<{ data: any; error: any }> {
    let sql = '';
    const params: any[] = [];
    
    const safeTable = sanitizeIdentifier(this.tableName);
    const safeSelectCols = sanitizeSelectCols(this.selectCols);

    if (this.action === 'select') {
      sql = `SELECT ${safeSelectCols} FROM ${safeTable}`;
      if (this.whereCols.length > 0 || this.isNotNullCol || this.notEqCol || this.orConditions.length > 0) {
        const conditions: string[] = [];
        let paramIdx = 1;

        for (const c of this.whereCols) {
          const cleanCol = c.replace('__gte', '').replace('__lte', '');
          const safeCol = sanitizeIdentifier(cleanCol);
          const op = c.endsWith('__gte') ? '>=' : (c.endsWith('__lte') ? '<=' : '=');
          conditions.push(`${safeCol} ${op} $${paramIdx}`);
          params.push(this.whereVals[this.whereCols.indexOf(c)]);
          paramIdx++;
        }

        if (this.isNotNullCol) {
          const safeCol = sanitizeIdentifier(this.isNotNullCol);
          conditions.push(`${safeCol} IS NOT NULL`);
        }

        if (this.notEqCol) {
          const safeCol = sanitizeIdentifier(this.notEqCol);
          conditions.push(`${safeCol} != $${paramIdx}`);
          params.push(this.notEqVal);
          paramIdx++;
        }

        if (this.orConditions.length > 0) {
          const orParts: string[] = [];
          for (const { col, val } of this.orConditions) {
            const safeCol = sanitizeIdentifier(col);
            if (val === null) {
              orParts.push(`${safeCol} IS NULL`);
            } else {
              orParts.push(`${safeCol} = $${paramIdx}`);
              params.push(val);
              paramIdx++;
            }
          }
          conditions.push(`(${orParts.join(' OR ')})`);
        }

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
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
      const safeKeys = keys.map(k => sanitizeIdentifier(k));
      const placeholders = safeKeys.map((_, i) => `$${i+1}`).join(', ');
      sql = `INSERT INTO ${safeTable} (${safeKeys.join(', ')}) VALUES (${placeholders}) RETURNING ${safeSelectCols}`;
      params.push(...vals);
    } else if (this.action === 'update') {
      const keys = Object.keys(this.updateData);
      const vals = Object.values(this.updateData);
      const safeKeys = keys.map(k => sanitizeIdentifier(k));
      const setClause = safeKeys.map((k, i) => `${k} = $${i+1}`).join(', ');
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
      if (e?.code === '42703' && (this.action === 'insert' || this.action === 'update')) {
        const match = e.message?.match(/column "([^"]+)" of relation/i);
        const badCol = match ? match[1] : null;
        const targetObj = this.action === 'insert' ? this.insertData : this.updateData;

        if (badCol && targetObj && typeof targetObj === 'object' && badCol in targetObj) {
          log.warn(`[PG Wrapper Auto-Fix] Removing non-existent column "${badCol}" from ${this.action} on table "${safeTable}" and retrying.`);
          delete targetObj[badCol];
          return this.execute();
        }
      }

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
