import { parseEPG } from '../parsers/epgParser';
import { validatePublicUrl } from '../utils/validateUrl';
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

/**
 * Parse an Xtream date (ISO string, "0000-00-00", or unix seconds/ms) to an
 * ISO string, or null if unusable. Avoids RangeError from new Date().toISOString().
 */
export function safeIsoDate(v: any): string | null {
    if (v == null || v === '' || v === '0000-00-00' || v === '0000-00-00 00:00:00') return null;
    const s = String(v).trim();
    let d: Date;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        d = new Date(n < 1e12 ? n * 1000 : n); // unix seconds vs ms
    } else {
        d = new Date(s);
    }
    return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchJson(url: string, ms: number): Promise<any> {
    const resp = await withTimeout(url, {}, ms).catch(() => null);
    if (!resp || !resp.ok) return null;
    try { return await resp.json(); } catch { return null; }
}

/** Build a category_id → category_name map from a get_*_categories response. */
function categoryIdMap(arr: any): Record<string, string> {
    const map: Record<string, string> = {};
    if (Array.isArray(arr)) {
        for (const c of arr) {
            if (c && c.category_id != null && c.category_name) {
                map[String(c.category_id)] = String(c.category_name);
            }
        }
    }
    return map;
}

/** All category names the user selected (single/split + custom groups). */
function selectedCategoryNames(config: any): Set<string> {
    const out = new Set<string>();
    for (const c of config.selectedCategories || []) {
        if (typeof c === 'string' && c.trim()) out.add(c.trim());
    }
    for (const g of config.catalogGroups || []) {
        for (const c of g?.categories || []) {
            if (typeof c === 'string' && c.trim()) out.add(c.trim());
        }
    }
    return out;
}

/** Which media types the selection covers, per config.categoryTypes. */
function selectedTypes(config: any): Set<string> {
    const names = selectedCategoryNames(config);
    const types: Record<string, string> = config.categoryTypes || {};
    const out = new Set<string>();
    for (const n of names) out.add(types[n] || 'tv');
    return out;
}

/**
 * Fetch a single movie's details (get_vod_info), lazily, for the Stremio meta
 * handler — the streams list endpoint does not include the plot/synopsis.
 */
export async function fetchVodInfo(config: any, vodId: string) {
    const { xtreamUrl, xtreamUsername, xtreamPassword } = config;
    if (!xtreamUrl || !xtreamUsername || !xtreamPassword) return null;
    await validatePublicUrl(xtreamUrl);
    const base = `${xtreamUrl}/player_api.php?username=${encodeURIComponent(xtreamUsername)}&password=${encodeURIComponent(xtreamPassword)}`;
    const data = await fetchJson(`${base}&action=get_vod_info&vod_id=${encodeURIComponent(vodId)}`, env.FETCH_TIMEOUT_MS);
    if (!data) return null;
    const info = data.info || data.movie_data || {};
    return {
        plot: info.plot || info.description || '',
        genre: info.genre || '',
        cast: info.cast || info.actors || '',
        director: info.director || '',
        releaseDate: info.releasedate || info.release_date || info.releaseDate || null,
        rating: info.rating != null ? String(info.rating) : '',
    };
}

/**
 * Fetch the episodes of a single series (get_series_info), lazily, for the
 * Stremio meta handler. Returns a flat episode list with stream ids/extensions.
 */
