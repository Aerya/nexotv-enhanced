import { beforeEach, describe, expect, it, vi } from 'vitest';

const records = vi.hoisted(() => new Map<string, any>());

vi.mock('../../src/config/env', () => ({
  default: {
    CONFIG_SECRET: 'test-secret-32-chars-long!!',
    SQLITE_PATH: ':memory:',
  },
  repoRoot: '/tmp',
}));

vi.mock('../../src/utils/sqliteCache', () => ({
  init: vi.fn(),
  set: vi.fn((key: string, value: any) => records.set(key, value)),
  get: vi.fn((key: string) => records.get(key) ?? null),
}));

import {
  isStoredConfigToken,
  resolveConfigToken,
  storeConfigToken,
} from '../../src/utils/configTokenStore';
import { encryptConfig } from '../../src/utils/cryptoConfig';

describe('configTokenStore', () => {
  beforeEach(() => records.clear());

  it('keeps a six-provider config at 36 characters even when its legacy token exceeds 9k', () => {
    const categoryName = (source: number, category: number) => {
      const uniquePart = Buffer.from(`${source}:${category}:${category * 2654435761}`).toString('hex');
      return `Provider ${source} - Category ${category} - ${uniquePart.padEnd(64, String(category % 10))}`;
    };
    const allCategories: string[] = [];
    const sources = Array.from({ length: 6 }, (_, source) => {
      const selectedCategories = Array.from({ length: 80 }, (_, category) => categoryName(source, category));
      allCategories.push(...selectedCategories);
      return {
        id: `source-${source}`,
        name: `Provider ${source}`,
        provider: 'xtream',
        xtreamUrl: `https://provider-${source}.example.com`,
        xtreamUsername: `user-${source}`,
        xtreamPassword: `password-${source}`,
        selectedCategories,
        categoryTypes: Object.fromEntries(selectedCategories.map(name => [name, 'tv'])),
      };
    });
    const config = {
      provider: 'multi',
      sources,
      selectedCategories: allCategories,
      categoryTypes: Object.fromEntries(allCategories.map(name => [name, 'tv'])),
    };
    const json = JSON.stringify(config);
    const legacyToken = encryptConfig(json)!;
    const token = storeConfigToken(json);

    expect(legacyToken.length).toBeGreaterThan(9000);
    expect(token).toMatch(/^cfg_[A-Za-z0-9_-]{32}$/);
    expect(token).toHaveLength(36);
    expect(resolveConfigToken(token)).toEqual(config);
  });

  it('reuses the same reference for an identical config', () => {
    const json = JSON.stringify({ provider: 'm3u', m3uUrl: 'https://example.com/list.m3u' });
    expect(storeConfigToken(json)).toBe(storeConfigToken(json));
  });

  it('rejects a well-formed reference that is not in the database', () => {
    const token = 'cfg_' + 'A'.repeat(32);
    expect(isStoredConfigToken(token)).toBe(true);
    expect(() => resolveConfigToken(token)).toThrow('Unknown configuration reference');
  });

  it('keeps legacy self-contained tokens compatible', () => {
    const config = { provider: 'm3u' };
    const legacy = Buffer.from(JSON.stringify(config)).toString('base64url');
    expect(isStoredConfigToken(legacy)).toBe(false);
    expect(resolveConfigToken(legacy)).toEqual(config);
  });
});
