import { describe, it, expect, vi } from 'vitest';

// Mock all side-effectful dependencies before importing M3UEPGAddon.
// CACHE_ENABLED=false prevents the module-level sqliteCache.init() call.
vi.mock('../../src/config/env', () => ({
  default: {
    DEBUG: false,
    CACHE_ENABLED: false,
    CACHE_TTL_MS: 21600000,
    MAX_CACHE_ENTRIES: 300,
    IPTV_ORG_CACHE_TTL_MS: 21600000,
    M3U_CACHE_TTL_MS: 21600000,
    DATA_MEMORY_TTL_MS: 300000,
    UPDATE_INTERVAL_MS: 14400000,
    SQLITE_PATH: null,
  },
  repoRoot: '/tmp',
}));

vi.mock('../../src/utils/sqliteCache', () => ({
  init: vi.fn(),
  get: vi.fn(() => null),
  set: vi.fn(),
  setRaw: vi.fn(),
  getRaw: vi.fn(() => null),
  del: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../../src/providers/xtreamProvider', () => ({
  fetchData: vi.fn(),
  fetchSeriesEpisodes: vi.fn(async () => ({ episodes: [], info: null })),
  fetchVodInfo: vi.fn(async () => null),
}));
vi.mock('../../src/providers/iptvOrgProvider', () => ({ fetchData: vi.fn() }));
vi.mock('../../src/providers/m3uProvider', () => ({ fetchData: vi.fn() }));
vi.mock('../../src/providers/stalkerProvider', () => ({
  fetchData: vi.fn(),
  buildChannels: vi.fn(),
  getCategories: vi.fn(),
  resolveLink: vi.fn(async (_creds: any, _cmd: any, type: string = 'itv') =>
    type === 'vod' ? 'http://portal/movie/film.mkv?play_token=abc' : 'http://portal/live.ts'),
  getSeriesSeasons: vi.fn(async () => [
    { season: 1, episodes: [1, 2], cmd: 'S1CMD' },
    { season: 2, episodes: [1], cmd: 'S2CMD' },
  ]),
  resolveSeriesEpisode: vi.fn(async (_creds: any, cmd: string, ep: number) =>
    `http://portal/series/${cmd}_${ep}.mp4?play_token=xyz`),
}));

