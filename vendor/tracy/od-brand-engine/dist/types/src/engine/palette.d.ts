/**
 * Palette engine — a faithful, dependency-free port of @ant-design/colors'
 * `generate()` HSV algorithm (the L1 "color algorithm" of the brand framework,
 * see docs/brand-framework.md §1/§5).
 *
 * One seed color → a deterministic 10-step ladder `[5 lighter, base, 4 darker]`
 * where index 5 ≈ the seed. The same algorithm, run on a dark background with
 * the `darkColorMap` blend, yields the dark-theme ladder. This is the single
 * source of color for the whole derived token system: derive.ts feeds primary
 * and every functional color through `generate()`; the 13 `presets` give ready
 * palettes for charts / tags / sub-brands.
 *
 * No external packages: the HSV/RGB conversions are inlined to match
 * tinycolor's rounding so the canonical blue ladder reproduces exactly.
 */
/**
 * Generate the 10-step palette for a seed color.
 * Returns lowercase `#rrggbb`, index 5 ≈ the input. In dark mode each light
 * step is re-blended onto `backgroundColor` (default #141414) via darkColorMap.
 */
export declare function generate(baseColor: string, opts?: {
    theme?: "default" | "dark";
    backgroundColor?: string;
}): string[];
export declare const presets: Record<string, string[]>;
