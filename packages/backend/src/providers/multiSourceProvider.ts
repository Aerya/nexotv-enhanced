'use strict';

import { parseM3U } from '../parsers/m3uParser';
import { validatePublicUrl } from '../utils/validateUrl';
import { titleHash } from '../addon/dedup';
import * as stalkerProvider from './stalkerProvider';
import env from '../config/env';

async function withTimeout(url: string, options: any, ms: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchJson(url: string, ms: number): Promise<any> {
    const resp = await withTimeout(url, {}, ms).catch(() => null);
    if (!resp || !resp.ok) return null;
    try { return await resp.json(); } catch { return null; }
}

function categoryIdMap(arr: any): Record<string, string> {
    const map: Record<string, string> = {};
    if (Array.isArray(arr)) {
        for (const c of arr) {
            if (c && c.category_id != null && c.category_name) map[String(c.category_id)] = String(c.category_name);
        }
    }
    return map;
}

function selectionOf(src: any) {
    const selected = new Set<string>(
        (src.selectedCategories || []).map((c: any) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    );
    const types: Record<string, string> = src.categoryTypes || {};
    return { selected, types };
}

function srcTag(src: any) {
    return { id: src.id, name: (src.name || src.id || 'Source').toString() };
}

async function fetchXtreamSource(src: any, idPrefix: string, log: any): Promise<any[]> {
    const { xtreamUrl, xtreamUsername, xtreamPassword } = src;
    if (!xtreamUrl || !xtreamUsername || !xtreamPassword) return [];
    await validatePublicUrl(xtreamUrl);
    const base = `${xtreamUrl}/player_api.php?username=${encodeURIComponent(xtreamUsername)}&password=${encodeURIComponent(xtreamPassword)}`;
    const { selected, types } = selectionOf(src);
    const tag = srcTag(src);
    const out: any[] = [];

    // ── Live TV (no selection → all live) ─────────────────────────────────────
    const wantAllTv = selected.size === 0;
    const wantTv = wantAllTv || [...selected].some(c => (types[c] || 'tv') === 'tv');
    if (wantTv) {
        const [liveRaw, liveCatsRaw] = await Promise.all([
            fetchJson(`${base}&action=get_live_streams`, env.FETCH_TIMEOUT_MS),
            fetchJson(`${base}&action=get_live_categories`, env.FETCH_TIMEOUT_MS),
        ]);
        const catMap = categoryIdMap(liveCatsRaw);
        for (const s of Array.isArray(liveRaw) ? liveRaw : []) {
            const cat = catMap[String(s.category_id)] || s.category_name || 'Live';
            if (!wantAllTv && !selected.has(cat.trim())) continue;
            const hash = titleHash(`${tag.id}:${s.stream_id}`);
            out.push({
                id: `xc${idPrefix}_tvx_${tag.id}_${hash}`,
                name: `${s.name} (${tag.name})`,
                mediaType: 'tv',
                url: `${xtreamUrl}/live/${xtreamUsername}/${xtreamPassword}/${s.stream_id}.m3u8`,
                logo: s.stream_icon,
                category: cat,
                source: tag,
                attributes: { 'tvg-logo': s.stream_icon, 'group-title': cat },
            });
        }
    }

    // ── Movies (only for selected movie categories) ───────────────────────────
    const movieCats = [...selected].filter(c => types[c] === 'movie');
    if (movieCats.length) {
        try {
            const [vodCatsRaw, vodRaw] = await Promise.all([
                fetchJson(`${base}&action=get_vod_categories`, env.FETCH_TIMEOUT_MS),
                fetchJson(`${base}&action=get_vod_streams`, env.FETCH_TIMEOUT_MS),
            ]);
            const catMap = categoryIdMap(vodCatsRaw);
            const want = new Set(movieCats);
            for (const v of Array.isArray(vodRaw) ? vodRaw : []) {
                const cat = catMap[String(v.category_id)] || v.category_name || '';
                if (!cat || !want.has(cat.trim())) continue;
                const ext = (v.container_extension || 'mp4').toString();
                out.push({
                    id: `xc${idPrefix}_mv_${titleHash(v.name)}`,
                    name: v.name,
                    mediaType: 'movie',
                    url: `${xtreamUrl}/movie/${xtreamUsername}/${xtreamPassword}/${v.stream_id}.${ext}`,
                    logo: v.stream_icon || v.cover,
                    category: cat,
                    source: tag,
                    srcVodId: String(v.stream_id),
                    plot: v.plot || '',
                    attributes: { 'tvg-logo': v.stream_icon || v.cover, 'group-title': cat },
                });
            }
        } catch (e: any) { log?.warn?.('[MULTI] VOD failed', tag.name, e?.message); }
    }

    // ── Series (only for selected series categories) ──────────────────────────
    const seriesCats = [...selected].filter(c => types[c] === 'series');
    if (seriesCats.length) {
        try {
            const [serCatsRaw, serRaw] = await Promise.all([
                fetchJson(`${base}&action=get_series_categories`, env.FETCH_TIMEOUT_MS),
                fetchJson(`${base}&action=get_series`, env.FETCH_TIMEOUT_MS),
            ]);
            const catMap = categoryIdMap(serCatsRaw);
            const want = new Set(seriesCats);
            for (const s of Array.isArray(serRaw) ? serRaw : []) {
                const cat = catMap[String(s.category_id)] || s.category_name || '';
                if (!cat || !want.has(cat.trim())) continue;
                out.push({
                    id: `xc${idPrefix}_sr_${titleHash(s.name)}`,
                    name: s.name,
                    mediaType: 'series',
                    category: cat,
                    source: tag,
                    srcSeriesId: String(s.series_id),
                    logo: s.cover,
                    plot: s.plot || '',
                    attributes: { 'tvg-logo': s.cover, 'group-title': cat },
                });
            }
        } catch (e: any) { log?.warn?.('[MULTI] Series failed', tag.name, e?.message); }
    }

    return out;
}

async function fetchM3uSource(src: any, idPrefix: string): Promise<any[]> {
    const url = (src.m3uUrl || '').trim();
    if (!url) return [];
    await validatePublicUrl(url);
    const resp = await withTimeout(url, {}, env.FETCH_TIMEOUT_MS);
    if (!resp.ok) throw new Error(`M3U fetch failed: HTTP ${resp.status}`);
    const text = await resp.text();
    const { channels: parsed } = parseM3U(text);

    const { selected } = selectionOf(src);
    const tag = srcTag(src);
    const wantAll = selected.size === 0;
    const out: any[] = [];
    for (const ch of parsed) {
        const cat = ch.group || 'Uncategorized';
        if (!wantAll && !selected.has(cat.trim())) continue;
        const isMovie = /\/movie\//i.test(ch.url || '');
        if (isMovie) {
            out.push({
                id: `xc${idPrefix}_mv_${titleHash(ch.name)}`,
                name: ch.name,
                mediaType: 'movie',
                url: ch.url,
                logo: ch.logo || '',
                category: cat,
                source: tag,
                userAgent: ch.userAgent || src.globalUserAgent || '',
                referrer: ch.referrer || '',
                attributes: { 'tvg-logo': ch.logo, 'group-title': cat },
            });
        } else {
            const hash = titleHash(`${tag.id}:${ch.url}`);
            out.push({
                id: `xc${idPrefix}_tvx_${tag.id}_${hash}`,
                name: `${ch.name} (${tag.name})`,
                mediaType: 'tv',
                url: ch.url,
                logo: ch.logo || '',
                category: cat,
                source: tag,
                userAgent: ch.userAgent || src.globalUserAgent || '',
                referrer: ch.referrer || '',
                attributes: { 'tvg-id': ch.tvgId, 'tvg-logo': ch.logo, 'group-title': cat },
            });
        }
    }
    return out;
}

/** Fetch every configured source in parallel and merge into one tagged pool. */
export async function fetchData(addonInstance: any) {
    const sources: any[] = addonInstance.config.sources || [];
    if (!sources.length) throw new Error('No sources configured');

    addonInstance.channels = [];
    addonInstance.epgData = {};

    const results = await Promise.all(sources.map(async (src) => {
        try {
            if (src.provider === 'm3u') return await fetchM3uSource(src, addonInstance.idPrefix);
            if (src.provider === 'stalker') {
                return await stalkerProvider.buildChannels(
                    { url: src.stalkerUrl, mac: src.stalkerMac },
                    { idPrefix: addonInstance.idPrefix, selected: selectionOf(src).selected, source: srcTag(src) }
                );
            }
            return await fetchXtreamSource(src, addonInstance.idPrefix, addonInstance.log);
        } catch (e: any) {
            addonInstance.log?.warn?.('[MULTI] Source failed', src?.name, e?.message);
            return [];
        }
    }));

    // Preserve source order (priority) in the merged pool.
    addonInstance.channels = results.flat();
    addonInstance.log?.debug?.('Multi-source merged', { channels: addonInstance.channels.length });
}
