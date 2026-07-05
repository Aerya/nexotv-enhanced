import crypto from 'crypto';
import env from '../config/env';
import * as sqliteCache from './sqliteCache';
import { encryptConfig, tryParseConfigToken } from './cryptoConfig';

const PREFIX = 'cfg_';
const STORE_PREFIX = 'addon:config-token:';
const PERMANENT = 0;
const REFERENCE_RE = /^cfg_([A-Za-z0-9_-]{32})$/;

function ensureDb() {
    sqliteCache.init(env.SQLITE_PATH);
}

function referenceId(jsonStr: string): string {
    if (!env.CONFIG_SECRET) throw new Error('Encryption disabled');
    return crypto
        .createHmac('sha256', env.CONFIG_SECRET)
        .update(jsonStr, 'utf8')
        .digest('base64url')
        .slice(0, 32);
}

/**
 * Persist an encrypted config and return a short, opaque token suitable for URLs.
 * Identical configs reuse the same HMAC-derived reference instead of growing the DB.
 */
export function storeConfigToken(jsonStr: string): string {
    const encryptedToken = encryptConfig(jsonStr);
    if (!encryptedToken) throw new Error('Encryption disabled');

    const id = referenceId(jsonStr);
    ensureDb();
    sqliteCache.set(STORE_PREFIX + id, { token: encryptedToken }, PERMANENT);
    return PREFIX + id;
}

export function isStoredConfigToken(token: string): boolean {
    return REFERENCE_RE.test(token);
}

/** Resolve both new short references and legacy self-contained config tokens. */
export function resolveConfigToken(token: string): any {
    const match = token.match(REFERENCE_RE);
    if (!match) return tryParseConfigToken(token);

    ensureDb();
    const stored = sqliteCache.get(STORE_PREFIX + match[1]);
    if (!stored || typeof stored.token !== 'string') {
        throw new Error('Unknown configuration reference');
    }
    return tryParseConfigToken(stored.token);
}
