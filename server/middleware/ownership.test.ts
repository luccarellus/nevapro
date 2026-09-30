import { describe, it, expect } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requireOwnership } from './ownership';
import { AuthenticatedRequest } from '../types';

function fakeReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    user: { userId: 'u1', email: 'aluno@x.com', role: 'student' },
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function fakeRes() {
  const state = { statusCode: 200, body: undefined as any };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

describe('requireOwnership', () => {
  it('permite acesso ao próprio recurso (email da sessão)', () => {
    const { res, state } = fakeRes();
    let nextCalled = false;
    requireOwnership(fakeReq(), res, (() => { nextCalled = true; }) as NextFunction);
    expect(nextCalled).toBe(true);
    expect(state.statusCode).toBe(200);
  });

  it('permite quando query.email é o próprio email', () => {
    const { res, state } = fakeRes();
    let nextCalled = false;
    const req = fakeReq({ query: { email: 'ALUNO@x.com' } }); // case-insensitive
    requireOwnership(req, res, (() => { nextCalled = true; }) as NextFunction);
    expect(nextCalled).toBe(true);
    expect(state.statusCode).toBe(200);
  });

  it('bloqueia acesso a email de outro usuário (403)', () => {
    const { res, state } = fakeRes();
    let nextCalled = false;
    const req = fakeReq({ query: { email: 'outro@x.com' } });
    requireOwnership(req, res, (() => { nextCalled = true; }) as NextFunction);
    expect(nextCalled).toBe(false);
    expect(state.statusCode).toBe(403);
  });

  it('bloqueia via body.email também', () => {
    const { res, state } = fakeRes();
    const req = fakeReq({ body: { email: 'vítima@x.com' } });
    requireOwnership(req, res, (() => {}) as NextFunction);
    expect(state.statusCode).toBe(403);
  });

  it('exige email identificável (400)', () => {
    const { res, state } = fakeRes();
    const req = fakeReq({ user: undefined } as any);
    requireOwnership(req, res, (() => {}) as NextFunction);
    expect(state.statusCode).toBe(400);
  });
});
