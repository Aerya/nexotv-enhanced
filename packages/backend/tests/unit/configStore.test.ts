import { describe, it, expect, beforeAll } from 'vitest';
import * as sqliteCache from '../../src/utils/sqliteCache';
import { listConfigs, getConfig, saveConfig, deleteConfig } from '../../src/utils/configStore';

// Use an in-memory DB (idempotent init: first call wins, configStore reuses it).
beforeAll(() => { sqliteCache.init(':memory:'); });

describe('configStore', () => {
  it('saves, lists, and retrieves a config', () => {
    const meta = saveConfig('My Xtream', { provider: 'xtream', xtreamUrl: 'http://x', selectedCategories: ['News'] });
    expect(meta.id).toMatch(/^[a-f0-9]+$/);
    expect(meta.name).toBe('My Xtream');
    expect(meta.provider).toBe('xtream');

    const list = listConfigs();
    expect(list.find(c => c.id === meta.id)).toBeTruthy();

    const cfg = getConfig(meta.id);
    expect(cfg).toMatchObject({ provider: 'xtream', xtreamUrl: 'http://x', selectedCategories: ['News'] });
  });

  it('updates in place when the same id is passed', () => {
    const a = saveConfig('First', { provider: 'm3u', m3uUrl: 'http://a' });
    const b = saveConfig('Renamed', { provider: 'm3u', m3uUrl: 'http://b' }, a.id);
    expect(b.id).toBe(a.id);
    expect(listConfigs().filter(c => c.id === a.id)).toHaveLength(1);
    expect(getConfig(a.id)).toMatchObject({ m3uUrl: 'http://b' });
    expect(listConfigs().find(c => c.id === a.id)!.name).toBe('Renamed');
  });

  it('deletes a config', () => {
    const m = saveConfig('Temp', { provider: 'xtream' });
    expect(deleteConfig(m.id)).toBe(true);
    expect(getConfig(m.id)).toBeNull();
    expect(listConfigs().find(c => c.id === m.id)).toBeUndefined();
  });

  it('falls back to a default name', () => {
    const m = saveConfig('   ', { provider: 'xtream' });
    expect(m.name).toBe('Untitled');
  });
});
