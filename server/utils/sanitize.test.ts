import { describe, it, expect } from 'vitest';
import { sanitizeInput, normalizeEmail } from './sanitize';

describe('sanitizeInput', () => {
  it('escapa caracteres HTML especiais', () => {
    const result = sanitizeInput('<b>O\'Brien</b>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('&lt;');
  });

  it('trunca no maxLength padrão (100)', () => {
    expect(sanitizeInput('a'.repeat(200)).length).toBe(100);
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(undefined as any)).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('normaliza para lowercase sem espaços', () => {
    expect(normalizeEmail('  Aluno@Escola.COM ')).toBe('aluno@escola.com');
  });

  it('retorna vazio para entrada vazia', () => {
    expect(normalizeEmail('')).toBe('');
  });
});
