import { describe, expect, it } from 'vitest';
import { newClientId, safeArray, safeNumber, safeString, safeTrim } from './safe';

describe('safe helpers', () => {
  it('safeTrim coerces numbers and ignores non-scalars', () => {
    expect(safeTrim(58)).toBe('58');
    expect(safeTrim('  hello  ')).toBe('hello');
    expect(safeTrim(null)).toBe('');
    expect(safeTrim({ a: 1 })).toBe('');
  });

  it('safeArray and safeNumber guard bad shapes', () => {
    expect(safeArray([1, 2])).toEqual([1, 2]);
    expect(safeArray(null)).toEqual([]);
    expect(safeNumber('12.5')).toBe(12.5);
    expect(safeNumber('x', 3)).toBe(3);
    expect(safeNumber(Number.NaN, 0)).toBe(0);
  });

  it('safeString and newClientId return usable values', () => {
    expect(safeString(true)).toBe('true');
    expect(safeString(undefined, 'x')).toBe('x');
    expect(newClientId().length).toBeGreaterThan(4);
  });
});
