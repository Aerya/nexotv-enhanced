import crypto from 'crypto';
import LRUCache from '../utils/lruCache';
import * as sqliteCache from '../utils/sqliteCache';
import { makeLogger } from '../utils/logger';
import { parseEPG, getCurrentProgram, getUpcomingPrograms } from '../parsers/epgParser';
import env from '../config/env';
import * as xtreamProvider from '../providers/xtreamProvider';
import * as iptvOrgProvider from '../providers/iptvOrgProvider';
import * as m3uProvider from '../providers/m3uProvider';
import * as multiSourceProvider from '../providers/multiSourceProvider';
import * as stalkerProvider from '../providers/stalkerProvider';
import * as tmdb from '../utils/tmdb';
import { titleHash, normalizeTitle } from './dedup';

const CACHE_ENABLED = env.CACHE_ENABLED;
const CACHE_TTL_MS = env.CACHE_TTL_MS;
const MAX_CACHE_ENTRIES = env.MAX_CACHE_ENTRIES;

if (CACHE_ENABLED) {
    sqliteCache.init(env.SQLITE_PATH);
}

export const buildPromiseCache = new LRUCache({ max: MAX_CACHE_ENTRIES, ttl: CACHE_TTL_MS });

const PROVIDER_MAP: Record<string, { fetchData: (addon: any) => Promise<void> }> = {
    'xtream': xtreamProvider,
    'iptv-org': iptvOrgProvider,
    'm3u': m3uProvider,
    'stalker': stalkerProvider,
    'multi': multiSourceProvider,
};

export interface AddonConfig {
    provider?: string;
    xtreamUrl?: string;
    xtreamUsername?: string;
    xtreamPassword?: string;
    m3uUrl?: string;
    stalkerUrl?: string;
    stalkerMac?: string;
    epgUrl?: string;
    enableEpg?: boolean;
    epgOffsetHours?: number | string;
    reformatLogos?: boolean;
    iptvOrgCountry?: string;
    iptvOrgCategory?: string;
    instanceId?: string;
    catalogName?: string;
    globalUserAgent?: string;
    /** Categories the user picked on the config page. Empty/undefined = all. */
    selectedCategories?: string[];
    /**
     * 'single' = one combined catalog, 'split' = one catalog per category,
     * 'custom' = one catalog per user-defined group (see catalogGroups).
     */
    catalogMode?: 'single' | 'split' | 'custom';
    /** User-defined catalogs, each grouping one or more categories. */
    catalogGroups?: Array<{ name: string; categories: string[] }>;
    /** Category name → media type ('tv' | 'movie' | 'series'). Drives VOD/series. */
    categoryTypes?: Record<string, 'tv' | 'movie' | 'series'>;
    /** TMDB API key (entered in the webui) to enrich movie/series metadata. */
    tmdbApiKey?: string;
    /** TMDB language for enriched metadata (e.g. 'fr-FR'). */
    tmdbLanguage?: string;
    /** Multiple IPTV sources mixed into one set of catalogs. */
    sources?: SourceConfig[];
    /**
     * Playback behaviour for de-duplicated items:
     * 'choose' = expose one stream per source (Stremio lets the user pick),
     * 'auto'   = only the first (highest-priority) source's stream.
     */
    streamSelection?: 'auto' | 'choose';
}

/** One IPTV source within a multi-source configuration. */
export interface SourceConfig {
    id: string;
    name: string;
    provider: 'xtream' | 'm3u' | 'stalker';
    xtreamUrl?: string;
    xtreamUsername?: string;
    xtreamPassword?: string;
    m3uUrl?: string;
    stalkerUrl?: string;
    stalkerMac?: string;
    globalUserAgent?: string;
    enableEpg?: boolean;
    epgUrl?: string;
    selectedCategories?: string[];
    categoryTypes?: Record<string, 'tv' | 'movie' | 'series'>;
}

export type MediaType = 'tv' | 'movie' | 'series';

/** Read a channel's category, regardless of provider shape. */
function channelCategory(item: any): string | undefined {
    return item?.category || item?.attributes?.['group-title'];
}

/** Media type of an item (live channels have none → 'tv'). */
function mediaTypeOf(item: any): MediaType {
    return (item?.mediaType as MediaType) || 'tv';
}

