/**
 * Serializers for the derived style system. Given the DesignTokens (or the
 * upstream SeedToken) this module emits the three portable artifacts a
 * consumer needs:
 *
 *   DesignTokens ──tokensToJson──▶      tokens.json      (raw, inspectable)
 *   DesignTokens ──tokensToCssVars──▶   variables.css    (--brand-* custom props)
 *   SeedToken    ──tokensToThemeJson──▶ theme.json       (antd ConfigProvider)
 *
 * The flattening / css-var naming is owned by ./types (flattenTokens), so the
 * CSS output stays 1:1 with what kit & artifacts reference via varRef(). This
 * module is a pure formatter — it never imports another engine implementation
 * module (no palette/seed/derive/kit), only the frozen ./types contract.
 */
import { type DesignTokens, type SeedToken, type ThemeAlgorithm } from "./types.js";
/** Pretty-print the full token set as JSON (the canonical `tokens.json`). */
export declare function tokensToJson(tokens: DesignTokens): string;
/**
 * Emit the tokens as a CSS custom-property block, e.g.
 * `:root { --brand-color-primary: #1677ff; ... }`. Names & values come straight
 * from flattenTokens so they match every varRef("colorPrimary") in the kit.
 */
export declare function tokensToCssVars(tokens: DesignTokens, selector?: string): string;
/**
 * Emit an Ant Design `ConfigProvider` theme object as JSON. The seed maps
 * almost 1:1 onto antd's seed-token surface, so we forward the primitive seed
 * fields (colors, font, radius, control height, line width, motion unit) and
 * record which algorithm to apply. Empty colorLink is dropped so antd derives
 * it from colorInfo, mirroring our derive-time fallback.
 */
export declare function tokensToThemeJson(seed: SeedToken, algorithm?: ThemeAlgorithm): string;
