import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocka dependências que tocam banco/Redis — testamos só a criptografia do token.
vi.mock('../lib/dbQueryBuilder', () => ({
  dbAdmin: { from: vi.fn() },
}));
vi.mock('../../src/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('../services/userCache', () => ({
  getUserCache: vi.fn(async () => null),
  setUserCache: vi.fn(async () => {}),
  userCacheKeys: { auth: (h: string) => `auth:${h}` },
}));
vi.mock('../services/rbacService', () => ({
  getUserRbacContext: vi.fn(async () => ({
    roles: [],
    permissions: [],
    tenants: [],
    defaultTenantId: null,
    isAdmin: false,
  })),
}));

process.env.JWT_SECRET = 'test_secret_with_at_least_32_characters!!';

import { createSessionToken, verifySessionToken } from './auth';
import { AuthenticatedUser } from '../types';

const makeUser = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'aluno@x.com',
  role: 'student',
  ...over,
});

beforeEach(() => {
  process.env.JWT_SECRET = 'test_secret_with_at_least_32_characters!!';
});

describe('createSessionToken / verifySessionToken', () => {
  it('token válido roundtrip (student)', () => {
    const user = makeUser();
    const token = createSessionToken(user);
    expect(token.startsWith('st.')).toBe(true);
    const verified = verifySessionToken(token);
    expect(verified?.userId).toBe(user.userId);
    expect(verified?.role).toBe('student');
  });

  it('token admin usa prefixo adm', () => {
    const token = createSessionToken(makeUser({ role: 'admin' }));
    expect(token.startsWith('adm.')).toBe(true);
    expect(verifySessionToken(token)?.role).toBe('admin');
  });

  it('rejeita token com assinatura adulterada', () => {
    const token = createSessionToken(makeUser());
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${Buffer.from('forged').toString('base64url')}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejeita payload modificado (re-assinatura impossível sem o segredo)', () => {
    const token = createSessionToken(makeUser());
    const [prefix, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({
      userId: '22222222-2222-2222-2222-222222222222',
      email: 'vítima@x.com',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 9999,
    })).toString('base64url');
    expect(verifySessionToken(`${prefix}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejeita token expirado', () => {
    const secret = process.env.JWT_SECRET!;
    const { createHmac } = require('node:crypto');
    const payload = Buffer.from(JSON.stringify({
      userId: 'x', email: 'x@x.com', role: 'student',
      exp: Math.floor(Date.now() / 1000) - 10,
    })).toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    expect(verifySessionToken(`st.${payload}.${sig}`)).toBeNull();
  });

  it('rejeita estruturas malformadas', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('abc')).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
    expect(verifySessionToken('bad.abcd.abcd')).toBeNull();
  });

  it('carrega tokenVersion no payload', () => {
    const token = createSessionToken(makeUser({ tokenVersion: 3 } as any));
    expect((verifySessionToken(token) as any)?.tokenVersion).toBe(3);
  });

  it('sem JWT_SECRET não emite token', () => {
    delete process.env.JWT_SECRET;
    expect(() => createSessionToken(makeUser())).toThrow(/JWT_SECRET/);
  });
});
