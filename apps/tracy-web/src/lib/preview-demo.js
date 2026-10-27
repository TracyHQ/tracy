/**
 * Whether the Add site preview door (`sites/design-system-preview.js`) has a demo to dress for a
 * quickstart, from the demo row it reads (`liveDemoOf` / `liveDemosByTag`, `lib/demo-sites.js`).
 * ONE predicate for the door and for the Road to live rule DEMO-1, so /ops says "no demo" exactly
 * when the customer's Add site panel gets no preview and no Design system picker (14/10/2026: Tracy
 * SaaS EmDash had a public demo a probe could read while the door answered NO_DEMO).
 *
 *   NO_DEMO  no published demo row on this server, or its address is not an http(s) URL;
 *   NO_SLOT  the row does not record a platform the door can dress.
 */
const PLATFORMS = new Set(['emdash', 'wordpress', 'joomla'])

/**
 * @param {{ address?: unknown, url?: unknown, platform?: unknown } | null | undefined} demo the row
 *   (`address`) or the road's entry of it (`url`)
 * @returns {'NO_DEMO' | 'NO_SLOT' | null} why the door would refuse, or null when it has a demo
 */
export function previewDemoGap(demo) {
  const address = demo?.address ?? demo?.url
  if (!demo || !address) return 'NO_DEMO'
  let pub
  try {
    pub = new URL(String(address))
  } catch {
    return 'NO_DEMO'
  }
  if (pub.protocol !== 'http:' && pub.protocol !== 'https:') return 'NO_DEMO'
  if (!PLATFORMS.has(String(demo.platform ?? ''))) return 'NO_SLOT'
  return null
}
