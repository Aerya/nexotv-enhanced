export type Provider = 'xtream' | 'iptv-org' | 'm3u';

export type CatalogMode = 'single' | 'split' | 'custom';
export type CategoryType = 'tv' | 'movie' | 'series';

export interface CatalogGroup {
  name: string;
  categories: string[];
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
}

export type AddonConfig = (XtreamConfig | IptvOrgConfig | M3uConfig) & { catalogName?: string };

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
