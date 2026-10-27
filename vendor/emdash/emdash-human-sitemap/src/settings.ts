import {
  DEFAULT_HUMAN_SITEMAP_LAYOUT,
  DEFAULT_HUMAN_SITEMAP_SHOW_COUNTS_MODE,
  DEFAULT_HUMAN_SITEMAP_SORT,
  DEFAULT_HUMAN_SITEMAP_TITLE,
  DEFAULT_INCLUDED_COLLECTIONS_TEXT,
  DEFAULT_INCLUDED_MENUS_TEXT,
  DEFAULT_INCLUDE_TAXONOMIES,
  DEFAULT_MAX_ITEMS_PER_SECTION,
  DEFAULT_SHOW_COUNTS,
  HUMAN_SITEMAP_PLUGIN_ID,
  MAX_ITEMS_PER_SECTION,
  MIN_ITEMS_PER_SECTION,
  type HumanSitemapBlockValue,
  type HumanSitemapRenderOverrides,
  type HumanSitemapResolvedOptions,
  type HumanSitemapSettings,
  type HumanSitemapShowCountsMode,
  type IncludedCollectionConfig,
  type IncludedMenuConfig,
} from "./types.js";

interface ParsedLineConfig {
  value: string;
  label?: string;
}

export const DEFAULT_HUMAN_SITEMAP_SETTINGS: HumanSitemapSettings = {
  includedCollections: [{ slug: "pages" }, { slug: "posts" }],
  includedMenus: [{ name: "primary" }],
  includeTaxonomies: DEFAULT_INCLUDE_TAXONOMIES,
  showCounts: DEFAULT_SHOW_COUNTS,
  maxItemsPerSection: DEFAULT_MAX_ITEMS_PER_SECTION,
  defaultSort: DEFAULT_HUMAN_SITEMAP_SORT,
};

export type HumanSitemapSettingsProvider = () => Promise<Record<string, unknown>>;

export function clampMaxItems(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_ITEMS_PER_SECTION;
  }

  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, MIN_ITEMS_PER_SECTION), MAX_ITEMS_PER_SECTION);
}

