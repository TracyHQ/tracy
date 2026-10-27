import type { PluginDescriptor } from "emdash";

import {
  HUMAN_SITEMAP_PLUGIN_ID,
  HUMAN_SITEMAP_VERSION,
  type HumanSitemapPluginOptions,
} from "./types.js";

export function humanSitemap(
  options: HumanSitemapPluginOptions = {},
): PluginDescriptor<HumanSitemapPluginOptions> {
  return {
    id: HUMAN_SITEMAP_PLUGIN_ID,
    version: HUMAN_SITEMAP_VERSION,
    entrypoint: "@masonjames/emdash-human-sitemap",
    componentsEntry: "@masonjames/emdash-human-sitemap/astro",
    format: "native",
    options,
  };
}

export default humanSitemap;

export type * from "./types.js";
