import { query } from './db.js';

function sanitizeIdentifier(name: string): string {
  if (!name) return name;
  // Permite apenas caracteres alfanuméricos, sublinhados, pontos, espaços, vírgulas, parênteses e asterisco
  if (!/^[a-zA-Z0-9_\.,\s\*\(\)]+$/.test(name)) {
    throw new Error(`Identificador de banco de dados inválido ou inseguro: ${name}`);
  }
  return name;
}

class SupabaseQueryBuilder {
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
    const safeSelectCols = sanitizeIdentifier(this.selectCols);

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
      console.error(`[PG Wrapper Error] ${sql}`, e);
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

export const supabaseAdmin = {
  from(table: string) {
    return new SupabaseQueryBuilder(table);
  },
  auth: {
    admin: {
      async listUsers() { return { data: { users: [] }, error: null }; },
      async deleteUser(id: string) { return { error: null }; },
      async updateUserById(id: string, data: any) { return { error: null }; }
    }
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: any, options?: any) {
          return { data: null, error: new Error('Storage natively disabled. Switch to AWS S3/Vercel Blob.') };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: '/placeholder-url.pdf' } };
        }
      }
    }
  }
};
