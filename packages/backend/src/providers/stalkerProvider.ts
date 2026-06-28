'use strict';

import { validatePublicUrl } from '../utils/validateUrl';
import { makeLogger } from '../utils/logger';
import env from '../config/env';

const log = makeLogger();

const UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3';
const X_UA = 'Model: MAG250; Link: WiFi';
const PORTAL_PATHS = ['/c/portal.php', '/portal.php', '/server/load.php', '/stalker_portal/server/load.php'];
const SESSION_TTL = 5 * 60 * 1000; // re-handshake every 5 min

export interface StalkerCreds { url: string; mac: string; }

interface Session { endpoint: string; token: string; ts: number; }
const sessions = new Map<string, Session>();

function baseUrl(url: string) { return (url || '').trim().replace(/\/+$/, ''); }
function sessionKey(c: StalkerCreds) { return `${baseUrl(c.url)}|${c.mac}`; }

function headers(mac: string, token?: string): Record<string, string> {
    const h: Record<string, string> = {
        'User-Agent': UA,
        'X-User-Agent': X_UA,
        'Cookie': `mac=${mac}; stb_lang=fr; timezone=Europe/Paris`,
        'Accept': '*/*',
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function getJson(url: string, h: Record<string, string>): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(url, { headers: h, signal: controller.signal });
        if (!resp.ok) return null;
        const txt = await resp.text();
        try { return JSON.parse(txt); } catch { return null; }
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Handshake against the first portal path that yields a token. */
async function handshake(creds: StalkerCreds): Promise<Session | null> {
    const base = baseUrl(creds.url);
    for (const path of PORTAL_PATHS) {
        const data = await getJson(`${base}${path}?type=stb&action=handshake&token=&JsHttpRequest=1-xml`, headers(creds.mac));
        const token = data?.js?.token;
        if (token) return { endpoint: path, token, ts: Date.now() };
    }
    return null;
}

async function session(creds: StalkerCreds): Promise<Session | null> {
    const key = sessionKey(creds);
    const cur = sessions.get(key);
    if (cur && Date.now() - cur.ts < SESSION_TTL) return cur;
    const s = await handshake(creds);
    if (s) sessions.set(key, s);
    return s;
}

/** Authenticated GET against the portal. `query` excludes JsHttpRequest. */
async function api(creds: StalkerCreds, query: string): Promise<any> {
    let s = await session(creds);
    if (!s) return null;
    const base = baseUrl(creds.url);
    const url = `${base}${s.endpoint}?${query}&JsHttpRequest=1-xml`;
    let data = await getJson(url, headers(creds.mac, s.token));
    if (data == null) {
        // token may have expired — re-handshake once
        sessions.delete(sessionKey(creds));
        s = await session(creds);
        if (!s) return null;
        data = await getJson(url, headers(creds.mac, s.token));
    }
    return data?.js ?? null;
}

/** Live TV genres (categories). */
export async function getGenres(creds: StalkerCreds): Promise<Array<{ id: string; title: string }>> {
    const js = await api(creds, 'type=itv&action=get_genres');
    if (!Array.isArray(js)) return [];
    return js
        .filter((g: any) => g && g.id && g.id !== '*' && g.title)
        .map((g: any) => ({ id: String(g.id), title: String(g.title).trim() }));
}

/** All live channels of a genre (handles pagination). */
export async function getGenreChannels(creds: StalkerCreds, genreId: string): Promise<any[]> {
    const out: any[] = [];
    let page = 1;
    let pages = 1;
    do {
        const js = await api(creds, `type=itv&action=get_ordered_list&genre=${encodeURIComponent(genreId)}&fav=0&sortby=number&hd=0&p=${page}`);
        const data = js?.data;
        if (!Array.isArray(data)) break;
        out.push(...data);
        const total = parseInt(js.total_items, 10) || 0;
        const per = parseInt(js.max_page_items, 10) || data.length || 1;
        pages = Math.max(1, Math.ceil(total / per));
        page++;
        if (page > 200) break; // hard safety cap
    } while (page <= pages);
    return out;
}

/** Resolve a channel `cmd` into a playable URL via create_link. */
export async function resolveLink(creds: StalkerCreds, cmd: string): Promise<string | null> {
    if (!cmd) return null;
    const js = await api(creds, `type=itv&action=create_link&cmd=${encodeURIComponent(cmd)}&forced_storage=0&disable_ad=0`);
    let real = js?.cmd;
    if (!real || typeof real !== 'string') return null;
    // Strip player prefixes like "ffmpeg " / "auto " before the URL.
    real = real.replace(/^\s*(ffmpeg|auto|mpegts)\s+/i, '').trim();
    return real || null;
}

function selectedNames(config: any): Set<string> {
    return new Set(
        (config.selectedCategories || [])
            .map((c: any) => (typeof c === 'string' ? c.trim() : ''))
            .filter(Boolean)
    );
}

/** Build live-TV channels for a Stalker source (used by mono + multi). */
export async function buildChannels(creds: StalkerCreds, opts: {
    idPrefix: string; selected: Set<string>; source?: { id: string; name: string };
}): Promise<any[]> {
    await validatePublicUrl(creds.url);
    const genres = await getGenres(creds);
    const wantAll = opts.selected.size === 0;
    const out: any[] = [];
    for (const g of genres) {
        if (!wantAll && !opts.selected.has(g.title)) continue;
        let items: any[] = [];
        try { items = await getGenreChannels(creds, g.id); }
        catch (e: any) { log.warn('[STALKER] genre fetch failed', g.title, e?.message); continue; }
        for (const it of items) {
            if (!it || !it.cmd) continue;
            const idBase = opts.source
                ? `xc${opts.idPrefix}_tvx_${opts.source.id}_${it.id}`
                : `xc${opts.idPrefix}_st_${it.id}`;
            out.push({
                id: idBase,
                name: opts.source ? `${it.name} (${opts.source.name})` : it.name,
                type: 'tv',
                mediaType: 'tv',
                stalkerCmd: it.cmd,
                logo: it.logo || '',
                category: g.title,
                ...(opts.source ? { source: opts.source } : {}),
                attributes: { 'tvg-logo': it.logo, 'group-title': g.title },
            });
        }
    }
    return out;
}

/** Mono-source provider entry point. */
export async function fetchData(addonInstance: any) {
    const { stalkerUrl, stalkerMac } = addonInstance.config;
    if (!stalkerUrl || !stalkerMac) throw new Error('Stalker portal URL and MAC are required');
    addonInstance.channels = [];
    addonInstance.epgData = {};
    addonInstance.channels = await buildChannels(
        { url: stalkerUrl, mac: stalkerMac },
        { idPrefix: addonInstance.idPrefix, selected: selectedNames(addonInstance.config) }
    );
    addonInstance.log?.debug?.('Stalker channels built', { count: addonInstance.channels.length });
}
