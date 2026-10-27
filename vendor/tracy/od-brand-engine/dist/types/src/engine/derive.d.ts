/**
 * derive.ts — the heart of the engine.
 *
 * Takes a tiny SeedToken (~20 fields) and DERIVES the full DesignTokens style
 * system, exactly the way Ant Design turns ~30 seeds into hundreds of map
 * tokens. Nothing here is hand-authored; every value traces back to a seed via
 * a deterministic algorithm. The three theme algorithms (default / dark /
 * compact) are the SAME seed run through different math — that is what makes
 * "light / dark / compact" variants instead of three separate hand-built sets.
 *
 * Pipeline (see types.ts):  SeedToken ──deriveTokens(algorithm)──▶ DesignTokens
 *
 * Algorithms implemented inline (no separate algorithms.ts):
 *   - "default": light theme, neutral alpha over #000 / #fff.
 *   - "dark":    colorTextBase/colorBgBase flipped (white text on near-black
 *                #141414); palettes built with generate(c,{theme:"dark",...});
 *                darker neutral alpha ladder.
 *   - "compact": same colors as default; size / control / padding ladders
 *                tightened (controlHeight 28, smaller spacing steps).
 *
 * The color ladder → semantic mapping uses the 0-based indices documented on
 * ColorTokenSet in types.ts: bg=[0] bgHover=[1] border=[2] borderHover=[3]
 * hover=[4] base=[5] active=[6] text=[8].
 */
import type { DesignTokens, SeedToken, ThemeAlgorithm } from "./types.js";
/** White on the colour when it reads at 3:1 (the UI-component floor), else black. */
export declare function onColor(hex: string): string;
/** The colour as text on `bg` when it reads at 4.5:1, else the darker `fallback`. */
export declare function inkColor(hex: string, bg: string, fallback: string): string;
/**
 * The effective ConfigProvider algorithm for a seed's DEFAULT theme. A
 * dark-first seed derives its default `tokens.default.json`, `variables.css`,
 * and `kit.html` with dark palette + neutral math (see `deriveTokens` below),
 * so the exported `theme.json` must carry `"dark"` to stay consistent with
 * them — otherwise a ConfigProvider consumer applies the light algorithm to a
 * dark canvas. Light and ambiguous seeds stay `"default"`. This is the single
 * shared decision every `theme.json` producer must route through.
 */
export declare function defaultThemeAlgorithm(seed: SeedToken): ThemeAlgorithm;
/**
 * Derive the complete DesignTokens style system from a SeedToken.
 *
 * @param seed       the minimal brand input surface.
 * @param algorithm  "default" (light) | "dark" | "compact". Defaults to "default".
 */
export declare function deriveTokens(seed: SeedToken, algorithm?: ThemeAlgorithm): DesignTokens;
