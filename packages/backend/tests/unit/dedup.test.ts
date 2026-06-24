import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleHash, groupByTitle } from '../../src/addon/dedup';

describe('normalizeTitle', () => {
  it('strips quality / language markers and punctuation', () => {
    expect(normalizeTitle('Inception 1080p MULTI')).toBe('inception');
    expect(normalizeTitle('INCEPTION FHD')).toBe('inception');
    expect(normalizeTitle('Inception [VF] (HDR)')).toBe('inception');
  });
  it('removes accents and normalizes spacing', () => {
    expect(normalizeTitle('Astérix   &  Obélix')).toBe('asterix obelix');
  });
  it('keeps years to disambiguate remakes', () => {
    expect(normalizeTitle('Dune 2021')).toBe('dune 2021');
    expect(normalizeTitle('Dune 1984')).toBe('dune 1984');
    expect(normalizeTitle('Dune 2021')).not.toBe(normalizeTitle('Dune 1984'));
  });
});

describe('titleHash', () => {
  it('matches across cosmetic differences', () => {
    expect(titleHash('Inception 4K')).toBe(titleHash('inception'));
    expect(titleHash('The Matrix HD')).toBe(titleHash('the matrix'));
  });
  it('differs for different titles', () => {
    expect(titleHash('Dune 2021')).not.toBe(titleHash('Dune 1984'));
  });
});

describe('groupByTitle', () => {
  it('groups same-title items from different sources, in order', () => {
    const items = [
      { name: 'Inception FHD', src: 'A' },
      { name: 'The Matrix', src: 'A' },
      { name: 'INCEPTION 4K', src: 'B' },
      { name: 'the matrix [VF]', src: 'C' },
    ];
    const groups = groupByTitle(items);
    expect(groups.size).toBe(2);
    const inception = groups.get(titleHash('Inception'))!;
    expect(inception.map(i => i.src)).toEqual(['A', 'B']);
    const matrix = groups.get(titleHash('The Matrix'))!;
    expect(matrix.map(i => i.src)).toEqual(['A', 'C']);
  });
  it('skips items that normalize to empty', () => {
    const groups = groupByTitle([{ name: '   ' }, { name: '[HD]' }]);
    expect(groups.size).toBe(0);
  });
});