export function normalizeOptionalTitle(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseConfiguredLines(input: string): ParsedLineConfig[] {
  const parsed: ParsedLineConfig[] = [];
  const seen = new Set<string>();

  for (const rawLine of input.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const [rawValue, ...labelParts] = line.split("|");
    const value = rawValue?.trim();
    if (!value || seen.has(value)) continue;

    const label = labelParts.join("|").trim();
    parsed.push({ value, label: label || undefined });
    seen.add(value);
  }

  return parsed;
}

function toCollectionConfig(parsed: ParsedLineConfig[]): IncludedCollectionConfig[] {
  return parsed.map(({ value, label }) => ({
    slug: value,
    ...(label ? { label } : {}),
  }));
}

function toMenuConfig(parsed: ParsedLineConfig[]): IncludedMenuConfig[] {
  return parsed.map(({ value, label }) => ({
    name: value,
    ...(label ? { label } : {}),
  }));
}

function normalizeCollections(value: unknown): IncludedCollectionConfig[] {
  if (value === undefined || value === null) {
    return DEFAULT_HUMAN_SITEMAP_SETTINGS.includedCollections;
  }

  if (typeof value !== "string") {
    return DEFAULT_HUMAN_SITEMAP_SETTINGS.includedCollections;
  }

  return toCollectionConfig(parseConfiguredLines(value));
}

function normalizeMenus(value: unknown): IncludedMenuConfig[] {
  if (value === undefined || value === null) {
    return DEFAULT_HUMAN_SITEMAP_SETTINGS.includedMenus;
  }

  if (typeof value !== "string") {
    return DEFAULT_HUMAN_SITEMAP_SETTINGS.includedMenus;
  }

  return toMenuConfig(parseConfiguredLines(value));
}

export function normalizeHumanSitemapSettings(
  rawSettings: Record<string, unknown> = {},
): HumanSitemapSettings {
  return {
    includedCollections: normalizeCollections(rawSettings.includedCollections),
    includedMenus: normalizeMenus(rawSettings.includedMenus),
    includeTaxonomies:
      typeof rawSettings.includeTaxonomies === "boolean"
        ? rawSettings.includeTaxonomies
        : DEFAULT_INCLUDE_TAXONOMIES,
    showCounts:
      typeof rawSettings.showCounts === "boolean" ? rawSettings.showCounts : DEFAULT_SHOW_COUNTS,
    maxItemsPerSection: clampMaxItems(rawSettings.maxItemsPerSection),
    defaultSort:
      rawSettings.defaultSort === "date" || rawSettings.defaultSort === "alphabetical"
        ? rawSettings.defaultSort
        : DEFAULT_HUMAN_SITEMAP_SORT,
  };
}

async function defaultSettingsProvider(): Promise<Record<string, unknown>> {
  const { getPluginSettings } = await import("emdash");
  return getPluginSettings(HUMAN_SITEMAP_PLUGIN_ID);
}

export async function loadHumanSitemapSettings(
  settingsProvider: HumanSitemapSettingsProvider = defaultSettingsProvider,
): Promise<HumanSitemapSettings> {
  const rawSettings = await settingsProvider();
  return normalizeHumanSitemapSettings(rawSettings);
}

export function resolveShowCountsMode(
  mode: HumanSitemapShowCountsMode = DEFAULT_HUMAN_SITEMAP_SHOW_COUNTS_MODE,
): boolean | undefined {
  if (mode === "show") return true;
  if (mode === "hide") return false;
  return undefined;
}

export function resolveHumanSitemapOptions(
  settings: HumanSitemapSettings,
  overrides: HumanSitemapRenderOverrides = {},
): HumanSitemapResolvedOptions {
  const normalizedTitle = normalizeOptionalTitle(overrides.title);

  return {
    title: normalizedTitle === undefined ? DEFAULT_HUMAN_SITEMAP_TITLE : normalizedTitle,
    showCollections: overrides.showCollections ?? settings.includedCollections.length > 0,
    showMenus: overrides.showMenus ?? settings.includedMenus.length > 0,
    showTaxonomies: overrides.showTaxonomies ?? settings.includeTaxonomies,
    showCounts: overrides.showCounts ?? settings.showCounts,
    layout: overrides.layout ?? DEFAULT_HUMAN_SITEMAP_LAYOUT,
    maxItemsPerSection: clampMaxItems(
      overrides.maxItemsPerSection ?? settings.maxItemsPerSection,
    ),
    defaultSort: overrides.sort ?? settings.defaultSort,
    includedCollections: settings.includedCollections,
    includedMenus: settings.includedMenus,
    className: overrides.class,
    viewAllLinks: overrides.viewAllLinks ?? {},
    collectionHrefBuilder: overrides.collectionHrefBuilder,
    taxonomyHrefBuilder: overrides.taxonomyHrefBuilder,
  };
}

export function blockToRenderOverrides(
  block: HumanSitemapBlockValue,
): HumanSitemapRenderOverrides {
  return {
    title: normalizeOptionalTitle(block.title),
    showCollections: block.showCollections,
    showMenus: block.showMenus,
    showTaxonomies: block.showTaxonomies,
    showCounts: resolveShowCountsMode(block.showCountsMode),
    layout: block.layout,
  };
}

export const humanSitemapSettingsSchemaDefaults = {
  includedCollections: DEFAULT_INCLUDED_COLLECTIONS_TEXT,
  includedMenus: DEFAULT_INCLUDED_MENUS_TEXT,
  includeTaxonomies: DEFAULT_INCLUDE_TAXONOMIES,
  showCounts: DEFAULT_SHOW_COUNTS,
  maxItemsPerSection: DEFAULT_MAX_ITEMS_PER_SECTION,
  defaultSort: DEFAULT_HUMAN_SITEMAP_SORT,
} as const;
