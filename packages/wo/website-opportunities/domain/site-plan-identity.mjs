// The identity half of the site plan (spec TracyHQ/tracy#189, ticket #193): what the site shows as the business's own
// logo, posts, social profiles and map. Every decision is made from the brief and the template's content map by ROLE,
// never by template, business or trade, and carries a reason code. Pure and deterministic.
//
// 🔒 REPLACEMENT ORDER: the owner's real data, then a neutral substitute (the name as text, hidden), never the demo value.
//   logo     the brief's logo, else the business name as text. The demo logo never stays.
//   posts    the brief's own posts replace the demo's; no posts of the brief hides every demo post. Nothing is invented.
//   socials  only the profiles the brief holds; the demo's other icons are taken off, none links to `#`.
//   map      the brief's address, else the map is taken off.
import { heldKindsOf } from './brief-readiness.mjs'

/** Reason codes of the identity decisions, with the sentence a report shows for each. */
export const IDENTITY_REASONS = Object.freeze({
  'brief-logo': 'the brief holds the business’s logo',
  'name-as-text': 'the brief holds no logo, so the business name is shown as text',
  'no-logo-no-name': 'the brief holds neither a logo nor a name, so the template keeps its own',
  'brief-posts': 'the brief holds the business’s own posts, which replace the demo’s',
  'no-posts': 'the brief holds no posts, so every demo post is taken off',
  'brief-socials': 'the brief holds these social profiles; the demo’s other icons are taken off',
  'no-socials': 'the brief holds no social profile, so every demo social icon is taken off',
  'brief-place': 'the brief holds the business’s Google place, so the map shows it',
  'brief-address': 'the brief holds an address, so the map shows it',
  'no-address': 'the brief holds no address, so the demo’s map is taken off'
})

/** The post roles of a demo article: the entity of such a slot is a post of the blog, not a page. */
const POST_ROLES = new Set(['article.title', 'article.lead', 'article.image', 'article.date'])

/** Networks a brief names as `business.socials`, in the order a site lists them. */
const NETWORKS = [
  'facebook',
  'instagram',
  'x',
  'twitter',
  'tiktok',
  'youtube',
  'linkedin',
  'pinterest',
  'telegram'
]

const text = (v) => (typeof v === 'string' ? v.trim() : '')
const isUrl = (v) => /^https?:\/\//i.test(text(v))

/** Whether `value` is the file of a logo: its words say so. */
const fileOf = (value) =>
  String(value ?? '').match(/images\/[^"'?#\s)]+\.(?:jpe?g|png|webp|svg|gif|avif)/i)?.[0] ?? null

function logoOf(brief, contentMap) {
  const name = text(brief?.business?.name)
  // The files the template's own logo slots carry: what the engine takes off wherever no logo of the business replaces it.
  const demoFiles = [
    ...new Set(
      (contentMap?.slots ?? [])
        .filter((s) => s?.type === 'image' && s.role === 'business.logo')
        .map((s) => fileOf(s.sample))
        .filter(Boolean)
    )
  ]
  const asset = text(brief?.brand?.logo)
  if (asset) return { decision: 'brief-logo', reason: 'brief-logo', assetId: asset, demoFiles }
  if (name) return { decision: 'name-as-text', reason: 'name-as-text', name, demoFiles }
  return { decision: 'keep', reason: 'no-logo-no-name', demoFiles }
}

/** The demo articles that are posts of the blog: entities `article-N` whose slots carry post roles. */
export function demoPostsOf(contentMap) {
  const posts = new Map()
  for (const slot of contentMap?.slots ?? []) {
    const m = /^article-(\d+)$/.exec(String(slot?.entity ?? ''))
    if (!m || !POST_ROLES.has(slot.role)) continue
    const row = posts.get(m[1]) ?? { id: Number(m[1]), title: '' }
    if (slot.role === 'article.title' && typeof slot.sample === 'string') row.title = slot.sample.trim()
    posts.set(m[1], row)
  }
  return [...posts.values()].sort((a, b) => a.id - b.id)
}

function postsOf(brief, contentMap) {
  const demoArticles = demoPostsOf(contentMap)
  const own = heldKindsOf(brief).has('post')
  return own
    ? { decision: 'replace', reason: 'brief-posts', demoArticles }
    : { decision: 'hide', reason: 'no-posts', demoArticles }
}

function socialsOf(brief) {
  const held =
    brief?.business?.socials && typeof brief.business.socials === 'object' ? brief.business.socials : {}
  const keep = {}
  for (const net of NETWORKS) if (isUrl(held[net])) keep[net === 'twitter' ? 'x' : net] = text(held[net])
  const any = Object.keys(keep).length > 0
  return { decision: any ? 'keep' : 'hide', reason: any ? 'brief-socials' : 'no-socials', keep }
}

/** The map embed address of a place: Google's own keyless embed of a search. */
export const mapEmbedUrl = (address) =>
  `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`

/** The embed of a Google place by its id (keyless form), or by its cid when only a maps link is held. */
export const mapPlaceEmbedUrl = (placeId) =>
  `https://www.google.com/maps?q=${encodeURIComponent(`place_id:${placeId}`)}&output=embed`
const mapCidEmbedUrl = (cid) => `https://www.google.com/maps?cid=${encodeURIComponent(cid)}&output=embed`

function mapOf(brief) {
  const placeId = text(brief?.googlePlace?.placeId)
  if (/^[A-Za-z0-9_-]{4,200}$/.test(placeId))
    return { decision: 'place', reason: 'brief-place', placeId, embed: mapPlaceEmbedUrl(placeId) }
  const cid = /[?&]cid=(\d{5,30})/.exec(text(brief?.googlePlace?.googleMapsUri))?.[1]
  if (cid) return { decision: 'place', reason: 'brief-place', cid, embed: mapCidEmbedUrl(cid) }
  const address = text(brief?.business?.address)
  return address
    ? { decision: 'address', reason: 'brief-address', address, embed: mapEmbedUrl(address) }
    : { decision: 'hide', reason: 'no-address' }
}

/**
 * @param {object} brief
 * @param {{slots?: any[]} | null} [contentMap]
 */
export function planIdentity(brief, contentMap = null) {
  return {
    logo: logoOf(brief, contentMap),
    posts: postsOf(brief, contentMap),
    socials: socialsOf(brief),
    map: mapOf(brief)
  }
}
