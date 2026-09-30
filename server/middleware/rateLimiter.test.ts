import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Testa o fallback in-memory do rateLimiter (o caminho Redis é desativado aqui:
 * sem REDIS_URL/HOST o limiter usa 100% memória — determinístico para testes).
 *
 * Ordem IMPORTANTE: os deletes de env rodam antes do import do módulo, que
 * resolve o modo Redis no load time.
 */
process.env.REDIS_URL = '';
process.env.REDIS_HOST = '';
delete process.env.REDIS_URL;
delete process.env.REDIS_HOST;

import { rateLimiter } from './rateLimiter';

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.10',
    baseUrl: '/api/auth',
    path: '/login',
    url: '/login',
    method: 'POST',
    headers: {},
    body: {},
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  } as unknown as Request;
}

type CallResult = { statusCode: number; body: any; nextCalled: boolean };

async function call(limiter: ReturnType<typeof rateLimiter>, req: Request): Promise<CallResult> {
  const state: CallResult = { statusCode: 200, body: undefined, nextCalled: false };
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
  const next: NextFunction = () => {
    state.nextCalled = true;
  };
  await limiter(req, res, next);
  return state;
}

describe('rateLimiter (fallback in-memory)', () => {
  it('permite até o limite e bloqueia além dele', async () => {
    const limiter = rateLimiter(3, 60_000);
    const results: CallResult[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await call(limiter, fakeReq({ ip: '10.0.0.1' })));
    }
    expect(results.filter((r) => r.nextCalled).length).toBe(3);
    expect(results.filter((r) => r.statusCode === 429).length).toBe(2);
  });

  it('separa buckets por rota absoluta (baseUrl + path)', async () => {
    const limiter = rateLimiter(1, 60_000);
    const login1 = await call(limiter, fakeReq({ ip: '10.0.0.2', baseUrl: '/api/auth', path: '/login' }));
    const logout = await call(limiter, fakeReq({ ip: '10.0.0.2', baseUrl: '/api/auth', path: '/logout' }));
    const login2 = await call(limiter, fakeReq({ ip: '10.0.0.2', baseUrl: '/api/auth', path: '/login' }));

    expect(login1.nextCalled).toBe(true);
    expect(logout.nextCalled).toBe(true); // rota distinta => bucket distinto
    expect(login2.statusCode).toBe(429);  // mesma rota => bloqueado
  });

  it('separa buckets por IP', async () => {
    const limiter = rateLimiter(1, 60_000);
    const ipA = await call(limiter, fakeReq({ ip: '10.0.0.3' }));
    const ipB = await call(limiter, fakeReq({ ip: '10.0.0.4' }));
    const ipA2 = await call(limiter, fakeReq({ ip: '10.0.0.3' }));

    expect(ipA.nextCalled).toBe(true);
    expect(ipB.nextCalled).toBe(true);
    expect(ipA2.statusCode).toBe(429);
  });

  it('keyBy agrupa por conta (imune a rotação de IP)', async () => {
    const limiter = rateLimiter(1, 60_000, { keyBy: (req) => (req.body as any)?.email });
    const reqA1 = fakeReq({ ip: '1.1.1.1', body: { email: 'aluno@x.com' } });
    const reqA2 = fakeReq({ ip: '2.2.2.2', body: { email: 'aluno@x.com' } });

    const first = await call(limiter, reqA1);
    const second = await call(limiter, reqA2);

    expect(first.nextCalled).toBe(true);
    expect(second.statusCode).toBe(429); // mesmo e-mail, IP diferente => bloqueado
  });

  it('usa mensagem customizada no 429', async () => {
    const limiter = rateLimiter(0, 60_000, { message: 'Calma aí!' });
    const result = await call(limiter, fakeReq({ ip: '10.0.0.5' }));
    expect(result.statusCode).toBe(429);
    expect(result.body).toEqual({ error: 'Calma aí!' });
  });
});
