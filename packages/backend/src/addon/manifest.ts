import env from '../config/env';

export type CatalogMode = 'single' | 'split' | 'custom';

export interface CatalogGroup {
    name: string;
    categories: string[];
}

export interface ManifestOptions {
    catalogName?: string;
    catalogMode?: CatalogMode;
    selectedCategories?: string[];
    catalogGroups?: CatalogGroup[];
}

/** Catalog id used in "single" mode (one combined catalog). */
export const SINGLE_CATALOG_ID = 'iptv_channels';

/** Deterministic catalog id for the Nth selected category in "split" mode. */
export function catalogIdForIndex(index: number) {
    return `iptv_cat_${index}`;
}

/** Deterministic catalog id for the Nth custom group in "custom" mode. */
export function groupCatalogIdForIndex(index: number) {
    return `iptv_grp_${index}`;
}

function cleanCategories(list: string[] | undefined): string[] {
    return (list || [])
        .map(c => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean);
}

/** Extra/genre block: adds a genre filter only when there are >1 categories. */
function catalogExtra(categories: string[]) {
    if (categories.length > 1) {
        const genres = ['All Channels', ...categories];
        return {
            extra: [
                { name: 'genre', isRequired: false, options: genres },
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ],
            genres
        };
    }
    return {
        extra: [
            { name: 'search', isRequired: false },
            { name: 'skip' }
        ]
    };
}

function buildCatalogs(opts: ManifestOptions) {
    const mode: CatalogMode =
        opts.catalogMode === 'split' ? 'split'
            : opts.catalogMode === 'custom' ? 'custom'
                : 'single';
    const categories = cleanCategories(opts.selectedCategories);

    // Custom mode: one catalog per user-defined group of categories.
    if (mode === 'custom') {
        const groups = (opts.catalogGroups || [])
            .map(g => ({ name: (g?.name || '').trim(), categories: cleanCategories(g?.categories) }))
            .filter(g => g.name && g.categories.length > 0);
        if (groups.length > 0) {
            return groups.map((g, i) => ({
                type: 'tv',
                id: groupCatalogIdForIndex(i),
                name: opts.catalogName ? `${opts.catalogName} · ${g.name}` : g.name,
                ...catalogExtra(g.categories)
            }));
        }
        // No valid group → fall through to a single combined catalog.
    }

    // Split mode: one catalog per selected category.
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
