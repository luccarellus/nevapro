import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../services/b2LogStorage', () => ({
  isB2LogStorageConfigured: vi.fn(() => false),
  storeB2Log: vi.fn(async () => {}),
}));
vi.mock('../services/logContext', () => ({
  enqueueLog: vi.fn(() => false),
  flushLogContext: vi.fn(async () => {}),
  runWithLogContext: vi.fn((fn: () => void) => fn()),
}));

import { validateEnv } from './env';
import { log } from './logger';

const resetEnv = () => {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
  process.env.JWT_SECRET = 'seguro_seguro_seguro_seguro_32chars!';
};

beforeEach(() => {
  resetEnv();
  vi.clearAllMocks();
});

describe('validateEnv', () => {
  it('não lança com as variáveis obrigatórias presentes', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('falha rápido sem DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('falha rápido sem JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('reporta todas as variáveis faltantes de uma vez', () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    try {
      validateEnv();
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_SECRET');
    }
  });

  it('avisa sobre serviços opcionais não configurados (não lança)', () => {
    delete process.env.REDIS_URL;
    delete process.env.SENTRY_DSN;
    validateEnv();
    expect(log.warn).toHaveBeenCalled();
  });
});
