import { describe, expect, it } from 'vitest';
import { formatDateToBR, formatShortDate, toTimestamp } from './dateUtils';

describe('date utilities', () => {
  it('formats ISO dates as Brazilian dates without changing the date', () => {
    expect(formatDateToBR('2026-10-01T12:30:00.000Z')).toBe('01/10/2026');
    expect(formatDateToBR('unknown')).toBe('unknown');
    expect(formatDateToBR()).toBe('-');
  });

  it('returns zero for missing or invalid timestamps', () => {
    expect(toTimestamp()).toBe(0);
    expect(toTimestamp('invalid')).toBe(0);
    expect(toTimestamp('2026-10-01T00:00:00.000Z')).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
  });

  it('keeps the existing short-date fallback for invalid values', () => {
    expect(formatShortDate('invalid')).toBe('Sem data');
  });
});
