// hreflang alternates are decided by the template, not by EmDash's url-pattern guess: the
// layout (Base.astro) works out one URL per locale for the page it is rendering -- the
// translation's real route for content pages, the mirrored path for archives and other custom
// pages, the same `?page=` for paginated lists -- and stores them on the page context under
// ALTERNATES_KEY. The plugin in ./hreflang-plugin.ts turns them into <link rel="alternate">
// contributions; plugin contributions win over EmDash's own hreflang links (first-wins, keyed
// by hreflang), so the two never disagree.
export interface Alternate {
  hreflang: string
  href: string
}

/** Where Base.astro leaves the alternates for the plugin to read. */
export const ALTERNATES_KEY = 'tracyAlternates'

// 🔒 THE TEMPLATE'S OWN HEAD POLICY, AND WHY IT RIDES ON THE PAGE CONTEXT. From EmDash 0.38 `<EmDashHead>`
// overlays the entry's SEO panel (description, canonical, image, robots) onto the page context before
// anything reads it — an editor's panel value replaces what Base.astro computed. Lee's call (20/09/2026):
// the TEMPLATE wins. Base.astro records what it decided under this key, and the plugin re-emits those as
// contributions; plugin contributions sit before the base layer in resolvePageMetadata's first-wins
// dedup, so they render even when the panel is filled in. Fields the template leaves unset still fall
// through to the panel — the policy is 'ours where we have one', not 'the panel is ignored'.
export const HEAD_POLICY_KEY = 'tracyHeadPolicy'
export type HeadPolicy = {
  title: string
  description?: string
  canonical?: string
  image?: string
  robots: string
}

/**
 * Plugin descriptor for astro.config.mjs. EmDash's integration needs a module `entrypoint` it can
 * bundle (an in-process `definePlugin()` result is refused), so the config passes the file path.
 */
export function hreflangPlugin(entrypoint: string) {
  return {
    id: 'tracy-hreflang',
    version: '0.1.0',
    format: 'native' as const,
    entrypoint,
    capabilities: [] as string[]
  }
}
