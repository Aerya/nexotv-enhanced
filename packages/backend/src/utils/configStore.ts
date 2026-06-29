import crypto from 'crypto';
import env from '../config/env';
import * as sqliteCache from './sqliteCache';
import { encryptConfig, tryParseConfigToken } from './cryptoConfig';
import { makeLogger } from './logger';

const log = makeLogger();

const PREFIX = 'webui:cfg:';
const INDEX_KEY = 'webui:cfg:__index__';
const PERMANENT = 0; // ttl=0 → no expiry (survives GC)

export interface SavedConfigMeta {
    id: string;
    name: string;
    provider: string;
    updatedAt: number;
}

function ensureDb() {
    // Idempotent — guarantees a DB even when CACHE_ENABLED is false.
    sqliteCache.init(env.SQLITE_PATH);
}

function readIndex(): SavedConfigMeta[] {
    ensureDb();
    const idx = sqliteCache.get(INDEX_KEY);
    return Array.isArray(idx) ? idx : [];
}

function writeIndex(list: SavedConfigMeta[]) {
    sqliteCache.set(INDEX_KEY, list, PERMANENT);
}

/** Encode a config object for at-rest storage (encrypted when CONFIG_SECRET is set). */
function encode(config: any): string {
    const json = JSON.stringify(config);
    const enc = encryptConfig(json);
    if (enc) return enc;
    // No CONFIG_SECRET → base64url (sqlite file is local-only).
    return Buffer.from(json, 'utf8').toString('base64url');
}

function decode(token: string): any {
    return tryParseConfigToken(token);
}

export function listConfigs(): SavedConfigMeta[] {
    return readIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getConfig(id: string): any | null {
    ensureDb();
    const rec = sqliteCache.get(PREFIX + id);
    if (!rec || !rec.token) return null;
    try {
        return decode(rec.token);
    } catch (e: any) {
        log.error('Saved config decode failed', { id, error: e.message });
        return null;
    }
}

/**
 * Create or update a saved config. Pass an existing id to update it in place,
 * otherwise a new id is generated. Returns the stored metadata.
 */
export function saveConfig(name: string, config: any, id?: string): SavedConfigMeta {
    ensureDb();
    const cleanName = (name || '').toString().trim().slice(0, 80) || 'Untitled';
    // Multi-source configs are identified by their `sources` list, not a provider field.
    const provider = (config?.provider || (config?.sources?.length ? 'multi' : 'xtream')).toString();
    const realId = id && /^[a-f0-9]{6,32}$/i.test(id) ? id : crypto.randomBytes(8).toString('hex');
    const meta: SavedConfigMeta = { id: realId, name: cleanName, provider, updatedAt: Date.now() };

    sqliteCache.set(PREFIX + realId, { ...meta, token: encode(config) }, PERMANENT);

    const list = readIndex().filter(e => e.id !== realId);
    list.push(meta);
    writeIndex(list);
    log.debug('Saved config stored', { id: realId, name: cleanName, provider });
    return meta;
}

export function deleteConfig(id: string): boolean {
    ensureDb();
    sqliteCache.del(PREFIX + id);
    const list = readIndex();
    const next = list.filter(e => e.id !== id);
    writeIndex(next);
    return next.length !== list.length;
}
