import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do pool do Postgres — testamos a GERAÇÃO de SQL, não o banco real.
vi.mock('../../src/lib/db', () => ({
  query: vi.fn(async (sql: string, params: unknown[]) => ({ rows: [], sql, params })),
}));

import { dbAdmin } from './dbQueryBuilder';
import { query } from '../../src/lib/db';

const mockedQuery = vi.mocked(query);

beforeEach(() => {
  mockedQuery.mockClear();
});

describe('PostgresQueryBuilder — geração de SQL', () => {
  it('gera SELECT com WHERE eq e ORDER BY', async () => {
    await dbAdmin.from('users').select('id, email').eq('tenant_id', 'abc').order('xp', { ascending: false }).limit(20);
    const call = mockedQuery.mock.calls[0];
    expect(call[0]).toContain('SELECT id, email FROM users');
    expect(call[0]).toContain('WHERE tenant_id = $1');
    expect(call[0]).toContain('ORDER BY xp DESC');
    expect(call[0]).toContain('LIMIT 20');
    expect(call[1]).toEqual(['abc']);
  });

  it('sempre parametriza valores (anti-SQL-injection)', async () => {
    const evil = "'; DROP TABLE users; --";
    await dbAdmin.from('users').select('*').eq('email', evil);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).not.toContain(evil);
    expect(params).toContain(evil);
  });

  it('rejeita identificadores de tabela inválidos', async () => {
    await expect(dbAdmin.from('users; DROP TABLE x').select('*')).rejects.toThrow(/inválido/i);
  });

  it('rejeita colunas de select com caracteres perigosos', async () => {
    await expect(dbAdmin.from('users').select('id; DROP TABLE x')).rejects.toThrow(/insegura/i);
  });

  it('gera INSERT com placeholders parametrizados', async () => {
    await dbAdmin.from('materials').insert({ title: 'Aula', url: 'https://x.com/a.pdf' }).select('*').single();
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO materials');
    expect(sql).toContain('RETURNING *');
    expect(params).toEqual(['Aula', 'https://x.com/a.pdf']);
  });

  it('gera UPDATE com SET e WHERE compostos', async () => {
    await dbAdmin.from('users').update({ xp: 150 }).eq('id', 'u1').eq('tenant_id', 't1');
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toContain('UPDATE users SET xp = $1');
    expect(sql).toContain('WHERE id = $2 AND tenant_id = $3');
    expect(params).toEqual([150, 'u1', 't1']);
  });

  it('gera DELETE com WHERE', async () => {
    await dbAdmin.from('mural').delete().eq('id', 'm1');
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toBe('DELETE FROM mural WHERE id = $1');
    expect(params).toEqual(['m1']);
  });

  it('traduz gte para >=', async () => {
    await dbAdmin.from('materials').select('uploaded_at').gte('uploaded_at', '2026-01-01');
    const [sql] = mockedQuery.mock.calls[0];
    expect(sql).toContain('uploaded_at >= $1');
  });

  it('retorna { data, error } em erro de query sem lançar', async () => {
    mockedQuery.mockRejectedValueOnce(new Error('boom'));
    const { data, error } = await dbAdmin.from('users').select('*');
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});
