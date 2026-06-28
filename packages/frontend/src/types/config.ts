export type Provider = 'xtream' | 'iptv-org' | 'm3u' | 'stalker' | 'multi';

export type CatalogMode = 'single' | 'split' | 'custom';
export type CategoryType = 'tv' | 'movie' | 'series';
export type StreamSelection = 'auto' | 'choose';

export interface CatalogGroup {
  name: string;
  categories: string[];
}

export interface SourceConfig {
  id: string;
  name: string;
  provider: 'xtream' | 'm3u' | 'stalker';
  xtreamUrl?: string;
  xtreamUsername?: string;
  xtreamPassword?: string;
  m3uUrl?: string;
  stalkerUrl?: string;
  stalkerMac?: string;
  globalUserAgent?: string;
  selectedCategories?: string[];
  categoryTypes?: Record<string, CategoryType>;
}

export interface StalkerConfig {
  provider: 'stalker';
  stalkerUrl: string;
  stalkerMac: string;
  selectedCategories?: string[];
  catalogMode?: CatalogMode;
  catalogGroups?: CatalogGroup[];
  categoryTypes?: Record<string, CategoryType>;
}

export interface MultiConfig {
  provider?: 'multi';
  sources: SourceConfig[];
  catalogMode?: CatalogMode;
  selectedCategories?: string[];
  categoryTypes?: Record<string, CategoryType>;
  catalogGroups?: CatalogGroup[];
  streamSelection?: StreamSelection;
  reformatLogos?: boolean;
  tmdbApiKey?: string;
  tmdbLanguage?: string;
}

export interface XtreamConfig {
  provider: 'xtream';
  xtreamUrl: string;
  xtreamUsername: string;
  xtreamPassword: string;
  enableEpg: boolean;
  epgUrl?: string;
  epgOffsetHours?: number;
  reformatLogos: boolean;
  selectedCategories?: string[];
  catalogMode?: CatalogMode;
  catalogGroups?: CatalogGroup[];
  categoryTypes?: Record<string, CategoryType>;
  tmdbApiKey?: string;
  tmdbLanguage?: string;
  prescan?: {
    liveCount: number;
    categoryCount: number;
    epgProgrammes: number;
    epgChannels: number;
    mode: string;
    epgSource: string;
  };
  instanceId?: string;
}

export interface IptvOrgConfig {
  provider: 'iptv-org';
  iptvOrgCountry: string | null;
  iptvOrgCategory: string | null;
}

export interface M3uConfig {
  provider: 'm3u';
  m3uUrl: string;
  enableEpg: boolean;
  epgUrl?: string;
  epgOffsetHours?: number;
  reformatLogos: boolean;
  globalUserAgent?: string;
  selectedCategories?: string[];
  catalogMode?: CatalogMode;
  catalogGroups?: CatalogGroup[];
  categoryTypes?: Record<string, CategoryType>;
  tmdbApiKey?: string;
  tmdbLanguage?: string;
}

export type AddonConfig = (XtreamConfig | IptvOrgConfig | M3uConfig | StalkerConfig | MultiConfig) & { catalogName?: string };

export interface AddonInfo {
  name: string;
  description: string;
  logoUrl: string;
  encryptionEnabled: boolean;
}

export interface PublicPlaylist {
  label: string;
  note?: string;
  url: string;
}
