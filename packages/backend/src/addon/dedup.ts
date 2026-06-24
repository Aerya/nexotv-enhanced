import crypto from 'crypto';

// Quality / language / source markers stripped before comparing titles so the
// same movie/series from different providers collapses to one logical entry.
const NOISE = /\b(4k|uhd|fhd|hd|sd|hq|hevc|h\.?265|h\.?264|x265|x264|10bit|hdr|dolby|atmos|ddp?5?\.?1?|multi|vff?|vostfr|vost|vo|vf|truefrench|french|en|eng|fr|ita|esp|lat|lq|[0-9]{3,4}p)\b/gi;

/**
 * Normalize a movie/series title for cross-source de-duplication.
 * Lowercase, strip diacritics, remove bracketed tags and quality/language
 * markers, keep digits (years disambiguate), collapse to single spaces.
 */
export function normalizeTitle(name: string): string {
    return (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')        // combining diacritics
        .replace(/[\[\(][^\]\)]*[\]\)]/g, ' ') // [..] (..) tags
        .replace(NOISE, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Short stable hash of a normalized title — used in logical catalog ids. */
export function titleHash(name: string): string {
    return crypto.createHash('md5').update(normalizeTitle(name)).digest('hex').slice(0, 10);
}

/**
 * Group items by normalized title. Returns a Map keyed by titleHash, preserving
 * first-seen order of insertion within each group (source priority order).
 */
export function groupByTitle<T extends { name: string }>(items: T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const it of items) {
        const norm = normalizeTitle(it.name);
        if (!norm) continue;
        const key = crypto.createHash('md5').update(norm).digest('hex').slice(0, 10);
        const arr = groups.get(key);
        if (arr) arr.push(it);
        else groups.set(key, [it]);
    }
    return groups;
}
