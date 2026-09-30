import { describe, it, expect } from 'vitest';
import { validateMaterialInput, validateEventInput, validateMuralInput } from './validation';

describe('validateMaterialInput', () => {
  it('exige title/type/url no create', () => {
    const result = validateMaterialInput({ title: 'Aula 1', type: 'pdf', url: 'https://x.com/a.pdf' });
    expect('data' in result).toBe(true);
  });

  it('rejeita body não-objeto', () => {
    expect('error' in validateMaterialInput('string' as any)).toBe(true);
    expect('error' in validateMaterialInput(null)).toBe(true);
    expect('error' in validateMaterialInput([1, 2])).toBe(true);
  });

  it('rejeita quando título ausente no create', () => {
    const result = validateMaterialInput({ type: 'pdf', url: 'https://x.com/a.pdf' });
    expect('error' in result).toBe(true);
  });

  it('aceita update parcial (partial=true)', () => {
    const result = validateMaterialInput({ description: 'novo texto' }, true);
    expect('data' in result).toBe(true);
  });

  it('rejeita update parcial sem nenhum campo válido', () => {
    const result = validateMaterialInput({}, true);
    expect('error' in result).toBe(true);
  });

  it('rejeita campos que excedem o limite', () => {
    const result = validateMaterialInput({
      title: 'x'.repeat(300),
      type: 'pdf',
      url: 'https://x.com/a.pdf',
    });
    expect('error' in result).toBe(true);
  });
});

describe('validateEventInput', () => {
  it('valida números inteiros nos limites', () => {
    expect('error' in validateEventInput({ title: 'E', questionsCount: 50001 })).toBe(true);
    expect('data' in validateEventInput({ title: 'E', questionsCount: 45 })).toBe(true);
    expect('error' in validateEventInput({ title: 'E', xpReward: 1.5 })).toBe(true);
  });

  it('rejeita contagem negativa', () => {
    expect('error' in validateEventInput({ title: 'E', questionsCount: -1 })).toBe(true);
  });
});

describe('validateMuralInput', () => {
  it('exige title e content', () => {
    expect('error' in validateMuralInput({ title: 'Só título' })).toBe(true);
    expect('data' in validateMuralInput({ title: 'Título', content: 'Conteúdo' })).toBe(true);
  });
});
