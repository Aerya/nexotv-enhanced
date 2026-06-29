import env from '../config/env';

export type CatalogMode = 'single' | 'split' | 'custom';
export type MediaType = 'tv' | 'movie' | 'series';

export interface CatalogGroup {
    name: string;
    categories: string[];
}

export interface ManifestOptions {
    catalogName?: string;
    catalogMode?: CatalogMode;
    selectedCategories?: string[];
    catalogGroups?: CatalogGroup[];
    /** Category name → media type. Missing entries default to 'tv'. */
    categoryTypes?: Record<string, MediaType>;
    /**
     * Catalogs kept OUT of the Stremio home board (still browsable in Discover).
     * Keys: 'grp:<index>' (custom), 'cat:<name>' (split), 'type:<tv|movie|series>' (single).
     */
    discoverOnly?: string[];
}

/** Catalog id used in "single" mode for live TV (kept stable for back-compat). */
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

function typeOf(name: string, types?: Record<string, MediaType>): MediaType {
    return (types?.[name] as MediaType) || 'tv';
}

/** Dominant media type among a list of categories. */
function dominantType(categories: string[], types?: Record<string, MediaType>): MediaType {
    const tally: Record<MediaType, number> = { tv: 0, movie: 0, series: 0 };
    for (const c of categories) tally[typeOf(c, types)]++;
    if (tally.series >= tally.movie && tally.series > tally.tv) return 'series';
    if (tally.movie >= tally.series && tally.movie > tally.tv) return 'movie';
    return 'tv';
}

/**
 * Extra/genre block.
 * - A **discover-only** catalog gets a REQUIRED genre → Stremio keeps it off the
 *   home board but still shows it in Discover (defaults to "All Channels").
 * - A **home** catalog keeps a non-required genre (only when >1 categories, to
 *   offer an internal filter) so it appears on the board.
 */
function catalogExtra(categories: string[], home: boolean) {
    const genres = ['All Channels', ...categories];
    if (!home) {
        return {
            extra: [
                { name: 'genre', isRequired: true, options: genres },
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ],
            genres
        };
    }
    if (categories.length > 1) {
        return {
            extra: [
                { name: 'genre', isRequired: false, options: genres },
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ],
            genres
        };
    }
    return { extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] };
}

function buildCatalogs(opts: ManifestOptions) {
    const mode: CatalogMode =
        opts.catalogMode === 'split' ? 'split'
            : opts.catalogMode === 'custom' ? 'custom'
                : 'single';
    const categories = cleanCategories(opts.selectedCategories);
    const types = opts.categoryTypes;
    const baseName = opts.catalogName || env.ADDON_NAME;
    const discoverOnly = new Set(opts.discoverOnly || []);
    const isHome = (key: string) => !discoverOnly.has(key);

    // Custom mode: one catalog per user-defined group of categories.
    if (mode === 'custom') {
        const groups = (opts.catalogGroups || [])
            .map(g => ({ name: (g?.name || '').trim(), categories: cleanCategories(g?.categories) }))
            .filter(g => g.name && g.categories.length > 0);
        if (groups.length > 0) {
            return groups.map((g, i) => ({
                type: dominantType(g.categories, types),
                id: groupCatalogIdForIndex(i),
                name: opts.catalogName ? `${opts.catalogName} · ${g.name}` : g.name,
                ...catalogExtra(g.categories, isHome('grp:' + i))
            }));
        }
        // No valid group → fall through to a single combined catalog.
    }

    // Split mode: one catalog per selected category (typed individually).
    if (mode === 'split' && categories.length > 0) {
        return categories.map((cat, i) => ({
            type: typeOf(cat, types),
            id: catalogIdForIndex(i),
            name: opts.catalogName ? `${opts.catalogName} · ${cat}` : cat,
            ...catalogExtra([cat], isHome('cat:' + cat))
        }));
    }

    // Single mode: one combined catalog per media type present in the selection.
    const tvCats = categories.filter(c => typeOf(c, types) === 'tv');
    const movieCats = categories.filter(c => typeOf(c, types) === 'movie');
    const seriesCats = categories.filter(c => typeOf(c, types) === 'series');
    const catalogs: any[] = [];

    // One combined catalog per media type. The genre extra is always present
    // (runtime-filled for TV); `isRequired` is what keeps a catalog off the home
    // board when the user marked it as Discover-only.
    const singleCatalog = (type: MediaType, id: string, name: string, cats: string[]) => {
        const home = isHome('type:' + type);
        const genres = cats.length ? ['All Channels', ...cats] : (home ? [] : ['All Channels']);
        catalogs.push({
            type, id, name,
            extra: [
                { name: 'genre', isRequired: !home, options: genres },
                { name: 'search', isRequired: false },
                { name: 'skip' }
            ],
            genres,
        });
    };

    // TV: present when TV categories are selected, or as the default when nothing
    // is selected at all. Skipped when only Movie/Series were picked.
    if (tvCats.length > 0 || categories.length === 0) {
        singleCatalog('tv', SINGLE_CATALOG_ID, baseName, tvCats);
    }
    if (movieCats.length > 0) singleCatalog('movie', 'iptv_movies', `${baseName} · Movies`, movieCats);
    if (seriesCats.length > 0) singleCatalog('series', 'iptv_series', `${baseName} · Series`, seriesCats);
    return catalogs;
}

export function createManifest(idPrefix?: string, options?: ManifestOptions) {
    const opts = options || {};
    const catalogs = buildCatalogs(opts);
    // Declare every media type the catalogs expose (always include 'tv').
    const types = [...new Set<string>(['tv', ...catalogs.map((c: any) => c.type)])];
    return {
        id: 'community.nexotv.enhanced',
        version: '2.0.0',
        name: env.ADDON_NAME,
        description: env.ADDON_DESCRIPTION,
        resources: ['catalog', 'stream', 'meta'],
        types,
        catalogs,
        idPrefixes: idPrefix ? [`xc${idPrefix}_`, `io${idPrefix}_`, `m3${idPrefix}_`] : ['xc', 'io', 'm3'],
        behaviorHints: {
            configurable: true,
            configurationRequired: true
        },
        ...(env.ADDON_LOGO_URL ? { logo: env.ADDON_LOGO_URL } : {}),
        ...(env.ADDON_BACKGROUND_URL ? { background: env.ADDON_BACKGROUND_URL } : {}),
    };
}
