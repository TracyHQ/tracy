import HumanSitemap from "./HumanSitemap.astro";
import HumanSitemapBlock from "./HumanSitemapBlock.astro";

export { HumanSitemap, HumanSitemapBlock };
export type { HumanSitemapProps } from "../types.js";

export const blockComponents = {
  humanSitemap: HumanSitemapBlock,
} as const;
