import env from '../config/env';
import crypto from 'crypto';
import zlib from 'zlib';

const { CONFIG_SECRET } = env;

// Plaintext payload marker (1st byte, before encryption):
//   0x00 = raw JSON, 0x01 = gzipped JSON.
// Legacy tokens have no marker — their first byte is '{' (0x7B), so they are
// detected by the absence of a known marker and parsed as raw JSON.
const MARK_RAW = 0;
const MARK_GZIP = 1;

/**
 * Derive a 32-byte key from CONFIG_SECRET (if present & sufficiently long).
 */
function getSecret() {
    const secret = CONFIG_SECRET;
    if (!secret || secret.length < 16) return null;
    return crypto.createHash('sha256').update(secret).digest();
}

/** Build the marked (optionally gzipped) plaintext buffer for a JSON string. */
function packPlaintext(jsonStr: string): Buffer {
    const raw = Buffer.from(jsonStr, 'utf8');
    const gz = zlib.gzipSync(raw, { level: 9 });
    // Only keep compression when it actually pays off (marker byte included).
    if (gz.length + 1 < raw.length) {
        return Buffer.concat([Buffer.from([MARK_GZIP]), gz]);
    }
    return Buffer.concat([Buffer.from([MARK_RAW]), raw]);
}

/** Reverse packPlaintext, tolerating legacy (unmarked) payloads. */
function unpackPlaintext(plain: Buffer): string {
    const marker = plain[0];
    if (marker === MARK_GZIP) return zlib.gunzipSync(plain.subarray(1)).toString('utf8');
    if (marker === MARK_RAW) return plain.subarray(1).toString('utf8');
    // Legacy: whole buffer is the JSON string.
    return plain.toString('utf8');
}

/**
 * Encrypt JSON string with AES-256-GCM (iv(12) + tag(16) + ciphertext) -> base64 prefixed with enc:
 * The plaintext is gzip-compressed first (huge win for large category lists).
 */
export function encryptConfig(jsonStr: string) {
    const key = getSecret();
    if (!key) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = packPlaintext(jsonStr);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, ciphertext]);
    return 'enc:' + payload.toString('base64url');
}

/**
 * Decrypt enc:<base64> token
 */
export function decryptConfig(token: string) {
    if (!token.startsWith('enc:')) throw new Error('Not encrypted');
    const key = getSecret();
    if (!key) throw new Error('Encryption disabled');
    let b64 = token.slice(4);

    // Normalize base64url to standard base64 to ensure reliable decoding
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padNeeded = (4 - (b64.length % 4)) % 4;
    if (padNeeded) b64 += '='.repeat(padNeeded);

    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 12 + 16 + 1) throw new Error('Bad payload');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(unpackPlaintext(plain));
}

/**
 * Decode plain (possibly base64url) token and parse JSON.
 * Accepts:
 *  - enc:<base64> encrypted
 *  - base64 (with + / =)
 *  - base64url ( - _ no padding)
 * A leading gzip marker byte is honoured for forward compatibility with
 * compressed unencrypted tokens.
 */
export function tryParseConfigToken(token: string) {
    if (!token) throw new Error('Empty token');
    if (token.startsWith('enc:')) return decryptConfig(token);

    // Normalize base64url -> base64
    let base = token.replace(/-/g, '+').replace(/_/g, '/');
    // Re-pad
    const padNeeded = (4 - (base.length % 4)) % 4;
    if (padNeeded) base += '='.repeat(padNeeded);

    let buf: Buffer;
    try {
        buf = Buffer.from(base, 'base64');
    } catch {
        throw new Error('Invalid base64');
    }
    // A marker byte means the payload may be gzipped; otherwise it is raw JSON.
    let jsonStr: string;
    if (buf[0] === MARK_GZIP) {
        try { jsonStr = zlib.gunzipSync(buf.subarray(1)).toString('utf8'); }
        catch { throw new Error('Invalid compressed config'); }
    } else if (buf[0] === MARK_RAW) {
        jsonStr = buf.subarray(1).toString('utf8');
    } else {
        jsonStr = buf.toString('utf8');
    }
    try {
        return JSON.parse(jsonStr);
    } catch {
        throw new Error('Invalid JSON config');
    }
}
