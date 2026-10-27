import type { PrefetchResult } from './prefetch.js';
export type BrandSeed = {
    colorPrimary: string;
    /** A distinct secondary/link color, or "" when none stands out. */
    colorLink: string;
    colorTextBase: string;
    colorBgBase: string;
    /** First measured font family, or "" when none was harvested. */
    primaryFontFamily: string;
};
/** Normalize a #rgb/#rrggbb (with optional alpha) string to lowercase #rrggbb, or null. */
export declare function normalizeHex(raw: string): string | null;
type RGB = {
    r: number;
    g: number;
    b: number;
};
export declare function hexToRgb(hex: string): RGB;
/** Perceptual lightness 0..1 (Rec.709 luma). 1 = white, 0 = black. */
export declare function luminance(hex: string): number;
/** HSV saturation 0..1 (chroma / max channel). Greys → ~0. */
export declare function saturation(hex: string): number;
/** HSV value 0..1 (max channel). */
export declare function value(hex: string): number;
/**
 * Score a color candidate as a brand-primary contender. Higher is better.
 * Rewards usage frequency (log-damped so a single ubiquitous border color
 * can't dominate) and mid/high saturation in a comfortable value band; hard
 * rejects extremes and washed-out greys by returning a very negative score.
 */
export declare function primaryScore(hex: string, count: number): number;
/**
 * Deterministically infer a small brand seed from raw prefetch material.
 * Same input always yields the same seed — no Date/random, no network.
 */
export declare function seedFromMaterial(material: PrefetchResult): BrandSeed;
export {};