export async function fetchSeriesEpisodes(config: any, seriesId: string) {
    const { xtreamUrl, xtreamUsername, xtreamPassword } = config;
    if (!xtreamUrl || !xtreamUsername || !xtreamPassword) return { episodes: [], info: null };
    await validatePublicUrl(xtreamUrl);
    const base = `${xtreamUrl}/player_api.php?username=${encodeURIComponent(xtreamUsername)}&password=${encodeURIComponent(xtreamPassword)}`;
    const data = await fetchJson(`${base}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`, env.FETCH_TIMEOUT_MS);
    if (!data) return { episodes: [], info: null };

    const epsObj = data.episodes || {};
    const episodes: any[] = [];
    for (const seasonKey of Object.keys(epsObj)) {
        const arr = epsObj[seasonKey];
        if (!Array.isArray(arr)) continue;
        for (const ep of arr) {
            if (!ep || ep.id == null) continue;
            episodes.push({
                id: String(ep.id),
                season: Number(seasonKey) || Number(ep.season) || 1,
                episode: Number(ep.episode_num) || 0,
                title: ep.title || `Episode ${ep.episode_num || ''}`.trim(),
                ext: (ep.container_extension || 'mp4').toString(),
                thumbnail: ep.info?.movie_image || ep.info?.cover_big || null,
                overview: ep.info?.plot || ep.info?.overview || '',
                released: safeIsoDate(ep.info?.releasedate ?? ep.added),
            });
        }
    }
    return { episodes, info: data.info || null };
}

