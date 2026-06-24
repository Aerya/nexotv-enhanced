import { describe, it, expect } from 'vitest';
import { safeIsoDate } from '../../src/providers/xtreamProvider';

// Regression guard: a bad episode date used to throw RangeError in
// new Date(x).toISOString(), which made the whole series meta return null
// ("Aucune métadonnée n'a été trouvée").
describe('safeIsoDate', () => {
  it('returns null for empty / zero / unusable values', () => {
    expect(safeIsoDate(null)).toBeNull();
    expect(safeIsoDate('')).toBeNull();
    expect(safeIsoDate('0000-00-00')).toBeNull();
    expect(safeIsoDate('0000-00-00 00:00:00')).toBeNull();
    expect(safeIsoDate('not-a-date')).toBeNull();
  });

  it('parses ISO-ish date strings', () => {
    expect(safeIsoDate('2021-05-04')).toBe(new Date('2021-05-04').toISOString());
  });

  it('parses unix seconds and milliseconds', () => {
    expect(safeIsoDate('1600000000')).toBe(new Date(1600000000 * 1000).toISOString());
    expect(safeIsoDate(1600000000)).toBe(new Date(1600000000 * 1000).toISOString());
    expect(safeIsoDate('1600000000000')).toBe(new Date(1600000000000).toISOString());
  });

  it('never throws on garbage input', () => {
    expect(() => safeIsoDate({} as any)).not.toThrow();
    expect(() => safeIsoDate([] as any)).not.toThrow();
  });
});
