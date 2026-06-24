import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted to the top of the file, so variables referenced in the
// factory must be initialised with vi.hoisted() to avoid TDZ errors.
const mockEnv = vi.hoisted(() => ({
  ADDON_NAME: 'TestAddon',
  ADDON_DESCRIPTION: 'Test description',
  ADDON_LOGO_URL: 'https://example.com/logo.png',
  ADDON_BACKGROUND_URL: 'https://example.com/bg.png',
}));
vi.mock('../../src/config/env', () => ({ default: mockEnv, repoRoot: '/tmp' }));

import { createManifest } from '../../src/addon/manifest';

describe('createManifest', () => {
  it('returns required Stremio manifest fields (id, name, version, resources, types)', () => {
    const m = createManifest();
    expect(m).toHaveProperty('id');
    expect(m).toHaveProperty('name');
    expect(m).toHaveProperty('version');
    expect(m.resources).toContain('catalog');
    expect(m.resources).toContain('stream');
    expect(m.resources).toContain('meta');
    expect(m.types).toContain('tv');
  });

  it('without idPrefix uses bare channel ID prefixes', () => {
    const m = createManifest();
    expect(m.idPrefixes).toEqual(expect.arrayContaining(['xc', 'io', 'm3']));
  });

  it('with idPrefix appends prefix to all three channel prefixes', () => {
    const m = createManifest('abc123');
    expect(m.idPrefixes).toContain('xcabc123_');
    expect(m.idPrefixes).toContain('ioabc123_');
    expect(m.idPrefixes).toContain('m3abc123_');
  });

  it('includes logo/background from env when set', () => {
    const m = createManifest();
    expect((m as any).logo).toBe('https://example.com/logo.png');
    expect((m as any).background).toBe('https://example.com/bg.png');
  });

  it('omits logo/background when env vars are empty', () => {
    const savedLogo = mockEnv.ADDON_LOGO_URL;
    const savedBg = mockEnv.ADDON_BACKGROUND_URL;
    mockEnv.ADDON_LOGO_URL = '';
    mockEnv.ADDON_BACKGROUND_URL = '';
    const m = createManifest();
    expect(m).not.toHaveProperty('logo');
    expect(m).not.toHaveProperty('background');
    mockEnv.ADDON_LOGO_URL = savedLogo;
    mockEnv.ADDON_BACKGROUND_URL = savedBg;
  });

  it('catalogs array has at least one entry', () => {
    const m = createManifest();
    expect(m.catalogs.length).toBeGreaterThan(0);
  });

  it('single mode (default) produces one combined catalog', () => {
    const m = createManifest('abc123', { catalogMode: 'single' });
    expect(m.catalogs).toHaveLength(1);
    expect(m.catalogs[0].id).toBe('iptv_channels');
  });

  it('single mode with selected categories exposes them as genre options', () => {
    const m = createManifest('abc123', {
      catalogMode: 'single',
      selectedCategories: ['Sports', 'News'],
    });
    expect(m.catalogs).toHaveLength(1);
    const genreExtra = (m.catalogs[0] as any).extra.find((e: any) => e.name === 'genre');
    expect(genreExtra.options).toEqual(expect.arrayContaining(['All Channels', 'Sports', 'News']));
  });

  it('split mode produces one catalog per selected category', () => {
    const m = createManifest('abc123', {
      catalogMode: 'split',
      selectedCategories: ['Sports', 'News', 'Movies'],
    });
    expect(m.catalogs).toHaveLength(3);
    expect(m.catalogs.map((c: any) => c.id)).toEqual(['iptv_cat_0', 'iptv_cat_1', 'iptv_cat_2']);
    expect(m.catalogs.map((c: any) => c.name)).toEqual(['Sports', 'News', 'Movies']);
  });

  it('split mode with no categories falls back to a single catalog', () => {
    const m = createManifest('abc123', { catalogMode: 'split', selectedCategories: [] });
    expect(m.catalogs).toHaveLength(1);
    expect(m.catalogs[0].id).toBe('iptv_channels');
  });

  it('split mode prefixes catalog names with the catalog name when set', () => {
    const m = createManifest('abc123', {
      catalogName: 'MyTV',
      catalogMode: 'split',
      selectedCategories: ['Sports'],
    });
    expect(m.catalogs[0].name).toBe('MyTV · Sports');
  });

  it('custom mode produces one catalog per group with stable ids', () => {
    const m = createManifest('abc123', {
      catalogMode: 'custom',
      catalogGroups: [
        { name: 'Entertainment', categories: ['Movies', 'Series'] },
        { name: 'Football', categories: ['Sports'] },
      ],
    });
    expect(m.catalogs).toHaveLength(2);
    expect(m.catalogs.map((c: any) => c.id)).toEqual(['iptv_grp_0', 'iptv_grp_1']);
    expect(m.catalogs.map((c: any) => c.name)).toEqual(['Entertainment', 'Football']);
  });

  it('custom mode exposes a genre filter only for multi-category groups', () => {
    const m = createManifest('abc123', {
      catalogMode: 'custom',
      catalogGroups: [
        { name: 'Entertainment', categories: ['Movies', 'Series'] },
        { name: 'Football', categories: ['Sports'] },
      ],
    });
    const multi = (m.catalogs[0] as any).extra.find((e: any) => e.name === 'genre');
    expect(multi.options).toEqual(['All Channels', 'Movies', 'Series']);
    const single = (m.catalogs[1] as any).extra.find((e: any) => e.name === 'genre');
    expect(single).toBeUndefined();
  });

  it('custom mode ignores groups without a name or without categories', () => {
    const m = createManifest('abc123', {
      catalogMode: 'custom',
      catalogGroups: [
        { name: '', categories: ['Movies'] },
        { name: 'Empty', categories: [] },
        { name: 'Valid', categories: ['Sports'] },
      ],
    });
    expect(m.catalogs).toHaveLength(1);
    expect(m.catalogs[0].name).toBe('Valid');
  });

  it('custom mode with no valid group falls back to a single catalog', () => {
    const m = createManifest('abc123', { catalogMode: 'custom', catalogGroups: [] });
    expect(m.catalogs).toHaveLength(1);
    expect(m.catalogs[0].id).toBe('iptv_channels');
  });

  it('single mode splits selected categories into one catalog per media type', () => {
    const m = createManifest('abc123', {
      catalogMode: 'single',
      selectedCategories: ['News', 'Action', 'Drama'],
      categoryTypes: { News: 'tv', Action: 'movie', Drama: 'series' },
    });
    const byId = Object.fromEntries(m.catalogs.map((c: any) => [c.id, c]));
    expect(byId['iptv_channels'].type).toBe('tv');
    expect(byId['iptv_movies'].type).toBe('movie');
    expect(byId['iptv_series'].type).toBe('series');
    expect(m.types).toEqual(expect.arrayContaining(['tv', 'movie', 'series']));
  });

  it('split mode types each catalog from its category type', () => {
    const m = createManifest('abc123', {
      catalogMode: 'split',
      selectedCategories: ['News', 'Action'],
      categoryTypes: { News: 'tv', Action: 'movie' },
    });
    expect(m.catalogs.map((c: any) => c.type)).toEqual(['tv', 'movie']);
  });

  it('custom mode types each catalog from its group dominant type', () => {
    const m = createManifest('abc123', {
      catalogMode: 'custom',
      catalogGroups: [{ name: 'Cinéma', categories: ['Action', 'Comedy'] }],
      categoryTypes: { Action: 'movie', Comedy: 'movie' },
    });
    expect(m.catalogs[0].type).toBe('movie');
  });

  it('types is just [tv] when only TV categories are selected', () => {
    const m = createManifest('abc123', {
      catalogMode: 'single',
      selectedCategories: ['News'],
      categoryTypes: { News: 'tv' },
    });
    expect(m.types).toEqual(['tv']);
  });

  it('uses the enhanced addon id', () => {
    expect(createManifest().id).toBe('community.nexotv.enhanced');
  });
});
