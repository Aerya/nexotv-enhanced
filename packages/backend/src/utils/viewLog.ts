import env from '../config/env';
import * as sqliteCache from './sqliteCache';

/**
 * Lightweight viewing log: one entry per /stream request (i.e. each time a
 * client opens the stream list of a media). The addon returns direct provider
 * URLs, so it cannot observe real playback/duration — this records "what was
 * opened, when, by which IP, from which source/portal".
 */

const KEY = 'stats:views';
const MAX_ENTRIES = 2000;
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 days

export interface ViewEntry {
    ts: number;
    type: string;      // movie | series | tv | channel
    id: string;
    title: string;
    ip: string;
    source: string;    // source/provider name
    mac: string;       // Stalker portal MAC used (when applicable)
    cfg: string;       // short cacheKey of the config
}

function ensureDb() { sqliteCache.init(env.SQLITE_PATH); }

function read(): ViewEntry[] {
    ensureDb();
    const v = sqliteCache.get(KEY);
    return Array.isArray(v) ? v : [];
}

function write(list: ViewEntry[]) {
    sqliteCache.set(KEY, list, 0); // ttl=0 → permanent
}

export function record(entry: ViewEntry) {
    const list = read();
    list.push(entry);
    const cutoff = Date.now() - MAX_AGE_MS;
    let next = list.filter(e => e && e.ts >= cutoff);
    if (next.length > MAX_ENTRIES) next = next.slice(next.length - MAX_ENTRIES);
    write(next);
}

/** Newest first. */
export function list(): ViewEntry[] {
    return read().slice().reverse();
}

export function clear() { write([]); }
