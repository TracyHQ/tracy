/**
 * Hand-written types for `index.mjs`, for a consumer package with no `allowJs`/`checkJs` (Task
 * 11 review, fix round 1 — the old SPA's `tsconfig.json`, package since deleted, had neither, and
 * a `.d.ts` twin was the fix the review specified: NOT turning `allowJs` on for a whole package just to read one
 * sibling library file's JSDoc).
 *
 * Kept in sync BY HAND with `index.mjs`'s own `@typedef Config` and `tracyConfig`'s signature —
 * there is no build step that generates this from the JSDoc, so a shape change to one must carry
 * the same change to the other.
 */

export interface Config {
  origin: string
  siteDomain: string
  siteDomainAliases: string[]
  sitePort: string
  cookieDomain: string
  badgeUrl: string
  hostOrg: string
}

export function tracyConfig(options?: { fetch?: typeof globalThis.fetch }): Promise<Config>