function stableStringify(obj: any) {
    return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Normalize the catalog selection into a stable, comparable form for the cache key. */
function normalizeSelection(config: AddonConfig) {
    const cats = (config.selectedCategories || [])
        .map(c => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean);
    const mode = config.catalogMode === 'split' ? 'split'
        : config.catalogMode === 'custom' ? 'custom'
            : 'single';
    // Group order is meaningful (it maps to catalog ids) so it is preserved;
    // only the inner categories are de-duped + sorted.
    const groups = (config.catalogGroups || [])
        .map(g => ({
            name: (g?.name || '').trim(),
            categories: [...new Set((g?.categories || [])
                .map(c => (typeof c === 'string' ? c.trim() : ''))
                .filter(Boolean))].sort(),
        }))
        .filter(g => g.name && g.categories.length > 0);
    // Keep only the types of categories actually in play, sorted for stability.
    const inPlay = new Set<string>([...cats, ...groups.flatMap(g => g.categories)]);
    const types: Record<string, string> = {};
    const srcTypes = config.categoryTypes || {};
    for (const name of [...inPlay].sort()) {
        if (srcTypes[name]) types[name] = srcTypes[name];
    }
    return {
        catalogMode: mode,
        selectedCategories: [...new Set(cats)].sort(),
        catalogGroups: groups,
        categoryTypes: types,
    };
}

export function createCacheKey(config: AddonConfig) {
    // Multi-source configs key on the (credential-identifying) source list +
    // the merged catalog layout + playback mode.
    if (config.sources && config.sources.length) {
        const minimal = {
            mode: 'multi',
            streamSelection: config.streamSelection === 'auto' ? 'auto' : 'choose',
            sources: config.sources.map(s => ({
                provider: s.provider,
                name: (s.name || '').trim(),
                xtreamUrl: s.xtreamUrl || null,
                xtreamUsername: s.xtreamUsername || null,
                m3uUrl: s.m3uUrl || null,
                stalkerUrl: s.stalkerUrl || null,
                stalkerMac: s.stalkerMac || null,
                enableEpg: !!s.enableEpg,
                epgUrl: s.epgUrl || null,
                selectedCategories: [...new Set((s.selectedCategories || [])
                    .map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean))].sort(),
            })),
            ...normalizeSelection(config),
        };
        return crypto.createHash('md5').update(stableStringify(minimal)).digest('hex');
    }

    const provider = config.provider || 'xtream';
    let minimal: any;
    if (provider === 'stalker') {
        minimal = {
            provider,
            stalkerUrl: config.stalkerUrl || null,
            stalkerMac: config.stalkerMac || null,
            ...normalizeSelection(config),
        };
    } else if (provider === 'iptv-org') {
        minimal = {
            provider,
            iptvOrgCountry: config.iptvOrgCountry || null,
            iptvOrgCategory: config.iptvOrgCategory || null,
        };
    } else if (provider === 'm3u') {
        minimal = {
            provider,
            m3uUrl: config.m3uUrl || null,
            enableEpg: !!config.enableEpg,
            epgUrl: config.epgUrl || null,
            epgOffsetHours: config.epgOffsetHours,
            reformatLogos: !!config.reformatLogos,
            globalUserAgent: config.globalUserAgent || null,
            ...normalizeSelection(config),
        };
    } else {
        minimal = {
            provider: 'xtream',
            epgUrl: config.epgUrl,
            enableEpg: !!config.enableEpg,
            xtreamUrl: config.xtreamUrl,
            xtreamUsername: config.xtreamUsername,
            epgOffsetHours: config.epgOffsetHours,
            reformatLogos: !!config.reformatLogos,
            ...normalizeSelection(config),
        };
    }
    return crypto.createHash('md5').update(stableStringify(minimal)).digest('hex');
}

export class M3UEPGAddon {
    providerName: string;
    config: AddonConfig;
    manifestRef: any;
    cacheKey: string;
    idPrefix: string;
    updateInterval: number;
    channels: any[];
    channelMap: Map<string, any>;
    epgData: Record<string, any[]>;
    lastUpdate: number;
    m3uEtag: string | null;
    m3uLastModified: string | null;
    iptvOrgEtag: string | null;
    xtreamEtag: string | null;
    lastEpgUpdate: number | null;
    _evictTimer: any;
    private _updateTimer: ReturnType<typeof setInterval> | null;
    _loadPromise: any;
    firstCatalogRefreshDone: boolean;
    firstCatalogRefreshPromise: any;
    private _consecutiveRefreshFailures = 0;
    private _refreshFailedAt: number | null = null;
    private _timerConsecutiveFailures = 0;
    private _timerPausedUntil: number | null = null;
    cacheTtl: number;
    log: ReturnType<typeof makeLogger>;

    constructor(config: AddonConfig = {}, manifestRef?: any) {
        this.providerName = (config.sources && config.sources.length) ? 'multi' : (config.provider || 'xtream');
        this.config = config;
        this.manifestRef = manifestRef;
        this.cacheKey = createCacheKey(config);
        this.idPrefix = this.cacheKey.slice(0, 8);
        this.updateInterval = env.UPDATE_INTERVAL_MS;
        this.channels = [];
        this.channelMap = new Map();
        this.epgData = {};
        this.lastUpdate = 0;
        this.m3uEtag = null;
        this.m3uLastModified = null;
        this.iptvOrgEtag = null;
        this.xtreamEtag = null;
        this.lastEpgUpdate = null;
        this._evictTimer = null;
        this._updateTimer = null;
        this._loadPromise = null;
        this.firstCatalogRefreshDone = false;
        this.firstCatalogRefreshPromise = null;
        const TTL_MAP: Record<string, number> = {
            'iptv-org': env.IPTV_ORG_CACHE_TTL_MS,
            'm3u': env.M3U_CACHE_TTL_MS,
        };
        this.cacheTtl = TTL_MAP[this.providerName] ?? CACHE_TTL_MS;
        this.log = makeLogger();

        if (typeof this.config.epgOffsetHours === 'string') {
            const n = parseFloat(this.config.epgOffsetHours);
            if (!isNaN(n)) this.config.epgOffsetHours = n;
        }
        if (typeof this.config.epgOffsetHours !== 'number' || !isFinite(this.config.epgOffsetHours as number))
            this.config.epgOffsetHours = 0;
        if (Math.abs(this.config.epgOffsetHours as number) > 48)
            this.config.epgOffsetHours = 0;

        if (this.providerName === 'iptv-org' || this.providerName === 'm3u') {
            this.config.reformatLogos = true;
        }

        this.log.debug('Addon instance created', {
            provider: this.providerName,
            cacheKey: this.cacheKey,
            epgOffsetHours: this.config.epgOffsetHours
        });
    }