vi.mock('../../src/parsers/epgParser', () => ({
  parseEPG: vi.fn(),
  getCurrentProgram: vi.fn(),
  getUpcomingPrograms: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  makeLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createCacheKey, M3UEPGAddon } from '../../src/addon/M3UEPGAddon';

// ─── createCacheKey ──────────────────────────────────────────────────────────

describe('createCacheKey', () => {
  it('produces the same key for configs with different key order', () => {
    const key1 = createCacheKey({
      provider: 'xtream',
      xtreamUrl: 'http://a.com',
      xtreamUsername: 'user',
      enableEpg: false,
      reformatLogos: false,
    });
    const key2 = createCacheKey({
      xtreamUsername: 'user',
      provider: 'xtream',
      enableEpg: false,
      xtreamUrl: 'http://a.com',
      reformatLogos: false,
    });
    expect(key1).toBe(key2);
  });

  it('produces different keys for different providers', () => {
    const key1 = createCacheKey({ provider: 'xtream', xtreamUrl: 'http://a.com' });
    const key2 = createCacheKey({ provider: 'm3u', m3uUrl: 'http://a.com' });
    expect(key1).not.toBe(key2);
  });

  it('strips non-essential fields (e.g., instanceId)', () => {
    const key1 = createCacheKey({
      provider: 'iptv-org',
      iptvOrgCountry: 'US',
      iptvOrgCategory: 'sports',
    });
    // instanceId is not part of the canonical minimal config for iptv-org
    const key2 = createCacheKey({
      provider: 'iptv-org',
      iptvOrgCountry: 'US',
      iptvOrgCategory: 'sports',
      instanceId: 'some-unique-id',
    });
    expect(key1).toBe(key2);
  });
});

// ─── generateMetaPreview ─────────────────────────────────────────────────────

describe('generateMetaPreview', () => {
  it('maps channel to Stremio meta preview shape', () => {
    const addon = new M3UEPGAddon({ provider: 'xtream', reformatLogos: false });
    const item = {
      id: 'xc_123',
      name: 'Test Channel',
      logo: 'http://logo.example.com/test.png',
      category: 'Sports',
    };
    const meta = addon.generateMetaPreview(item);
    expect(meta.id).toBe('xc_123');
    expect(meta.type).toBe('tv');
    expect(meta.name).toBe('Test Channel');
    expect(meta).toHaveProperty('poster');
  });

  it('includes id, type=tv, name, poster', () => {
    const addon = new M3UEPGAddon({ provider: 'xtream', reformatLogos: false });
    const item = { id: 'xc_456', name: 'Movie Channel', logo: '', category: 'Movies' };
    const meta = addon.generateMetaPreview(item);
    expect(meta).toMatchObject({ id: 'xc_456', type: 'tv', name: 'Movie Channel' });
    expect(typeof meta.poster).toBe('string');
    expect(meta.poster.length).toBeGreaterThan(0);
  });
});

// ─── deriveFallbackLogoUrl ───────────────────────────────────────────────────

describe('deriveFallbackLogoUrl', () => {
  it('returns original URL for standard image', () => {
    const addon = new M3UEPGAddon({ provider: 'xtream', reformatLogos: false });
    const item = { name: 'Test', logo: 'http://example.com/logo.png' };
    expect(addon.deriveFallbackLogoUrl(item)).toBe('http://example.com/logo.png');
  });

  it('proxies imgur URLs through wsrv.nl when reformatLogos=true', () => {
    // For xtream provider, reformatLogos is not forced to true by the constructor
    const addon = new M3UEPGAddon({ provider: 'xtream' });
    addon.config.reformatLogos = true;
    const item = { name: 'Test', logo: 'https://i.imgur.com/abc123.png' };
    const url = addon.deriveFallbackLogoUrl(item);
    expect(url).toContain('wsrv.nl');
  });
});

// ─── parseId ─────────────────────────────────────────────────────────────────

describe('parseId', () => {
  function addon() {
    const a = new M3UEPGAddon({ provider: 'xtream' });
    a.idPrefix = 'pfx';
    return a;
  }
  it('parses live, movie, series and episode ids', () => {
    const a = addon();
    expect(a.parseId('xcpfx_123')).toEqual({ kind: 'tv', value: '123' });
    expect(a.parseId('xcpfx_v_55')).toEqual({ kind: 'movie', value: '55' });
    expect(a.parseId('xcpfx_s_9')).toEqual({ kind: 'series', value: '9' });
    expect(a.parseId('xcpfx_e_4242_mkv')).toEqual({ kind: 'episode', value: '4242', ext: 'mkv' });
  });
  it('returns null for foreign ids', () => {
    expect(addon().parseId('m3other_abc')).toBeNull();
  });
});

// ─── resolveCatalog / itemsForCatalog ────────────────────────────────────────

describe('resolveCatalog & itemsForCatalog', () => {
  function addonWith(config: any) {
    const a = new M3UEPGAddon({ provider: 'xtream', ...config });
    a.channels = [
      { id: 'a', category: 'News', mediaType: 'tv' },
      { id: 'b', category: 'Action', mediaType: 'movie' },
      { id: 'c', category: 'Drama', mediaType: 'series' },
      { id: 'd', category: 'News', mediaType: 'tv' },
    ];
    return a;
  }

  it('single mode routes each type to its own catalog', () => {
    const a = addonWith({
      catalogMode: 'single',
      selectedCategories: ['News', 'Action', 'Drama'],
      categoryTypes: { News: 'tv', Action: 'movie', Drama: 'series' },
    });
    expect(a.itemsForCatalog('iptv_channels').map((i: any) => i.id)).toEqual(['a', 'd']);
    expect(a.itemsForCatalog('iptv_movies').map((i: any) => i.id)).toEqual(['b']);
    expect(a.itemsForCatalog('iptv_series').map((i: any) => i.id)).toEqual(['c']);
  });

  it('split mode filters by the catalog category and its type', () => {
    const a = addonWith({
      catalogMode: 'split',
      selectedCategories: ['Action'],
      categoryTypes: { Action: 'movie' },
    });
    const spec = a.resolveCatalog('iptv_cat_0');
    expect(spec).toEqual({ cats: new Set(['Action']), type: 'movie' });
    expect(a.itemsForCatalog('iptv_cat_0').map((i: any) => i.id)).toEqual(['b']);
  });

  it('returns empty for unknown catalog ids', () => {
    expect(addonWith({ catalogMode: 'single' }).itemsForCatalog('nope')).toEqual([]);
  });
});

// ─── multi-source ────────────────────────────────────────────────────────────

describe('multi-source', () => {
  function multiAddon() {
    const a = new M3UEPGAddon({
      sources: [{ id: 's1', name: 'A', provider: 'xtream' }, { id: 's2', name: 'B', provider: 'xtream' }],
      catalogMode: 'single',
      selectedCategories: ['Films'],
      categoryTypes: { Films: 'movie' },
    } as any);
    a.idPrefix = 'pfx';
    a.channels = [
      { id: 'xcpfx_mv_aaa', name: 'X', mediaType: 'movie', category: 'Films', source: { id: 's1', name: 'A' }, url: 'u1' },
      { id: 'xcpfx_mv_aaa', name: 'X', mediaType: 'movie', category: 'Films', source: { id: 's2', name: 'B' }, url: 'u2' },
    ];
    return a;
  }

  it('isMulti reflects the sources list', () => {
    expect(multiAddon().isMulti()).toBe(true);
    expect(new M3UEPGAddon({ provider: 'xtream' }).isMulti()).toBe(false);
  });

  it('parseMultiId decodes movie/series/tv/episode ids', () => {
    const a = multiAddon();
    expect(a.parseMultiId('xcpfx_mv_aaa')).toEqual({ kind: 'movie', hash: 'aaa' });
    expect(a.parseMultiId('xcpfx_sr_bbb')).toEqual({ kind: 'series', hash: 'bbb' });
    expect(a.parseMultiId('xcpfx_tvx_s1_deadbeef')).toEqual({ kind: 'tv' });
    expect(a.parseMultiId('xcpfx_ep_abc123_2_5')).toEqual({ kind: 'episode', hash: 'abc123', season: 2, episode: 5 });
  });

  it('itemsForCatalog de-duplicates movies sharing a logical id', () => {
    const items = multiAddon().itemsForCatalog('iptv_movies');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('xcpfx_mv_aaa');
  });

  it('getStreams returns one stream per source (choose) or only the first (auto)', async () => {
    const choose = multiAddon();
    const all = await choose.getStreams('xcpfx_mv_aaa');
    expect(all.map((s: any) => s.title)).toEqual(['A', 'B']);

    const auto = multiAddon();
    auto.config.streamSelection = 'auto';
    const one = await auto.getStreams('xcpfx_mv_aaa');
    expect(one).toHaveLength(1);
    expect(one[0].url).toBe('u1');
  });
});

// ─── Stalker VOD (movies) ────────────────────────────────────────────────────

describe('stalker VOD', () => {
  function monoStalkerMovie() {
    const a = new M3UEPGAddon({
      provider: 'stalker', stalkerUrl: 'http://portal', stalkerMac: '00:1A:79:00:00:01',
      catalogMode: 'single', selectedCategories: ['Films'], categoryTypes: { Films: 'movie' },
    } as any);
    a.idPrefix = 'pfx';
    a.channels = [{
      id: 'xcpfx_v_1452533', name: 'Bob (2025)', type: 'movie', mediaType: 'movie',
      stalkerVodCmd: 'BASE64CMD', plot: 'Un synopsis.', tmdbId: '1169789', category: 'Films',
    }];
    a.channelMap = new Map(a.channels.map((c: any) => [c.id, c]));
    return a;
  }

  it('routes a mono Stalker movie to create_link (type=vod)', async () => {
    const streams = await monoStalkerMovie().getStreams('xcpfx_v_1452533');
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe('http://portal/movie/film.mkv?play_token=abc');
  });

  it('builds movie meta from the Stalker item (plot, no extra fetch)', async () => {
    const meta = await monoStalkerMovie().buildMovieMeta(monoStalkerMovie().channels[0]);
    expect(meta.type).toBe('movie');
    expect(meta.description).toBe('Un synopsis.');
  });

  it('resolves multi-source Stalker movie streams via create_link', async () => {
    const a = new M3UEPGAddon({
      sources: [{ id: 's1', name: 'Portail', provider: 'stalker', stalkerUrl: 'http://portal', stalkerMac: '00:1A:79:00:00:01' }],
      catalogMode: 'single', selectedCategories: ['Films'], categoryTypes: { Films: 'movie' },
      streamSelection: 'choose',
    } as any);
    a.idPrefix = 'pfx';
    a.channels = [{
      id: 'xcpfx_mv_aaa', name: 'Bob (2025)', mediaType: 'movie', category: 'Films',
      source: { id: 's1', name: 'Portail' }, stalkerVodCmd: 'BASE64CMD',
    }];
    a.channelMap = new Map(a.channels.map((c: any) => [c.id, c]));
    const streams = await a.getStreams('xcpfx_mv_aaa');
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe('http://portal/movie/film.mkv?play_token=abc');
    expect(streams[0].title).toBe('Portail');
  });
});

// ─── Stalker series ──────────────────────────────────────────────────────────

describe('stalker series', () => {
  function monoStalkerSeries() {
    const a = new M3UEPGAddon({
      provider: 'stalker', stalkerUrl: 'http://portal', stalkerMac: '00:1A:79:00:00:01',
      catalogMode: 'single', selectedCategories: ['Séries'], categoryTypes: { 'Séries': 'series' },
    } as any);
    a.idPrefix = 'pfx';
    a.channels = [{
      id: 'xcpfx_s_14649', name: 'Fauda', type: 'series', mediaType: 'series',
      stalkerSeriesId: '14649', plot: 'Synopsis.', tmdbId: '69557', category: 'Séries',
    }];
    a.channelMap = new Map(a.channels.map((c: any) => [c.id, c]));
    return a;
  }

  it('builds series meta with seasons/episodes as videos', async () => {
    const meta: any = await monoStalkerSeries().getDetailedMeta('xcpfx_s_14649');
    expect(meta.type).toBe('series');
    expect(meta.videos).toHaveLength(3); // 2 + 1
    expect(meta.videos[0]).toMatchObject({ id: 'xcpfx_se_14649_1_1', season: 1, episode: 1 });
    expect(meta.videos[2]).toMatchObject({ id: 'xcpfx_se_14649_2_1', season: 2, episode: 1 });
  });

  it('resolves a Stalker episode stream via the season cmd', async () => {
    const streams = await monoStalkerSeries().getStreams('xcpfx_se_14649_2_1');
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe('http://portal/series/S2CMD_1.mp4?play_token=xyz');
  });
});

// ─── generateMetaPreview (typed) ─────────────────────────────────────────────

describe('generateMetaPreview typed', () => {
  it('uses movie/series type and poster shape', () => {
    const a = new M3UEPGAddon({ provider: 'xtream', reformatLogos: false });
    const movie = a.generateMetaPreview({ id: 'm', name: 'Film', mediaType: 'movie', category: 'Action', logo: 'http://x/p.jpg' });
    expect(movie.type).toBe('movie');
    expect(movie.posterShape).toBe('poster');
    const series = a.generateMetaPreview({ id: 's', name: 'Show', mediaType: 'series', category: 'Drama', logo: 'http://x/c.jpg' });
    expect(series.type).toBe('series');
  });
});

// ─── Background Update Timer ──────────────────────────────────────────────────

describe('_startUpdateTimer', () => {
  it('is idempotent — calling twice does not create two timers', () => {
    vi.useFakeTimers();
    const addon = new M3UEPGAddon({ provider: 'm3u' });
    (addon as any)._startUpdateTimer();
    const first = (addon as any)._updateTimer;
    (addon as any)._startUpdateTimer();
    const second = (addon as any)._updateTimer;
    expect(first).toBe(second);
    vi.useRealTimers();
  });

  it('sets _updateTimer to a non-null value', () => {
    vi.useFakeTimers();
    const addon = new M3UEPGAddon({ provider: 'm3u' });
    expect((addon as any)._updateTimer).toBeNull();
    (addon as any)._startUpdateTimer();
    expect((addon as any)._updateTimer).not.toBeNull();
    vi.useRealTimers();
  });
});

describe('_evictFromMemory timer cleanup', () => {
  it('sets _updateTimer to null after eviction', () => {
    vi.useFakeTimers();
    const addon = new M3UEPGAddon({ provider: 'm3u' });
    (addon as any)._startUpdateTimer();
    expect((addon as any)._updateTimer).not.toBeNull();
    addon._evictFromMemory();
    expect((addon as any)._updateTimer).toBeNull();
    vi.useRealTimers();
  });

  it('does not trigger updateData after eviction (ghost-config prevention)', async () => {
    vi.useFakeTimers();
    const addon = new M3UEPGAddon({ provider: 'm3u' });
    const spy = vi.spyOn(addon, 'updateData').mockResolvedValue(undefined);
    (addon as any)._startUpdateTimer();
    addon._evictFromMemory();
    // Advance well past update interval — should NOT trigger updateData
    vi.advanceTimersByTime(14400000 * 3);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
