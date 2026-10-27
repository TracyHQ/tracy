/**
 * WHAT A WHOLE-SITE BUILD MAY CHANGE IN A RECORD THE TEMPLATE INSTALLED, BEYOND ITS WORDS (plan "10/10" §5, David
 * 26/10/2026). native-structure holds every field that is not copy exactly (`compareAgentInventory`), so a post the
 * build rewrote kept the template's address and date: local round 31 (WordPress, JA Restaurant) ended with posts at
 * `/how-the-gop-and-dems-differ-on-restaurant-issues/` dated 27 September 2021.
 *
 * A build's site is new: nobody has visited it and nothing outside links to it, and WordPress keeps the old slug
 * redirecting (`_wp_old_slug`). So on an article — a WordPress post of any type but the fixed ones below, a Joomla
 * article or category, an EmDash entry outside `pages` — its address (slug, alias, route) and its date are the
 * build's. Pages, menus, blocks, templates and theme settings keep their addresses: menus and buttons point at them,
 * and the template's showcase pages already have their own rule (`showcaseOf`). These fields are read as `$build` in
 * both inventories, the same way the showcase ones read `$showcase`; every other field, count and relation is held.
 */

/** WordPress post types whose address stays: pages, menus, reusable blocks, theme settings and files. */
const WP_FIXED_TYPES = new Set([
  'page',
  'attachment',
  'nav_menu_item',
  'wp_navigation',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_global_styles',
  'wp_font_family',
  'wp_font_face'
])
/** A WordPress article's slug and date; the GMT date follows the local one when WordPress saves the post. */
const WP_FIELDS = Object.freeze(['post_name', 'post_date', 'post_date_gmt'])
/** A Joomla article's or category's alias, dates and the byline it may print instead of the author's name. */
const JOOMLA_FIELDS = Object.freeze(['alias', 'created', 'publish_up', 'created_by_alias'])
/** An EmDash entry's own date fields (its collection names them). */
const EMDASH_DATE = /^(?:date|published(?:_?at)?|publish_?date)$/i

/**
 * The fields of one inventory record a build may change beyond its words, or null when it may change none.
 * @param {{ identity?: Record<string, unknown>, data?: Record<string, unknown> }} record
 * @returns {{ fields: readonly string[], routes: boolean, identity: readonly string[] } | null}
 */
export function buildChangesOf(record) {
  const identity = record?.identity ?? {}
  if (identity.kind === 'post') {
    const type = record.data?.post_type
    if (typeof type !== 'string' || WP_FIXED_TYPES.has(type)) return null
    return { fields: WP_FIELDS, routes: true, identity: [] }
  }
  if (identity.kind === 'article' || identity.kind === 'category')
    return { fields: JOOMLA_FIELDS, routes: true, identity: [] }
  if (typeof identity.collection === 'string') {
    if (identity.collection === 'pages') return null
    return {
      fields: Object.keys(record.data ?? {}).filter((k) => EMDASH_DATE.test(k)),
      routes: true,
      identity: ['slug']
    }
  }
  return null
}

/**
 * The records with the fields a build may change read as `$build` (`buildChangesOf`), for both sides of the
 * native-structure compare.
 * @template {{ identity?: Record<string, unknown>, data?: unknown, routes?: unknown[] }} R
 * @param {R[]} records
 * @returns {R[]}
 */
export function maskBuildChanges(records) {
  const mark = (obj, keys) =>
    obj && typeof obj === 'object' && !Array.isArray(obj)
      ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, keys.includes(k) ? '$build' : v]))
      : obj
  return (records ?? []).map((r) => {
    const free = buildChangesOf(/** @type {any} */ (r))
    if (free === null) return r
    return {
      ...r,
      identity: free.identity.length > 0 ? mark(r.identity, free.identity) : r.identity,
      data: mark(r.data, free.fields),
      routes: free.routes ? (r.routes ?? []).map(() => '$build') : r.routes
    }
  })
}

/**
 * What the brief says the build does with them (`agent-demo.js`): one sentence, read with the rule above.
 * Byline: the author record is not the post's; its display name is (WordPress `wp user update <id> --display_name`,
 * Joomla `created_by_alias`, EmDash `byline_update {displayName}`).
 */
export const BUILD_CHANGES_BRIEF =
  "A template post, article or category the build rewrites gets its own address and date too: its slug made from its new title (WordPress content.update fields {post_name}; Joomla alias; EmDash content_update {slug}), today's date (WordPress post_date, Joomla publish_up, EmDash's writable date field), and a byline that shows the business's name — the author's display name (WordPress wp user update <id> --display_name, Joomla created_by_alias, EmDash byline_update {displayName}), never a new author. Pages, menus and blocks keep their addresses."
