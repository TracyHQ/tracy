import type { Brand } from '@open-design/contracts';
/**
 * Render a Brand into DESIGN.md markdown with YAML frontmatter. The body's
 * Color Palette table and frontmatter `colors:` map both reference the same
 * hex values, so the registry's swatch extraction (frontmatter map OR table
 * row) resolves the palette either way.
 */
export declare function brandToDesignMd(brand: Brand): string;
/**
 * Short prose brand guide, stored alongside brand.json and surfaced as the
 * BrandDetailResponse `guide`. A light wrapper over the same fields — the rich
 * agent-authored guide can replace it during a later enrichment pass.
 */
export declare function brandGuideMd(brand: Brand): string;
