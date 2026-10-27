export const HUMAN_SITEMAP_PLUGIN_ID = "human-sitemap";
export const HUMAN_SITEMAP_VERSION = "0.1.0";

export const DEFAULT_HUMAN_SITEMAP_TITLE = "Sitemap";
export const DEFAULT_HUMAN_SITEMAP_LAYOUT = "compact" as const;
export const DEFAULT_HUMAN_SITEMAP_SORT = "alphabetical" as const;
export const DEFAULT_HUMAN_SITEMAP_SHOW_COUNTS_MODE = "inherit" as const;
export const DEFAULT_INCLUDED_COLLECTIONS_TEXT = "pages\nposts";
export const DEFAULT_INCLUDED_MENUS_TEXT = "primary";
export const DEFAULT_INCLUDE_TAXONOMIES = true;
export const DEFAULT_SHOW_COUNTS = false;
export const DEFAULT_MAX_ITEMS_PER_SECTION = 25;
export const MIN_ITEMS_PER_SECTION = 1;
export const MAX_ITEMS_PER_SECTION = 100;

export type HumanSitemapSort = "alphabetical" | "date";
export type HumanSitemapLayout = "compact" | "expanded";
export type HumanSitemapShowCountsMode = "inherit" | "show" | "hide";
export type HumanSitemapOrderDirection = "asc" | "desc";

export interface HumanSitemapPluginOptions {}

export interface IncludedCollectionConfig {
  slug: string;
  label?: string;
}

export interface IncludedMenuConfig {
  name: string;
  label?: string;
}

export interface HumanSitemapSettings {
  includedCollections: IncludedCollectionConfig[];
  includedMenus: IncludedMenuConfig[];
  includeTaxonomies: boolean;
  showCounts: boolean;
  maxItemsPerSection: number;
  defaultSort: HumanSitemapSort;
}

export interface HumanSitemapViewAllLink {
  href: string;
  label?: string;
}

export interface HumanSitemapCollectionEntry {
  id: string;
  data: Record<string, unknown>;
}

export interface HumanSitemapMenuItem {
  id: string;
  label: string;
  url: string;
  target?: string;
  children: HumanSitemapMenuItem[];
}

export interface HumanSitemapMenu {
  name: string;
  label: string;
  items: HumanSitemapMenuItem[];
}

export interface HumanSitemapTaxonomyDef {
  name: string;
  label: string;
  collections: string[];
  hierarchical?: boolean;
}

export interface HumanSitemapTaxonomyTerm {
  id: string;
  name: string;
  slug: string;
  label: string;
  description?: string;
  count?: number;
  children: HumanSitemapTaxonomyTerm[];
}

export interface HumanSitemapCollectionFilter {
  status?: "draft" | "published" | "archived";
  limit?: number;
  cursor?: string;
  where?: Record<string, string | string[]>;
  orderBy?: Record<string, HumanSitemapOrderDirection>;
  locale?: string;
}

export interface HumanSitemapCollectionResult {
  entries: HumanSitemapCollectionEntry[];
  nextCursor?: string;
  error?: Error;
}

export interface HumanSitemapDataSource {
  getEmDashCollection: (
    collection: string,
    filter?: HumanSitemapCollectionFilter,
  ) => Promise<HumanSitemapCollectionResult>;
  getMenu: (name: string) => Promise<HumanSitemapMenu | null>;
  getTaxonomyDefs: () => Promise<HumanSitemapTaxonomyDef[]>;
  getTaxonomyTerms: (taxonomyName: string) => Promise<HumanSitemapTaxonomyTerm[]>;
}

export type HumanSitemapCollectionHrefBuilder = (
  collection: string,
  entry: HumanSitemapCollectionEntry,
) => string;

export type HumanSitemapTaxonomyHrefBuilder = (
  taxonomy: string,
  term: HumanSitemapTaxonomyTerm,
) => string;

export interface HumanSitemapRenderOverrides {
  title?: string | null;
  showCollections?: boolean;
  showMenus?: boolean;
  showTaxonomies?: boolean;
  showCounts?: boolean;
  layout?: HumanSitemapLayout;
  maxItemsPerSection?: number;
  sort?: HumanSitemapSort;
  class?: string;
  viewAllLinks?: Record<string, HumanSitemapViewAllLink>;
  collectionHrefBuilder?: HumanSitemapCollectionHrefBuilder;
  taxonomyHrefBuilder?: HumanSitemapTaxonomyHrefBuilder;
}

export interface HumanSitemapResolvedOptions {
  title: string | null;
  showCollections: boolean;
  showMenus: boolean;
  showTaxonomies: boolean;
  showCounts: boolean;
  layout: HumanSitemapLayout;
  maxItemsPerSection: number;
  defaultSort: HumanSitemapSort;
  includedCollections: IncludedCollectionConfig[];
  includedMenus: IncludedMenuConfig[];
  className?: string;
  viewAllLinks: Record<string, HumanSitemapViewAllLink>;
  collectionHrefBuilder?: HumanSitemapCollectionHrefBuilder;
  taxonomyHrefBuilder?: HumanSitemapTaxonomyHrefBuilder;
}

export interface HumanSitemapBlockValue {
  _type: "humanSitemap";
  _key?: string;
  title?: string;
  showCollections?: boolean;
  showMenus?: boolean;
  showTaxonomies?: boolean;
  showCountsMode?: HumanSitemapShowCountsMode;
  layout?: HumanSitemapLayout;
}

export interface HumanSitemapSectionItem {
  label: string;
  href: string;
  description?: string;
  count?: number;
  children: HumanSitemapSectionItem[];
}

export interface HumanSitemapSection {
  key: string;
  kind: "collection" | "menu" | "taxonomy";
  label: string;
  items: HumanSitemapSectionItem[];
  totalCount?: number;
  renderedCount: number;
  hasOverflow: boolean;
  viewAllLink?: HumanSitemapViewAllLink;
}

export type HumanSitemapProps = HumanSitemapRenderOverrides;
