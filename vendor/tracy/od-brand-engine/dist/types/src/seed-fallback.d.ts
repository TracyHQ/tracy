import type { BrandColor, BrandFontSpec } from '@open-design/contracts';
import { type ColorCandidate } from './prefetch.js';
/** The mutable seed shape the harvester fills in (a subset of `Brand`). */
export interface SeedSlot {
    colors?: BrandColor[];
    typography?: {
        display?: BrandFontSpec;
        body?: BrandFontSpec;
        mono?: BrandFontSpec;
    };
}
/** Signature of {@link ensureBrandSeed}; injectable so tests avoid network. */
export type SeedFallbackFn = (siteUrl: string, seed: SeedSlot) => Promise<{
    changed: boolean;
}>;
/**
 * Derive an initial seven-role palette from frequency-ranked color literals and
 * an optional `theme-color`. Heuristic and best-effort: it never fabricates a
 * palette from memory — every role traces to a measured color (or a blend of
 * two measured colors). Returns [] when no usable color was measured so the kit
 * keeps its palette skeletons rather than showing a fake palette.
 */
export declare function deriveSeedPalette(candidates: ColorCandidate[], themeColor?: string | null): BrandColor[];
/**
 * Derive an initial display / body / (mono) typography block from the measured
 * font families. The most frequent serif/display-ish family becomes display and
 * the most frequent sans-ish family becomes body; a measured mono family fills
 * mono. Returns null when no real family was measured.
 */
export declare function deriveSeedTypography(fonts: Array<{
    family: string;
}>, fontFaceFamilies: string[], googleFontsUrls: string[]): SeedSlot['typography'] | null;
/**
 * Harvest the site's CSS server-side and seed an initial palette + typography
 * into `seed` when those fields are still empty. Mutates and returns
 * `{ changed }`. No-op when the seed already carries colors/typography or when
 * nothing measurable could be fetched. Best-effort; never throws.
 */
export declare function ensureBrandSeed(siteUrl: string, seed: SeedSlot): Promise<{
    changed: boolean;
}>;
