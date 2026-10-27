/**
 * Public entry point for the brand engine. Import everything from here:
 *
 *   import { buildFromUrl, deriveTokens, renderArtifact } from "./engine/index.js";
 *
 * The pipeline (see types.ts):
 *   URL / Brand ─▶ Seed ─▶ DesignTokens (default|dark|compact)
 *               ─▶ export (json/css/theme) ─▶ kit (components) ─▶ artifacts (products)
 */
export type { SeedToken, ThemeAlgorithm, ColorTokenSet, DesignTokens, BrandSystem, } from "./types.js";
export { CSS_VAR_PREFIX, cssVar, varRef, formatTokenValue, flattenTokens } from "./types.js";
export { generate, presets } from "./palette.js";
export { defaultSeed, seedFromBrand, seedFromMaterial } from "./seed.js";
export { deriveTokens, defaultThemeAlgorithm } from "./derive.js";
export { tokensToJson, tokensToCssVars, tokensToThemeJson } from "./export.js";
export { button, card, input, tag, alert, swatches, typeScale, renderKitPage, } from "./kit.js";
export { renderArtifact, renderArtifactGallery, brandFontAssets } from "./artifacts/index.js";
export { buildBrandSystem, buildFromUrl, writeBrandSystem, slugify } from "./build.js";
