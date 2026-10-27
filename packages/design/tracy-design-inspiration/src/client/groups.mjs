/**
 * Tracy's groups over OpenDesign's categories (Lee, 06/09/2026: "22 categories is how OpenDesign
 * sorts its shelf, not how a customer picks an inspiration for their site").
 *
 * Plain `.mjs`, not `.ts`, so `test/groups.test.mjs` can import it next to `catalog.json` and
 * prove every upstream category lands in exactly one group. A category the catalog gains later
 * that is in no group would otherwise just not be in the picker — no error, no chip, a set of
 * inspirations nobody can filter to.
 *
 * `id` is the i18n key's tail (`group.<id>`); `members` are the catalog's own `category` strings,
 * verbatim. The first group holds the site's own brand and the Brand builder's references — the
 * two categories `@tracy/dsh-brand-engine` writes into `manifest.json` — and leads the picker.
 */

/** The category the brand engine gives the customer's own inspiration. */
export const OWN_CATEGORY = 'Your brand'
/** The category it gives an inspiration extracted from someone else's site. */
export const REFERENCE_CATEGORY = 'Reference'
/**
 * The category worn by an inspiration read off the public community shelf — every site any lane has
 * ever measured, published to `TracyHQ/design-inspirations` (TCH ADR 0013). It is a group of its
 * own rather than a member of `brand` because it is nobody's brand: the picker's first row is "the
 * site I am working on", and a stranger's domain does not belong under that heading. Empty on a
 * lane, so the row does not appear there.
 */
export const COMMUNITY_CATEGORY = 'Community'

/** @type {{ id: 'provider' | 'brand' | 'community' | 'product' | 'business' | 'creative' | 'minimal' | 'media', members: string[] }[]} */
/** Who publishes a card — the two publishers today. A filter axis beside the categories. */
export const PROVIDERS = ['Tracy', 'JoomlArt']

export const GROUPS = [
  { id: 'provider', members: PROVIDERS },
  { id: 'brand', members: [OWN_CATEGORY, REFERENCE_CATEGORY] },
  { id: 'community', members: [COMMUNITY_CATEGORY] },
  { id: 'product', members: ['AI & LLM', 'Productivity & SaaS', 'Developer Tools', 'Backend & Data'] },
  {
    id: 'business',
    members: ['Professional & Corporate', 'Fintech & Crypto', 'Automotive', 'E-Commerce & Retail']
  },
  {
    id: 'creative',
    members: [
      'Creative & Artistic',
      'Bold & Expressive',
      'Themed & Unique',
      'Design & Creative',
      'Retro & Nostalgic',
      'Editorial & Print',
      'Editorial / Personal / Publication',
      'Editorial · Studio'
    ]
  },
  { id: 'minimal', members: ['Modern & Minimal', 'Morphism & Effects', 'Layout & Structure', 'Starter'] },
  { id: 'media', members: ['Media & Consumer', 'Social & Messaging'] }
]

/** @typedef {(typeof GROUPS)[number]} Group */

/**
 * A parent's state from its members: `on` when every member is ticked, `part` when some are.
 * @param {Group} group
 * @param {ReadonlySet<string>} ticked - the ticked categories.
 * @returns {'on' | 'part' | 'off'}
 */
export function stateOf(group, ticked) {
  const n = group.members.filter((m) => ticked.has(m)).length
  return n === 0 ? 'off' : n === group.members.length ? 'on' : 'part'
}

/**
 * Ticking a parent ticks every member; ticking a fully ticked parent clears them (Lee, 06/09 09:02).
 * @param {Group} group
 * @param {ReadonlySet<string>} ticked
 * @returns {Set<string>}
 */
export function toggleGroup(group, ticked) {
  const next = new Set(ticked)
  if (stateOf(group, ticked) === 'on') for (const m of group.members) next.delete(m)
  else for (const m of group.members) next.add(m)
  return next
}

/**
 * @template T
 * @param {ReadonlySet<T>} set
 * @param {T} value
 * @returns {Set<T>}
 */
export function toggle(set, value) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/**
 * The i18n key of a catalog category: `category-<slug>`, the slug being the lowercase words of the
 * category joined by dashes (`AI & LLM` → `category-ai-llm`). Categories are the catalog's own
 * English strings; this is how they reach the reader translated (spec #730).
 * @param {string} name - a `category` string, verbatim.
 * @returns {string}
 */
export function categoryKey(name) {
  return `category-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

/**
 * A category as the reader sees it: its translation when the namespace has one, else the catalog's
 * own string (a publisher name like "JoomlArt", or a category the catalog gained after the last
 * translation, which `test/groups.test.mjs` then flags).
 * @param {(key: any) => string} t - the plugin's translate function (any key type: each plugin types its own).
 * @param {string} name - a `category` string, verbatim.
 * @returns {string}
 */
export function categoryLabel(t, name) {
  const key = categoryKey(name)
  const text = t(key)
  return text === key ? name : text
}