export async function fetchData(addonInstance: any) {
    const { config } = addonInstance;
    const {
        xtreamUrl,
        xtreamUsername,
        xtreamPassword
    } = config;

    if (!xtreamUrl || !xtreamUsername || !xtreamPassword) {
        throw new Error('Xtream credentials incomplete');
    }

    await validatePublicUrl(xtreamUrl);
    const base = `${xtreamUrl}/player_api.php?username=${encodeURIComponent(xtreamUsername)}&password=${encodeURIComponent(xtreamPassword)}`;

    const liveHeaders: Record<string, string> = {};
    if (addonInstance.xtreamEtag) liveHeaders['If-None-Match'] = addonInstance.xtreamEtag;

    const [liveResp, liveCatsResp] = await Promise.all([
        withTimeout(`${base}&action=get_live_streams`, { headers: liveHeaders }, env.FETCH_TIMEOUT_MS),
        withTimeout(`${base}&action=get_live_categories`, {}, env.FETCH_TIMEOUT_MS).catch(() => null)
    ]);

    if (liveResp.status === 304) {
        addonInstance.log?.debug('Xtream 304 Not Modified — skipping update');
        return;
    }
    if (!liveResp.ok) throw new Error('Xtream live streams fetch failed');

    addonInstance.xtreamEtag = liveResp.headers.get('etag') ?? null;

    addonInstance.channels = [];
    addonInstance.epgData = {};

    const live = await liveResp.json();

    let liveCatMap: Record<string, string> = {};
    try {
        if (liveCatsResp && liveCatsResp.ok) {
            const arr = await liveCatsResp.json();
            if (Array.isArray(arr)) {
                for (const c of arr) {
                    if (c && c.category_id && c.category_name)
                        liveCatMap[c.category_id] = c.category_name;
                }
            }
        }
    } catch { /* ignore */ }

    addonInstance.channels = (Array.isArray(live) ? live : []).map((s: any) => {
        const cat = liveCatMap[s.category_id] || s.category_name || s.category_id || 'Live';
        return {
            id: `xc${addonInstance.idPrefix}_${s.stream_id}`,
            name: s.name,
            type: 'tv',
            mediaType: 'tv',
            url: `${xtreamUrl}/live/${xtreamUsername}/${xtreamPassword}/${s.stream_id}.m3u8`,
            logo: s.stream_icon,
            category: cat,
            epg_channel_id: s.epg_channel_id,
            attributes: {
                'tvg-logo': s.stream_icon,
                'tvg-id': s.epg_channel_id,
                'group-title': cat
            }
        };
    });

    // VOD (movies) and series are only fetched when the user actually selected
    // categories of that type — keeps the dataset small and avoids useless calls.
    const wantTypes = selectedTypes(config);
    const selectedNames = selectedCategoryNames(config);

    if (wantTypes.has('movie')) {
      try {
        const [vodCatsRaw, vodRaw] = await Promise.all([
            fetchJson(`${base}&action=get_vod_categories`, env.FETCH_TIMEOUT_MS),
            fetchJson(`${base}&action=get_vod_streams`, env.FETCH_TIMEOUT_MS),
        ]);
        const vodCatMap = categoryIdMap(vodCatsRaw);
        let added = 0;
        for (const v of Array.isArray(vodRaw) ? vodRaw : []) {
            const cat = vodCatMap[String(v.category_id)] || v.category_name || '';
            if (!cat || !selectedNames.has(cat.trim())) continue;
            const ext = (v.container_extension || 'mp4').toString();
            addonInstance.channels.push({
                id: `xc${addonInstance.idPrefix}_v_${v.stream_id}`,
                name: v.name,
                type: 'movie',
                mediaType: 'movie',
                url: `${xtreamUrl}/movie/${xtreamUsername}/${xtreamPassword}/${v.stream_id}.${ext}`,
                logo: v.stream_icon || v.cover,
                category: cat,
                plot: v.plot || '',
                attributes: { 'tvg-logo': v.stream_icon || v.cover, 'group-title': cat }
            });
            added++;
        }
        addonInstance.log?.debug('Xtream VOD added', { count: added });
      } catch (e: any) {
        addonInstance.log?.warn('[XTREAM] VOD fetch failed, skipping movies:', e?.message);
      }
    }

    if (wantTypes.has('series')) {
      try {
        const [serCatsRaw, serRaw] = await Promise.all([
            fetchJson(`${base}&action=get_series_categories`, env.FETCH_TIMEOUT_MS),
            fetchJson(`${base}&action=get_series`, env.FETCH_TIMEOUT_MS),
        ]);
        const serCatMap = categoryIdMap(serCatsRaw);
        let added = 0;
        for (const s of Array.isArray(serRaw) ? serRaw : []) {
            const cat = serCatMap[String(s.category_id)] || s.category_name || '';
            if (!cat || !selectedNames.has(cat.trim())) continue;
            addonInstance.channels.push({
                id: `xc${addonInstance.idPrefix}_s_${s.series_id}`,
                name: s.name,
                type: 'series',
                mediaType: 'series',
                seriesId: String(s.series_id),
                logo: s.cover,
                category: cat,
                plot: s.plot || '',
                genre: s.genre || '',
                attributes: { 'tvg-logo': s.cover, 'group-title': cat }
            });
            added++;
        }
        addonInstance.log?.debug('Xtream series added', { count: added });
      } catch (e: any) {
        addonInstance.log?.warn('[XTREAM] Series fetch failed, skipping series:', e?.message);
      }
    }

    if (config.enableEpg) {
        const customEpgUrl = config.epgUrl && typeof config.epgUrl === 'string' && config.epgUrl.trim() ? config.epgUrl.trim() : null;
        const epgSource = customEpgUrl
            ? customEpgUrl
            : `${xtreamUrl}/xmltv.php?username=${encodeURIComponent(xtreamUsername)}&password=${encodeURIComponent(xtreamPassword)}`;

        const now = Date.now();
        const epgStale = !addonInstance.lastEpgUpdate ||
            (now - addonInstance.lastEpgUpdate > env.EPG_UPDATE_INTERVAL_MS);

        if (epgStale) {
            try {
                if (customEpgUrl) await validatePublicUrl(epgSource);
                const epgResp = await withTimeout(epgSource, {}, env.EPG_FETCH_TIMEOUT_MS);
                if (epgResp.ok) {
                    const contentLength = parseInt(epgResp.headers.get('content-length') ?? '0', 10);
                    if (contentLength > env.EPG_MAX_BYTES) {
                        const sizeMb = (contentLength / 1024 / 1024).toFixed(1);
                        addonInstance.log?.warn(`[EPG] Content-Length too large (${sizeMb} MB), skipping download`);
                    } else {
                        const epgContent = await epgResp.text();
                        addonInstance.epgData = await parseEPG(epgContent, addonInstance.log);
                        addonInstance.lastEpgUpdate = Date.now();
                    }
                }
            } catch {
                // Ignore EPG errors
            }
        } else {
            addonInstance.log?.debug('EPG skip (interval not elapsed)', {
                ms: now - (addonInstance.lastEpgUpdate ?? 0)
            });
        }
    }
}
