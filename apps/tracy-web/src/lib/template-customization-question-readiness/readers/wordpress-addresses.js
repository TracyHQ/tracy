/**
 * The addresses a WordPress demo answers, read from its tables, for the rules that follow links and
 * old addresses (PAGE-1, PAGE-4):
 *
 * - `themeRedirects(wp)`: the redirect table the theme's `tracy-redirects` mu-plugin reads (option
 *   named by `tracy_redirects_option`, else `<stylesheet>_redirects`), as `[from, to]` pairs;
 * - `publishedAddresses(wp)`: every path that opens something (published pages by path, posts by
 *   slug, `category/<parents>/<slug>`, `tag/<slug>`, each Polylang language root, each redirect
 *   `from`), without slashes, and the Polylang language slugs a path may start with.
 */

const REDIRECT = /s:\d+:"from";s:\d+:"([^"]*)";s:\d+:"to";s:\d+:"([^"]*)"/g

/** A path without host, query, `index.php` or slashes at either end. */
export const barePath = (/** @type {string} */ url) =>
  url
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/?(index\.php\/?)?|\/+$/g, '')

const decoded = (/** @type {string} */ s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** @param {any} wp the reader of `wordpress-demo.js` */
export function themeRedirects(wp) {
  const t = wp.tables
  const option =
    t.option('tracy_redirects_option') ??
    `${String(t.option('stylesheet') ?? '').replaceAll('-', '_')}_redirects`
  const rows = [...String(t.option(option) ?? '').matchAll(REDIRECT)].map((m) => [m[1], m[2]])
  return { option, rows }
}

/** @param {any} wp the reader of `wordpress-demo.js` */
export function publishedAddresses(wp) {
  const t = wp.tables
  const addresses = new Set([''])
  for (const p of wp.posts) {
    if (p.post_status !== 'publish') continue
    if (p.post_type === 'page') addresses.add(decoded(wp.pathOf(p)))
    if (p.post_type === 'post') addresses.add(decoded(String(p.post_name)))
  }
  const taxonomy = new Map(t.rows('term_taxonomy').map((r) => [String(r.term_id), r]))
  const slugOf = new Map(t.rows('terms').map((term) => [String(term.term_id), String(term.slug)]))
  /** A category's path: its parents' slugs first, as WordPress builds the archive address. */
  const categoryPath = (/** @type {string} */ id, depth = 0) => {
    const parent = String(taxonomy.get(id)?.parent ?? '0')
    const own = slugOf.get(id) ?? ''
    return parent !== '0' && depth < 20 ? `${categoryPath(parent, depth + 1)}/${own}` : own
  }
  const languages = new Set()
  for (const term of t.rows('terms')) {
    const kind = taxonomy.get(String(term.term_id))?.taxonomy
    if (kind === 'category') addresses.add(`category/${categoryPath(String(term.term_id))}`)
    if (kind === 'post_tag') addresses.add(`tag/${term.slug}`)
    if (kind === 'language') {
      addresses.add(String(term.slug))
      languages.add(String(term.slug))
    }
  }
  for (const [from] of themeRedirects(wp).rows) addresses.add(barePath(from))
  return { addresses, languages }
}
