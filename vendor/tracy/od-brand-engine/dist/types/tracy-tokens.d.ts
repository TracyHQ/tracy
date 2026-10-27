/**
 * Tracy's mapping: the engine's 218 `--brand-*` DesignTokens → the 56 tokens every one of the 152
 * vendored systems declares in `tokens.css` (spec-brand-engine §3.1). With this file a brand pulled
 * from a URL is a direction like the others: same cards, same dialog, same slots, same Guideline.
 *
 * Every line here is a DESIGN DECISION of Tracy's, not a fact from upstream — `test/tracy-tokens.test.mjs`
 * pins each one. The rule of thumb: colour and type come from the derived tokens; rhythm (containers,
 * section padding) takes the values the 152 systems agree on, because the engine has no notion of a
 * page section.
 */
import type { DesignTokens } from './src/engine/types.js';
/** The 56 names, in the order `tokens.css` files list them. `TRACY_TOKEN_NAMES.length === 56` is tested. */
export declare const TRACY_TOKEN_NAMES: readonly ["--accent", "--accent-active", "--accent-hover", "--accent-on", "--bg", "--border", "--border-soft", "--container-gutter-desktop", "--container-gutter-phone", "--container-gutter-tablet", "--container-max", "--danger", "--ease-standard", "--elev-flat", "--elev-raised", "--elev-ring", "--fg", "--fg-2", "--focus-ring", "--font-body", "--font-display", "--font-mono", "--leading-body", "--leading-tight", "--meta", "--motion-base", "--motion-fast", "--muted", "--radius-lg", "--radius-md", "--radius-pill", "--radius-sm", "--section-y-desktop", "--section-y-phone", "--section-y-tablet", "--space-1", "--space-12", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-8", "--success", "--surface", "--surface-warm", "--text-2xl", "--text-3xl", "--text-4xl", "--text-base", "--text-lg", "--text-sm", "--text-xl", "--text-xs", "--tracking-display", "--warn"];
export declare function tracyTokens(t: DesignTokens, display?: string | null): Record<(typeof TRACY_TOKEN_NAMES)[number], string>;
/** `tokens.css` in the shape the 152 systems ship: one `:root` block, names sorted as they list them. */
export declare function tracyTokensCss(t: DesignTokens, display?: string | null): string;
