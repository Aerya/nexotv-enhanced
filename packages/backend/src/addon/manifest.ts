import env from '../config/env';

export type CatalogMode = 'single' | 'split';

export interface ManifestOptions {
    catalogName?: string;
    catalogMode?: CatalogMode;
    selectedCategories?: string[];
}

/** Catalog id used in "single" mode (one combined catalog). */
export const SINGLE_CATALOG_ID = 'iptv_channels';

/** Deterministic catalog id for the Nth selected category in "split" mode. */
export function catalogIdForIndex(index: number) {
    return `iptv_cat_${index}`;
}

function buildCatalogs(opts: ManifestOptions) {
    const mode: CatalogMode = opts.catalogMode === 'split' ? 'split' : 'single';
    const categories = (opts.selectedCategories || [])
        .map(c => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean);

    // One catalog per selected category.
    if (mode === 'split' && categories.length > 0) {
        return categories.map((cat, i) => ({
            type: 'tv',
            id: catalogIdForIndex(i),
            name: opts.catalogName ? `${opts.catalogName} · ${cat}` : cat,
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ]
        }));
    }

    // Single combined catalog. When the user selected a subset of categories
    // those become the genre options; otherwise genres are filled at runtime
    // from the loaded channels (see M3UEPGAddon.buildGenresInManifest).
    const genres = categories.length > 0 ? ['All Channels', ...categories] : [];
    return [
        {
            type: 'tv',
            id: SINGLE_CATALOG_ID,
            name: opts.catalogName || env.ADDON_NAME,
            extra: [
                { name: 'genre', isRequired: false, options: genres },
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ],
            genres
        }
    ];
}

export function createManifest(idPrefix?: string, options?: ManifestOptions) {
    const opts = options || {};
    return {
        id: 'community.nexotv',
        version: '2.0.0',
        name: env.ADDON_NAME,
        description: env.ADDON_DESCRIPTION,
        resources: ['catalog', 'stream', 'meta'],
        types: ['tv'],
        catalogs: buildCatalogs(opts),
        idPrefixes: idPrefix ? [`xc${idPrefix}_`, `io${idPrefix}_`, `m3${idPrefix}_`] : ['xc', 'io', 'm3'],
        behaviorHints: {
            configurable: true,
            configurationRequired: true
        },
        ...(env.ADDON_LOGO_URL ? { logo: env.ADDON_LOGO_URL } : {}),
        ...(env.ADDON_BACKGROUND_URL ? { background: env.ADDON_BACKGROUND_URL } : {}),
    };
}
