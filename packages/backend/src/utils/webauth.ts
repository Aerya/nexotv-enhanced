import crypto from 'crypto';
import env from '../config/env';

export const SESSION_COOKIE = 'nx_session';

/** Whether the password gate is active. */
export function authEnabled(): boolean {
    return !!env.WEBUI_PASSWORD;
}

/** Signing key derived from the configured password (rotating it invalidates sessions). */
function sessionKey(): Buffer | null {
    if (!env.WEBUI_PASSWORD) return null;
    return crypto.createHash('sha256').update('nxsess:' + env.WEBUI_PASSWORD).digest();
}

/** Constant-time check of a submitted password against WEBUI_PASSWORD. */
export function verifyPassword(input: unknown): boolean {
    if (!env.WEBUI_PASSWORD || typeof input !== 'string') return false;
    const a = crypto.createHash('sha256').update(input).digest();
    const b = crypto.createHash('sha256').update(env.WEBUI_PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
}

/** Issue a signed session token: base64url(payload).hmac, payload = { exp }. */
export function createSession(): string | null {
    const key = sessionKey();
    if (!key) return null;
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + env.WEBUI_SESSION_TTL_MS })).toString('base64url');
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

/** Verify a session token's signature and expiry. */
export function verifySession(token: unknown): boolean {
    const key = sessionKey();
    if (!key || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return typeof exp === 'number' && exp > Date.now();
    } catch {
        return false;
    }
}

/** Minimal cookie header parser. */
export function parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}

/** True if the request carries a valid session cookie. */
export function isAuthenticated(req: any): boolean {
    if (!authEnabled()) return true;
    const cookies = parseCookies(req.headers?.cookie);
    return verifySession(cookies[SESSION_COOKIE]);
}

/** Build the Set-Cookie header value for a session (or to clear it). */
export function sessionCookieHeader(token: string | null, secure: boolean): string {
    const base = `${SESSION_COOKIE}=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/`;
    const flags = secure ? '; Secure' : '';
    if (token === null) return `${base}${flags}; Max-Age=0`;
    return `${base}${flags}; Max-Age=${Math.floor(env.WEBUI_SESSION_TTL_MS / 1000)}`;
}

/** Express middleware: 401 when the UI is gated and the request is unauthenticated. */
export function requireAuth(req: any, res: any, next: any) {
    if (isAuthenticated(req)) return next();
    res.status(401).json({ error: 'Authentication required' });
}

/**
 * Protect features that expose instance-wide data.
 *
 * A public instance deliberately has no authenticated identity: visitors may
 * build their own encrypted addon URL, but they must never inherit access to
 * the shared config store, viewing history, or plaintext token restoration.
 */
export function requirePrivateAccess(req: any, res: any, next: any) {
    if (!authEnabled()) {
        return res.status(403).json({ error: 'Private feature disabled on public instances' });
    }
    return requireAuth(req, res, next);
}
