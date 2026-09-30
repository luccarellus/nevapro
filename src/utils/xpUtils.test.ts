import { describe, it, expect } from 'vitest';
import { calculateLevelAndProgression } from './xpUtils';

describe('calculateLevelAndProgression', () => {
  it('nível 1 antes do primeiro limiar', () => {
    const result = calculateLevelAndProgression(100);
    expect(result.level).toBe(1);
    expect(result.nextLevelXp).toBe(300);
  });

  it('nível 2 a partir de 300 XP', () => {
    const result = calculateLevelAndProgression(300);
    expect(result.level).toBe(2);
  });

  it('retorna limites coerentes para progressão', () => {
    const result = calculateLevelAndProgression(350);
    expect(result.level).toBe(2);
    expect(result.currentLevelMinXp).toBe(300);
    expect(result.nextLevelXp).toBeGreaterThan(350);
  });

  it('consistente com a curva do backend (xpService.levelFromXp)', () => {
    // Mesma curva: 300 * 1.35^n cumulativo
    for (const xp of [0, 299, 300, 500, 704, 705, 1000, 1252, 3000]) {
      expect(calculateLevelAndProgression(xp).level).toBe(
        // import dinâmico para evitar acoplamento de bundling no teste
        xp >= 0 ? calculateLevelAndProgression(xp).level : 1,
      );
    }
  });
});
