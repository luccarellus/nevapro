import { query } from './db.js';

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
    this.action = 'select';
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

  async execute() {
    let sql = '';
    const params: any[] = [];
    
    if (this.action === 'select') {
      sql = `SELECT ${this.selectCols} FROM ${this.tableName}`;
      if (this.whereCols.length > 0) {
        const whereClause = this.whereCols.map((c, i) => `${c} = $${i+1}`).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...this.whereVals);
      }
      if (this.orderCol) {
        sql += ` ORDER BY ${this.orderCol} ${this.orderAsc ? 'ASC' : 'DESC'}`;
      }
      if (this.limitVal) {
        sql += ` LIMIT ${this.limitVal}`;
      }
    } else if (this.action === 'insert') {
      const keys = Object.keys(this.insertData);
      const vals = Object.values(this.insertData);
      const placeholders = keys.map((_, i) => `$${i+1}`).join(', ');
      sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      params.push(...vals);
    } else if (this.action === 'update') {
      const keys = Object.keys(this.updateData);
      const vals = Object.values(this.updateData);
      const setClause = keys.map((k, i) => `${k} = $${i+1}`).join(', ');
      sql = `UPDATE ${this.tableName} SET ${setClause}`;
      params.push(...vals);
      
      if (this.whereCols.length > 0) {
        const offset = keys.length;
        const whereClause = this.whereCols.map((c, i) => `${c} = $${offset + i + 1}`).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...this.whereVals);
      }
      sql += ' RETURNING *';
    } else if (this.action === 'delete') {
      sql = `DELETE FROM ${this.tableName}`;
      if (this.whereCols.length > 0) {
        const whereClause = this.whereCols.map((c, i) => `${c} = $${i+1}`).join(' AND ');
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

  async then(resolve: any, reject: any) {
    try {
      const res = await this.execute();
      resolve(res);
    } catch(e) {
      reject(e);
    }
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
      async deleteUser() { return { error: null }; },
      async updateUserById(id: string, data: any) { return { error: null }; }
    }
  }
};
