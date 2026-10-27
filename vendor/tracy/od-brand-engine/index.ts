/**
 * @tracy/od-brand-engine — OpenDesign's brand pipeline, vendored verbatim under `src/` and
 * `contracts/` (Apache-2.0, commit 3d0d15fc, see NOTICE), with Tracy's entry and token mapping
 * beside it. Nothing under `src/` or `contracts/` is Tracy's to edit.
 *
 *   URL ──prefetchBrand──▶ material ──seedFromMaterial──▶ seed ──deriveTokens──▶ 218 tokens
 *                                    └─brandFromMaterial─▶ brand ──brandToDesignMd──▶ DESIGN.md
 *   buildFromUrl(url) runs the whole chain and returns a BrandSystem { files } — kit, kit.dark,
 *   six artifacts, variables.css, tokens.*.json. writeBrandSystem puts it on disk.
 *
 * Tracy adds `tracyTokensCss(tokens)`: the 56-token `tokens.css` the 152 vendored systems speak,
 * so a brand extracted from a URL stands in the library as one more direction (spec-brand-engine §3.1).
 */
export {
  buildBrandSystem,
  buildFromUrl,
  defaultSeed,
  defaultThemeAlgorithm,
  deriveTokens,
  renderArtifact,
  seedFromBrand,
  seedFromMaterial,
  slugify,
  tokensToCssVars,
  tokensToJson,
  writeBrandSystem
} from './src/engine/index.js'
export type { BrandSystem, DesignTokens, SeedToken, ThemeAlgorithm } from './src/engine/types.js'
export { brandFromMaterial } from './src/provisional.js'
export { brandGuideMd, brandToDesignMd } from './src/design-md.js'
export { isChallengePage, prefetchBrand, prefetchFromHtml } from './src/prefetch.js'
export type { PrefetchProgress, PrefetchResult } from './src/prefetch.js'
export { luminance, saturation } from './src/seed.js'
// The three deterministic server-side harvesters upstream runs before its agent (logo icons, hero
// imagery, a CSS seed) — no LLM in any of them; NOTICE said otherwise until 06/09 and was wrong.
export { adoptExistingLogos, ensureLogoFallback, harvestFallbackLogos } from './src/logo-fallback.js'
export type { LogoSlot } from './src/logo-fallback.js'
export { ensureImageryFallback, harvestSiteImagery } from './src/imagery-fallback.js'
export type { ImagerySlot } from './src/imagery-fallback.js'
export { ensureBrandSeed } from './src/seed-fallback.js'
export { harvestFonts, readFontManifest, selfHostGoogleFonts } from './src/fonts.js'
export type { FontFile } from './src/fonts.js'
export { validateBrand } from './src/validate.js'
// The SSRF-guarded fetch the harvester uses, for Tracy's own crawler (tracy-brand-engine/src/host/crawl.mjs):
// one guard for every request that leaves the lane towards a customer-named host.
export { assertPublicBrandUrl, fetchExternalBrandAsset } from './src/safe-fetch.js'
export type { Brand, BrandColor, BrandFontSpec } from './contracts/api/brands.js'
export { tracyTokensCss, TRACY_TOKEN_NAMES } from './tracy-tokens.js'
export { markdownToHtml, renderTypography } from './tracy-typography.js'