    async saveChannelsToCache() {
        if (!CACHE_ENABLED) return;
        sqliteCache.setRaw('addon:channels:' + this.cacheKey, {
            channels: this.channels,
            lastUpdate: this.lastUpdate,
            m3uEtag: this.m3uEtag ?? null,
            m3uLastModified: this.m3uLastModified ?? null,
            iptvOrgEtag: this.iptvOrgEtag ?? null,
            xtreamEtag: this.xtreamEtag ?? null,
            lastEpgUpdate: this.lastEpgUpdate ?? null,
        }, this.cacheTtl);
        this.log.debug('Channels saved to cache', { count: this.channels.length });
    }

    async loadChannelsFromCache() {
        if (!CACHE_ENABLED) return;
        const cached = sqliteCache.getRaw('addon:channels:' + this.cacheKey);
        if (cached) {
            this.channels = cached.channels || [];
            this.channelMap = new Map(this.channels.map(c => [c.id, c]));
            this.lastUpdate = cached.lastUpdate || 0;
            this.m3uEtag = cached.m3uEtag ?? null;
            this.m3uLastModified = cached.m3uLastModified ?? null;
            this.iptvOrgEtag = cached.iptvOrgEtag ?? null;
            this.xtreamEtag = cached.xtreamEtag ?? null;
            this.lastEpgUpdate = cached.lastEpgUpdate ?? null;
            this.log.debug('Channels loaded from cache', { count: this.channels.length });
        }
    }

    async saveEpgToCache() {
        if (!CACHE_ENABLED) return;
        if (!this.epgData || Object.keys(this.epgData).length === 0) return;
        sqliteCache.set('addon:epg:' + this.cacheKey, { epgData: this.epgData }, this.cacheTtl);
        this.log.debug('EPG saved to cache', { channels: Object.keys(this.epgData).length });
    }

    async loadEpgFromCache() {
        if (!CACHE_ENABLED) return;
        const cached = sqliteCache.get('addon:epg:' + this.cacheKey);
        if (cached) {
            this.epgData = cached.epgData || {};
            this.log.debug('EPG loaded from cache', { channels: Object.keys(this.epgData).length });
        }
    }

    async ensureEpgLoaded() {
        if (this.epgData && Object.keys(this.epgData).length > 0) return;
        if (!CACHE_ENABLED) return;
        await this.loadEpgFromCache();
    }

    /** Selected category names (trimmed, de-duped). Empty array = all categories. */
    selectedCategorySet(): Set<string> {
        return new Set(
            (this.config.selectedCategories || [])
                .map(c => (typeof c === 'string' ? c.trim() : ''))
                .filter(Boolean)
        );
    }

    /** Media type configured for a category name (default 'tv'). */
    categoryType(name: string): MediaType {
        return (this.config.categoryTypes?.[name?.trim()] as MediaType) || 'tv';
    }

    /** Dominant media type among a list of category names. */
    private groupType(categories: string[]): MediaType {
        const tally: Record<MediaType, number> = { tv: 0, movie: 0, series: 0 };
        for (const c of categories) tally[this.categoryType(c)]++;
        if (tally.series >= tally.movie && tally.series > tally.tv) return 'series';
        if (tally.movie >= tally.series && tally.movie > tally.tv) return 'movie';
        return 'tv';
    }

    /**
     * Resolve a catalog id to the media type + category set it should contain.
     * Returns null when the id is not one of ours.
     *   single : iptv_channels (tv) / iptv_movies (movie) / iptv_series (series)
     *   split  : iptv_cat_<n>  → Nth selected category (type from categoryTypes)
     *   custom : iptv_grp_<n>  → Nth group (dominant type)
     */
    resolveCatalog(id: string): { cats: Set<string> | null; type: MediaType } | null {
        const mode = this.config.catalogMode;
        const selected = (this.config.selectedCategories || [])
            .map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);

