import { describe, it, expect } from 'vitest';
import { levelFromXp, xpForAnswers, XP_PER_CORRECT_ANSWER, XP_PER_INCORRECT_ANSWER } from './xpService';

describe('levelFromXp (curva de nível)', () => {
  it('nível 1 abaixo do primeiro limiar (300 XP)', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(299)).toBe(1);
  });

  it('avança de nível no limiar', () => {
    expect(levelFromXp(300)).toBe(2);
  });

  it('espelha a curva do frontend (fator 1.35)', () => {
    // 300 -> nível 2; 300 + 405 = 705 -> nível 3
    expect(levelFromXp(300)).toBe(2);
    expect(levelFromXp(704)).toBe(2);
    expect(levelFromXp(705)).toBe(3);
  });

  it('cresce monotonicamente', () => {
    let previous = 0;
    for (const xp of [0, 300, 705, 1252, 2000, 5000, 20000]) {
      const level = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});

describe('xpForAnswers', () => {
  it('calcula XP por acertos e erros', () => {
    // 8 acertos e 2 erros em 10 questões
    expect(xpForAnswers(8, 10)).toBe(8 * XP_PER_CORRECT_ANSWER + 2 * XP_PER_INCORRECT_ANSWER);
  });

  it('retorna 0 para entradas inválidas ou negativas', () => {
    expect(xpForAnswers(-5, 10)).toBe(0);
    expect(xpForAnswers(0, 0)).toBe(0);
    expect(xpForAnswers(NaN, 10)).toBe(0);
  });

  it('nunca ultrapassa o cap por chamada', () => {
    // cap de 10_000 por componente (10_000 corretas * 10 XP)
    expect(xpForAnswers(999_999, 999_999)).toBe(10_000 * XP_PER_CORRECT_ANSWER);
  });

  it('correct > total não gera XP negativo', () => {
    expect(xpForAnswers(12, 10)).toBe(12 * XP_PER_CORRECT_ANSWER);
  });
});
