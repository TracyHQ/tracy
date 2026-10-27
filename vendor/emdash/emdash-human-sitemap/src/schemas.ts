import {
  DEFAULT_HUMAN_SITEMAP_LAYOUT,
  DEFAULT_HUMAN_SITEMAP_SHOW_COUNTS_MODE,
  type HumanSitemapBlockValue,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeHumanSitemapBlock(value: unknown): HumanSitemapBlockValue | null {
  if (!isRecord(value) || value._type !== "humanSitemap") {
    return null;
  }

  return {
    _type: "humanSitemap",
    _key: optionalString(value._key),
    title: optionalString(value.title),
    showCollections:
      typeof value.showCollections === "boolean" ? value.showCollections : true,
    showMenus: typeof value.showMenus === "boolean" ? value.showMenus : true,
    showTaxonomies:
      typeof value.showTaxonomies === "boolean" ? value.showTaxonomies : true,
    showCountsMode:
      value.showCountsMode === "show" ||
      value.showCountsMode === "hide" ||
      value.showCountsMode === "inherit"
        ? value.showCountsMode
        : DEFAULT_HUMAN_SITEMAP_SHOW_COUNTS_MODE,
    layout:
      value.layout === "compact" || value.layout === "expanded"
        ? value.layout
        : DEFAULT_HUMAN_SITEMAP_LAYOUT,
  };
}
