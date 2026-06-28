import crypto from 'crypto';
import env from '../config/env';
import * as sqliteCache from './sqliteCache';
import { makeLogger } from './logger';

const log = makeLogger();
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TmdbMeta {
    description?: string;
    poster?: string;
    background?: string;
    genres?: string[];
    cast?: string[];
    director?: string[];
    releaseInfo?: string;
    imdbRating?: string;
    imdbId?: string;
}

async function withTimeout(url: string, ms: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function tget(apiKey: string, path: string, params: Record<string, any>): Promise<any> {
    const u = new URL(API + path);
    u.searchParams.set('api_key', apiKey);
    for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') u.searchParams.set(k, String(v));
    }
    try {
        const resp = await withTimeout(u.toString(), env.FETCH_TIMEOUT_MS);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

function img(path: string | null | undefined, size: string): string | undefined {
    return path ? `${IMG}${size}${path}` : undefined;
}

function detailsToMeta(d: any, kind: 'movie' | 'series'): TmdbMeta {
    const out: TmdbMeta = {};
    if (d.overview) out.description = d.overview;
    const poster = img(d.poster_path, 'w500');
    if (poster) out.poster = poster;
    const bg = img(d.backdrop_path, 'w1280');
    if (bg) out.background = bg;
    if (Array.isArray(d.genres) && d.genres.length) out.genres = d.genres.map((g: any) => g.name).filter(Boolean);
    const cast = d.credits?.cast;
    if (Array.isArray(cast) && cast.length) out.cast = cast.slice(0, 10).map((c: any) => c.name).filter(Boolean);
    const crew = d.credits?.crew;
    if (kind === 'movie' && Array.isArray(crew)) {
        const dirs = crew.filter((c: any) => c.job === 'Director').map((c: any) => c.name).filter(Boolean);
        if (dirs.length) out.director = dirs;
    }
    const date = d.release_date || d.first_air_date;
    if (date && /^\d{4}/.test(date)) out.releaseInfo = String(date).slice(0, 4);
    if (typeof d.vote_average === 'number' && d.vote_average > 0) out.imdbRating = d.vote_average.toFixed(1);
    const imdb = d.external_ids?.imdb_id;
    if (imdb) out.imdbId = imdb;
    return out;
}

async function resolveId(apiKey: string, type: 'movie' | 'tv', tmdbId: string | undefined, title: string, year: string | undefined, language: string): Promise<string | null> {
    if (tmdbId && /^\d+$/.test(String(tmdbId))) return String(tmdbId);
    if (!title) return null;
    const params: any = { query: title, language, include_adult: false };
    if (year) params[type === 'movie' ? 'year' : 'first_air_date_year'] = year;
    const s = await tget(apiKey, `/search/${type}`, params);
    const first = s?.results?.[0];
    return first?.id ? String(first.id) : null;
}

async function enrich(
    apiKey: string,
    kind: 'movie' | 'series',
    opts: { tmdbId?: string; title: string; year?: string; language?: string }
): Promise<TmdbMeta | null> {
    if (!apiKey) return null;
    const type = kind === 'movie' ? 'movie' : 'tv';
    const language = opts.language || 'fr-FR';
    const cacheKey = 'tmdb:' + crypto
        .createHash('md5')
        .update([kind, language, opts.tmdbId || '', opts.title || '', opts.year || ''].join('|'))
        .digest('hex');

    if (env.CACHE_ENABLED) {
        const cached = sqliteCache.get(cacheKey);
        if (cached) return cached.meta || null;
    }

    let result: TmdbMeta | null = null;
    try {
        const id = await resolveId(apiKey, type, opts.tmdbId, opts.title, opts.year, language);
        if (id) {
            const d = await tget(apiKey, `/${type}/${id}`, { language, append_to_response: 'credits,external_ids' });
            if (d) result = detailsToMeta(d, kind);
        }
    } catch (e: any) {
        log.debug('TMDB enrich failed', { kind, title: opts.title, error: e?.message });
    }

    // Cache even null results (briefly) to avoid hammering on unmatched junk.
    if (env.CACHE_ENABLED) {
        sqliteCache.set(cacheKey, { meta: result }, result ? CACHE_TTL : 24 * 60 * 60 * 1000);
    }
    return result;
}

export function enrichMovie(apiKey: string, opts: { tmdbId?: string; title: string; year?: string; language?: string }) {
    return enrich(apiKey, 'movie', opts);
}

export function enrichSeries(apiKey: string, opts: { tmdbId?: string; title: string; year?: string; language?: string }) {
    return enrich(apiKey, 'series', opts);
}