        if (mode === 'split' && id.startsWith('iptv_cat_')) {
            const idx = parseInt(id.slice('iptv_cat_'.length), 10);
            const cat = Number.isInteger(idx) ? selected[idx] : undefined;
            return cat ? { cats: new Set([cat]), type: this.categoryType(cat) } : null;
        }
        if (mode === 'custom' && id.startsWith('iptv_grp_')) {
            const idx = parseInt(id.slice('iptv_grp_'.length), 10);
            const groups = (this.config.catalogGroups || [])
                .map(g => ({
                    name: (g?.name || '').trim(),
                    categories: (g?.categories || []).map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean),
                }))
                .filter(g => g.name && g.categories.length > 0);
            const group = Number.isInteger(idx) ? groups[idx] : undefined;
            return group ? { cats: new Set(group.categories), type: this.groupType(group.categories) } : null;
        }
        // single / legacy combined catalogs
        if (id === 'iptv_channels' || id === 'iptv_org') {
            const tvCats = selected.filter(c => this.categoryType(c) === 'tv');
            return { cats: tvCats.length ? new Set(tvCats) : null, type: 'tv' };
        }
        if (id === 'iptv_movies') {
            const cats = selected.filter(c => this.categoryType(c) === 'movie');
            return { cats: cats.length ? new Set(cats) : null, type: 'movie' };
        }
        if (id === 'iptv_series') {
            const cats = selected.filter(c => this.categoryType(c) === 'series');
            return { cats: cats.length ? new Set(cats) : null, type: 'series' };
        }
        return null;
    }

    /** Channels belonging to a given catalog id (type + category filtered). */
    itemsForCatalog(id: string): any[] {
        const spec = this.resolveCatalog(id);
        if (!spec) return [];
        const matched = this.channels.filter(c => {
            if (mediaTypeOf(c) !== spec.type) return false;
            if (!spec.cats) return true;
            const cat = channelCategory(c);
            return cat ? spec.cats.has(cat.trim()) : false;
        });
        // De-duplicate by logical id (movies/series from several sources share
        // one id). Single-source ids are unique so this is a no-op there.
        const seen = new Set<string>();
        const out: any[] = [];
        for (const c of matched) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            out.push(c);
        }
        return out;
    }

    /** True when this addon aggregates multiple IPTV sources. */
    isMulti(): boolean {
        return !!(this.config.sources && this.config.sources.length);
    }

    private sourceById(id: string | undefined): SourceConfig | undefined {
        if (!id) return undefined;
        return (this.config.sources || []).find(s => s.id === id);
    }

    private streamHints(item: any) {
        const h: Record<string, string> = {};
        if (item?.userAgent) h['User-Agent'] = item.userAgent;
        if (item?.referrer) h['Referer'] = item.referrer;
        return Object.keys(h).length
            ? { notWebReady: true, proxyHeaders: { request: h } }
            : { notWebReady: true };
    }

    /** Stalker portal credentials for a channel (multi: from its source). */
    private stalkerCredsFor(item: any): { url: string; mac: string } | null {
        if (item?.source?.id) {
            const s = this.sourceById(item.source.id);
            return s?.stalkerUrl && s?.stalkerMac ? { url: s.stalkerUrl, mac: s.stalkerMac } : null;
        }
        return this.config.stalkerUrl && this.config.stalkerMac
            ? { url: this.config.stalkerUrl, mac: this.config.stalkerMac }
            : null;
    }

    /** Resolve a Stalker channel's playable URL on demand (create_link). */
    private async stalkerStream(item: any) {
        const creds = this.stalkerCredsFor(item);
        if (!creds) return [];
        const url = await stalkerProvider.resolveLink(creds, item.stalkerCmd).catch(() => null);
        return url ? [{ url, title: item.source?.name || item.name, behaviorHints: { notWebReady: true } }] : [];
    }

    /** Parse a multi-source logical id. */
    parseMultiId(id: string): { kind: 'tv' | 'movie' | 'series' | 'episode'; hash?: string; season?: number; episode?: number } | null {
        const prefix = `xc${this.idPrefix}_`;
        if (!id.startsWith(prefix)) return null;
        const r = id.slice(prefix.length);
        if (r.startsWith('mv_')) return { kind: 'movie', hash: r.slice(3) };
        if (r.startsWith('sr_')) return { kind: 'series', hash: r.slice(3) };
        if (r.startsWith('tvx_')) return { kind: 'tv' };
        if (r.startsWith('ep_')) {
            const m = r.slice(3).match(/^([a-f0-9]+)_(\d+)_(\d+)$/);
            if (m) return { kind: 'episode', hash: m[1], season: +m[2], episode: +m[3] };
        }
        return null;
    }

    private async multiEpisodeStreams(hash: string, season: number, episode: number) {
        await this.ensureDataLoaded();
        const seriesId = `xc${this.idPrefix}_sr_${hash}`;
        const seriesChans = this.channels.filter(c => c.id === seriesId);
        const streams: any[] = [];
        for (const sc of seriesChans) {
            const src = this.sourceById(sc.source?.id);
            if (!src || src.provider !== 'xtream') continue;
            try {
                const { episodes } = await xtreamProvider.fetchSeriesEpisodes(src, sc.srcSeriesId);
                const ep = episodes.find((e: any) => e.season === season && e.episode === episode);
                if (ep) {
                    streams.push({
                        url: `${src.xtreamUrl}/series/${src.xtreamUsername}/${src.xtreamPassword}/${ep.id}.${ep.ext}`,
                        title: sc.source?.name || 'Source',
                        behaviorHints: { notWebReady: true },
                    });
                }
            } catch { /* skip failing source */ }
        }
        return this.config.streamSelection === 'auto' ? streams.slice(0, 1) : streams;
    }

    private async multiSeriesMeta(id: string, hash: string) {
        await this.ensureDataLoaded();
        const seriesChans = this.channels.filter(c => c.id === id);
        const first = seriesChans[0];
        const logoUrl = first ? this.deriveFallbackLogoUrl(first) : undefined;
        const merged = new Map<string, any>();
        let firstInfo: any = null;
        for (const sc of seriesChans) {
            const src = this.sourceById(sc.source?.id);
            if (!src || src.provider !== 'xtream') continue;
            try {
                const { episodes, info } = await xtreamProvider.fetchSeriesEpisodes(src, sc.srcSeriesId);
                if (!firstInfo && info) firstInfo = info;
                for (const ep of episodes) {
                    const k = `${ep.season}_${ep.episode}`;
                    if (!merged.has(k)) merged.set(k, ep);
                }
            } catch { /* skip */ }
        }
        const videos = [...merged.values()]
            .sort((a, b) => a.season - b.season || a.episode - b.episode)
            .map(ep => ({
                id: `xc${this.idPrefix}_ep_${hash}_${ep.season}_${ep.episode}`,
                title: ep.title,
                season: ep.season,
                episode: ep.episode,
                ...(ep.thumbnail ? { thumbnail: ep.thumbnail } : (logoUrl ? { thumbnail: logoUrl } : {})),
                ...(ep.overview ? { overview: ep.overview } : {}),
                ...(ep.released ? { released: ep.released } : {}),
            }));
        const header = await this.seriesHeader(id, first, firstInfo);
        return { ...header, videos };
    }

    private simpleMeta(item: any, type: 'tv' | 'movie') {
        const logoUrl = this.deriveFallbackLogoUrl(item);
        return {
            id: item.id,
            type,
            name: item.name,
            poster: logoUrl,
            logo: logoUrl,
            background: logoUrl,
            posterShape: type === 'tv' ? 'square' : 'poster',
            description: item.plot || (type === 'tv' ? '📡 Live Channel' : ''),
            ...(item.category ? { genres: [item.category] } : {}),
            ...(type === 'tv' ? { runtime: 'Live' } : {}),
        };
    }

    /** Parse one of our ids into its kind and payload. */
    parseId(id: string): { kind: MediaType | 'episode'; value: string; ext?: string } | null {
        const prefix = `xc${this.idPrefix}_`;
        if (!id.startsWith(prefix)) return null;
        const rest = id.slice(prefix.length);
        if (rest.startsWith('v_')) return { kind: 'movie', value: rest.slice(2) };
        if (rest.startsWith('s_')) return { kind: 'series', value: rest.slice(2) };
        if (rest.startsWith('e_')) {
            const r = rest.slice(2);
            const u = r.lastIndexOf('_');
            return u > 0 ? { kind: 'episode', value: r.slice(0, u), ext: r.slice(u + 1) }
                : { kind: 'episode', value: r };
        }
        return { kind: 'tv', value: rest };
    }

    buildGenresInManifest() {
        if (!this.manifestRef) return;
        // In split mode there is no combined catalog to attach genres to.
        const tvCatalog = this.manifestRef.catalogs.find((c: any) => c.id === 'iptv_channels');
        if (tvCatalog) {
            const selected = this.selectedCategorySet();
            const groups = [
                ...new Set(
                    this.channels
                        // Only live-TV items feed the TV catalog's genre filter.
                        .filter(c => mediaTypeOf(c) === 'tv')
                        .map(c => c.category || c.attributes?.['group-title'])
                        .filter(Boolean)
                        .map((s: string) => s.trim())
                        // When the user picked a subset, restrict genres to it.
                        .filter((s: string) => selected.size === 0 || selected.has(s))
                )
            ].sort((a: any, b: any) => a.localeCompare(b));
            if (!groups.includes('All Channels')) groups.unshift('All Channels');
            tvCatalog.genres = groups;

            const genreExtra = tvCatalog.extra.find((e: any) => e.name === 'genre');
            if (genreExtra) {
                genreExtra.options = groups;
            }
        }
        this.log.debug('Catalog genres built', { tvGenres: tvCatalog?.genres?.length || 0 });
    }

    async updateData(force = false) {
        const now = Date.now();
        if (!force && CACHE_ENABLED) {
            if (this.lastUpdate && now - this.lastUpdate < this.updateInterval) {
                this.log.debug('Skip update (global interval)');
                return;
            }
            if (this.channels.length && now - this.lastUpdate < env.MIN_UPDATE_INTERVAL_MS) {
                this.log.debug('Skip update (recent minor interval)');
                return;
            }
        }
        try {
            const start = Date.now();
            const providerModule = PROVIDER_MAP[this.providerName];
            if (!providerModule) throw new Error(`Unknown provider: ${this.providerName}`);
            const epgUpdateTimeBefore = this.lastEpgUpdate;
            await providerModule.fetchData(this);
            this.channelMap = new Map(this.channels.map(c => [c.id, c]));
            this.lastUpdate = Date.now();
            if (CACHE_ENABLED && this.channels.length > 0) {
                await this.saveChannelsToCache();
                if (this.lastEpgUpdate !== epgUpdateTimeBefore) {
                    await this.saveEpgToCache();
                }
            }
            this.buildGenresInManifest();
            this.log.debug('Data update complete', {
                channels: this.channels.length,
                ms: Date.now() - start
            });
        } catch (e: any) {
            this.log.error('[UPDATE] Failed:', e.message);
            throw e;
        }
    }

    private _getRefreshCooldownMs(): number {
        if (this._consecutiveRefreshFailures <= 0) return 0;
        if (this._consecutiveRefreshFailures === 1) return 60_000;      // 1 min
        if (this._consecutiveRefreshFailures === 2) return 5 * 60_000;  // 5 min
        return 30 * 60_000;                                              // 30 min
    }

    async refreshOnFirstCatalogRequest() {
        // Exponential backoff: don't hammer a failing provider
        if (this._refreshFailedAt !== null) {
            const cooldown = this._getRefreshCooldownMs();
            if (Date.now() - this._refreshFailedAt < cooldown) return;
        }

        if (this.firstCatalogRefreshDone) return;
        if (this.firstCatalogRefreshPromise) {
            await this.firstCatalogRefreshPromise;
            return;
        }

        const JUST_FETCHED_MS = 2 * 60 * 1000;
        if (this.lastUpdate && (Date.now() - this.lastUpdate < JUST_FETCHED_MS)) {
            this.firstCatalogRefreshDone = true;
            return;
        }

        this.firstCatalogRefreshPromise = (async () => {
            // Reset ETags so the forced re-fetch is unconditional (not a 304).
            // Without this, channels evicted from RAM + a cached ETag would cause
            // fetchData to get a 304, save 0 channels, and wipe the valid cache.
            this.m3uEtag = null;
            this.m3uLastModified = null;
            this.iptvOrgEtag = null;
            this.xtreamEtag = null;
            if (CACHE_ENABLED) {
                sqliteCache.del('addon:channels:' + this.cacheKey);
                sqliteCache.del('addon:epg:' + this.cacheKey);
            }
            await this.updateData(true);
            this.firstCatalogRefreshDone = true;
            this.log.debug('Bootstrap catalog refresh completed', {
                cacheKey: this.cacheKey,
                channels: this.channels.length
            });
        })();

        try {
            await this.firstCatalogRefreshPromise;
            this._consecutiveRefreshFailures = 0;  // reset on success
            this._refreshFailedAt = null;
        } catch (e) {
            this._consecutiveRefreshFailures++;
            this._refreshFailedAt = Date.now();
            throw e;
        } finally {
            this.firstCatalogRefreshPromise = null;
        }
    }

    deriveFallbackLogoUrl(item: any) {
        let finalUrl: string;
        const logoAttr = item.attributes?.['tvg-logo'] || item.logo;
        if (logoAttr && logoAttr.trim()) {
            finalUrl = logoAttr;
        } else {
            // Square placeholder so channels without a logo match the poster shape.
            finalUrl = `https://placehold.co/400x400/2b2b2b/FFFFFF.png?text=${encodeURIComponent(item.name || 'TV')}`;
        }

        if (this.config.reformatLogos && finalUrl.startsWith('http') && !finalUrl.includes('wsrv.nl') && !finalUrl.includes('placehold.co')) {
            if (finalUrl.includes('imgur.com')) {
                finalUrl = `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(finalUrl)}`;
            }
            // Square canvas (fit=contain) so wide/square channel logos display fully.
            return `https://wsrv.nl/?url=${encodeURIComponent(finalUrl)}&w=400&h=400&fit=contain&we&bg=2b2b2b`;
        }
        return finalUrl;
    }

    generateMetaPreview(item: any) {
        const logoUrl = this.deriveFallbackLogoUrl(item);
        const mt = mediaTypeOf(item);
        if (mt === 'movie' || mt === 'series') {
            return {
                id: item.id,
                type: mt,
                name: item.name,
                poster: logoUrl,
                logo: logoUrl,
                background: logoUrl,
                posterShape: 'poster',
                description: item.plot || '',
                ...(item.category ? { genres: [item.category] } : {}),
            };
        }
        return {
            id: item.id,
            type: 'tv',
            name: item.name,
            description: '📡 Live Channel',
            poster: logoUrl,
            logo: logoUrl,
            background: logoUrl,
            // 'square' renders channel logos far better than the portrait 'poster' shape.
            posterShape: 'square',
            genres: item.category
                ? [item.category]
                : (item.attributes?.['group-title'] ? [item.attributes['group-title']] : ['Live TV']),
            runtime: 'Live'
        };
    }

    async getStreams(id: string) {
        // Multi-source: streams come from every source that has the item.
        if (this.isMulti()) {
            const p = this.parseMultiId(id);
            if (p?.kind === 'episode') return this.multiEpisodeStreams(p.hash!, p.season!, p.episode!);
            await this.ensureDataLoaded();
            if (p?.kind === 'movie') {
                let matches = this.channels.filter(c => c.id === id);
                if (this.config.streamSelection === 'auto') matches = matches.slice(0, 1);
                return matches.map(c => ({ url: c.url, title: c.source?.name || c.name, behaviorHints: this.streamHints(c) }));
            }
            if (p?.kind === 'tv') {
                const item = this.channelMap.get(id);
                if (!item) return [];
                if (item.stalkerCmd) return this.stalkerStream(item);
                return [{ url: item.url, title: item.source?.name || item.name, behaviorHints: this.streamHints(item) }];
            }
            return [];
        }

        // Series episodes are not stored as channels — resolve them directly.
        const parsed = this.parseId(id);
        if (parsed?.kind === 'episode') {
            const { xtreamUrl, xtreamUsername, xtreamPassword } = this.config;
            if (!xtreamUrl || !xtreamUsername || !xtreamPassword) return [];
            const ext = parsed.ext || 'mp4';
            const url = `${xtreamUrl}/series/${xtreamUsername}/${xtreamPassword}/${parsed.value}.${ext}`;
            return [{ url, title: 'Play', behaviorHints: { notWebReady: true } }];
        }

        await this.ensureDataLoaded();
        const item = this.channelMap.get(id);
        if (!item) return [];

        // Stalker channels need an on-demand create_link to get a playable URL.
        if (item.stalkerCmd) return this.stalkerStream(item);

        // Movies: a single direct file stream (no live HLS variant).
        if (mediaTypeOf(item) === 'movie') {
            return [{ url: item.url, title: item.name, behaviorHints: { notWebReady: true } }];
        }

        const reqHeaders: Record<string, string> = {};
        if (item.userAgent) reqHeaders['User-Agent'] = item.userAgent;
        if (item.referrer)  reqHeaders['Referer']    = item.referrer;
        const behaviorHints = Object.keys(reqHeaders).length
            ? { notWebReady: true, proxyHeaders: { request: reqHeaders } }
            : { notWebReady: true };

        if (item.urls && item.urls.length > 0) {
            return item.urls.map((url: string, index: number) => ({
                url,
                title: item.urls.length > 1 ? `${item.name} - Link ${index + 1}` : `${item.name} - Live`,
                behaviorHints,
            }));
        }

        const streams = [{ url: item.url, title: `${item.name} - Live`, behaviorHints }];

        const xtreamRe = /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/(\d+)$/;
        if (xtreamRe.test(item.url)) {
            streams.unshift({
                url: item.url + '.m3u8',
                title: `${item.name} - HLS`,
                behaviorHints,
            });
        }

        return streams;
    }

    /** Map a get_vod_info result + channel into provider-only meta fields. */
    private movieMetaExtras(info: any, item: any) {
        const out: any = {};
        out.description = (info && info.plot) || item.plot || '';
        const genres: string[] = [];
        if (info && info.genre) for (const g of String(info.genre).split(/[,/]/)) { const t = g.trim(); if (t) genres.push(t); }
        if (!genres.length && item.category) genres.push(item.category);
        if (genres.length) out.genres = genres;
        if (info && info.cast) out.cast = String(info.cast).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (info && info.director) out.director = String(info.director).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (info && info.releaseDate) { const y = String(info.releaseDate).slice(0, 4); if (/^\d{4}$/.test(y)) out.releaseInfo = y; }
        if (info && info.rating) { const r = parseFloat(info.rating); if (!isNaN(r) && r > 0) out.imdbRating = String(r); }
        return out;
    }

    /** Effective TMDB key/language (per-config webui key wins over the global env). */
    private tmdbKey(): string | null { return this.config.tmdbApiKey || env.TMDB_API_KEY || null; }
    private tmdbLang(): string { return this.config.tmdbLanguage || env.TMDB_LANGUAGE || 'fr-FR'; }
    private yearOf(date: any): string | undefined {
        const y = String(date || '').slice(0, 4);
        return /^\d{4}$/.test(y) ? y : undefined;
    }
    private async tmdbEnrich(kind: 'movie' | 'series', opts: { tmdbId?: string; title: string; year?: string }) {
        const key = this.tmdbKey();
        if (!key || !opts.title) return null;
        const fn = kind === 'movie' ? tmdb.enrichMovie : tmdb.enrichSeries;
        return fn(key, { ...opts, language: this.tmdbLang() }).catch(() => null);
    }

    /** Build a movie meta: TMDB enrichment when available, provider data as fallback. */
    private async movieMeta(item: any, info: any) {
        const logoUrl = this.deriveFallbackLogoUrl(item);
        const base = this.movieMetaExtras(info, item);
        const tm = await this.tmdbEnrich('movie', {
            tmdbId: info?.tmdbId, title: normalizeTitle(item.name), year: this.yearOf(info?.releaseDate),
        });
        const pick = (a: any, b: any) => (a != null && (!Array.isArray(a) || a.length) ? a : b);
        return {
            id: item.id,
            type: 'movie',
            name: item.name,
            poster: tm?.poster || logoUrl,
            logo: logoUrl,
            background: tm?.background || logoUrl,
            posterShape: 'poster',
            description: pick(tm?.description, base.description) || '',
            ...(pick(tm?.genres, base.genres) ? { genres: pick(tm?.genres, base.genres) } : {}),
            ...(pick(tm?.cast, base.cast) ? { cast: pick(tm?.cast, base.cast) } : {}),
            ...(pick(tm?.director, base.director) ? { director: pick(tm?.director, base.director) } : {}),
            ...(pick(tm?.releaseInfo, base.releaseInfo) ? { releaseInfo: pick(tm?.releaseInfo, base.releaseInfo) } : {}),
            ...(pick(tm?.imdbRating, base.imdbRating) ? { imdbRating: pick(tm?.imdbRating, base.imdbRating) } : {}),
        };
    }

    async buildMovieMeta(item: any) {
        // The streams list lacks the synopsis — fetch it lazily for Xtream movies.
        let info: any = null;
        const parsed = this.parseId(item.id);
        if (parsed?.kind === 'movie') {
            info = await xtreamProvider.fetchVodInfo(this.config, parsed.value).catch(() => null);
        }
        return this.movieMeta(item, info);
    }

    /** Multi-source movie meta: details fetched from the first Xtream source. */
    private async multiMovieMeta(item: any) {
        let info: any = null;
        for (const c of this.channels.filter(c => c.id === item.id)) {
            const src = this.sourceById(c.source?.id);
            if (src && src.provider === 'xtream' && c.srcVodId) {
                info = await xtreamProvider.fetchVodInfo(src, c.srcVodId).catch(() => null);
                if (info && info.plot) break;
            }
        }
        return this.movieMeta(item, info);
    }

    /** Series-level meta header (without videos): TMDB enrichment + provider fallback. */
    private async seriesHeader(id: string, item: any, info: any) {
        const logoUrl = item ? this.deriveFallbackLogoUrl(item) : undefined;
        const tmdbId = info?.tmdb_id != null ? String(info.tmdb_id)
            : (info?.tmdb != null ? String(info.tmdb) : undefined);
        const tm = await this.tmdbEnrich('series', {
            tmdbId,
            title: normalizeTitle(item?.name || info?.name || ''),
            year: this.yearOf(info?.releaseDate || info?.releasedate),
        });
        const poster = tm?.poster || logoUrl;
        const background = tm?.background || logoUrl;
        const genres = (tm?.genres && tm.genres.length) ? tm.genres : (item?.category ? [item.category] : undefined);
        return {
            id,
            type: 'series',
            name: item?.name || info?.name || 'Series',
            ...(poster ? { poster, logo: logoUrl, background } : {}),
            posterShape: 'poster',
            description: tm?.description || info?.plot || item?.plot || '',
            ...(genres ? { genres } : {}),
            ...(tm?.cast?.length ? { cast: tm.cast } : {}),
            ...(tm?.releaseInfo ? { releaseInfo: tm.releaseInfo } : {}),
            ...(tm?.imdbRating ? { imdbRating: tm.imdbRating } : {}),
        };
    }

    async buildSeriesMeta(id: string, seriesId: string) {
        const item = this.channelMap.get(id);
        const logoUrl = item ? this.deriveFallbackLogoUrl(item) : undefined;
        const { episodes, info } = await xtreamProvider.fetchSeriesEpisodes(this.config, seriesId);
        const videos = episodes.map((ep: any) => ({
            id: `xc${this.idPrefix}_e_${ep.id}_${ep.ext}`,
            title: ep.title,
            season: ep.season,
            episode: ep.episode,
            ...(ep.thumbnail ? { thumbnail: ep.thumbnail } : (logoUrl ? { thumbnail: logoUrl } : {})),
            ...(ep.overview ? { overview: ep.overview } : {}),
            ...(ep.released ? { released: ep.released } : {}),
        }));
        const header = await this.seriesHeader(id, item, info);
        return { ...header, videos };
    }

    async getDetailedMeta(id: string) {
        // Multi-source meta.
        if (this.isMulti()) {
            const p = this.parseMultiId(id);
            if (p?.kind === 'series') return this.multiSeriesMeta(id, p.hash!);
            await this.ensureDataLoaded();
            const item = this.channelMap.get(id) || this.channels.find(c => c.id === id);
            if (!item) return null;
            if (mediaTypeOf(item) === 'movie') return this.multiMovieMeta(item);
            return this.simpleMeta(item, 'tv');
        }

        const parsed = this.parseId(id);
        if (parsed?.kind === 'series') {
            await this.ensureDataLoaded();
            return this.buildSeriesMeta(id, parsed.value);
        }

        await this.ensureDataLoaded();
        const movieItem = this.channelMap.get(id);
        if (movieItem && mediaTypeOf(movieItem) === 'movie') {
            return this.buildMovieMeta(movieItem);
        }

        await this.ensureEpgLoaded();
        const item = this.channelMap.get(id);
        if (!item) return null;
        const epgId = item.attributes?.['tvg-id'] || item.attributes?.['tvg-name'];
        const current = getCurrentProgram(this.epgData, epgId, this.config.epgOffsetHours as number);
        const upcoming = getUpcomingPrograms(this.epgData, epgId, 3, this.config.epgOffsetHours as number);
        let description = `📺 CHANNEL: ${item.name}`;
        if (current) {
            const start = current.startTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
            const end = current.stopTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
            description += `\n\n📡 NOW: ${current.title}${start && end ? ` (${start}-${end})` : ''}`;
            if (current.description) description += `\n\n${current.description}`;
        }
        if (upcoming.length) {
            description += '\n\n📅 UPCOMING:\n';
            for (const p of upcoming) {
                description += `${p.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${p.title}\n`;
            }
        }
        const logoUrl = this.deriveFallbackLogoUrl(item);
        return {
            id: item.id,
            type: 'tv',
            name: item.name,
            poster: logoUrl,
            logo: logoUrl,
            background: logoUrl,
            posterShape: 'square',
            description,
            genres: item.category
                ? [item.category]
                : (item.attributes?.['group-title'] ? [item.attributes['group-title']] : ['Live TV']),
            runtime: 'Live'
        };
    }

    _resetEvictTimer() {
        clearTimeout(this._evictTimer);
        this._evictTimer = setTimeout(() => this._evictFromMemory(), env.DATA_MEMORY_TTL_MS);
    }

    private _startUpdateTimer() {
        if (this._updateTimer !== null) return; // already running — guard against double-start
        this._updateTimer = setInterval(() => {
            // Skip if circuit is open
            if (this._timerPausedUntil !== null && Date.now() < this._timerPausedUntil) return;

            this.updateData().then(() => {
                this._timerConsecutiveFailures = 0;
                this._timerPausedUntil = null;
            }).catch((e: any) => {
                this._timerConsecutiveFailures++;
                if (this._timerConsecutiveFailures >= 3) {
                    this._timerPausedUntil = Date.now() + 30 * 60_000; // pause 30 min
                    this.log.warn(`[TIMER] Circuit open after ${this._timerConsecutiveFailures} failures, pausing 30 min`);
                }
                this.log.error('[TIMER] Background update failed:', e.message);
            });
        }, env.UPDATE_INTERVAL_MS);
        // unref: don't prevent Node.js process exit if this is the only active handle
        if (typeof (this._updateTimer as any).unref === 'function') {
            (this._updateTimer as any).unref();
        }
    }

    _evictFromMemory() {
        clearTimeout(this._evictTimer);
        clearInterval(this._updateTimer);   // kill update timer
        this._updateTimer = null;           // allow GC and re-start check
        this._evictTimer = null;
        this.channels = [];
        this.channelMap = new Map();
        this.epgData = {};
        this.log.debug('Data evicted from RAM', { cacheKey: this.cacheKey });
    }

    async ensureDataLoaded() {
        if (this.channels.length > 0) {
            this._resetEvictTimer();
            return;
        }
        if (!CACHE_ENABLED) return;
        if (this._loadPromise) {
            await this._loadPromise;
            return;
        }
        this._loadPromise = this.loadChannelsFromCache().finally(() => { this._loadPromise = null; });
        await this._loadPromise;
        this._resetEvictTimer();
        this._startUpdateTimer();    // start/resume background updates
    }

    async getChannelsForCatalog() {
        await this.ensureDataLoaded();
        return this.channels;
    }
}

export { CACHE_ENABLED };
