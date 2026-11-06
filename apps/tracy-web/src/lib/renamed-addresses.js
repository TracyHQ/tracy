// The addresses the write step's route stage moved (write-step/page-route-stage.js), and what an old address is called now.
// Shared: the write step rewrites the links that still name an old address, and the site check opens kept pages and blames
// dead links by the same table, so it is in lib/ (module-graph.test.mjs). Pure.
//
// A move is `{ from, to }`, both paths as Joomla prints them without `/index.php`: `/classes` to `/services`. A page under a
// moved parent moves with it, so `/classes/tennis` is `/services/tennis` now, though its own item was never renamed.

const each = (value) => (Array.isArray(value) ? value : [])
const LANDED = new Set(['written', 'already'])

/** A path as a move compares it: no `/index.php`, no trailing slash, lower case, `/` for the home page. */
export const movePath = (path) => {
  const p = String(path ?? '')
    .replace(/^\/?index\.php(?=\/|$)/i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  return p === '' ? '/' : p.startsWith('/') ? p : `/${p}`
}

/**
 * The moves of a route table: each landed rename whose address changed, the longest first so a child's own rename wins over
 * its parent's.
 * @param {object[] | undefined} routes the write report's route table
 * @returns {{ from: string, to: string }[]}
 */
export function addressMoves(routes) {
  const moves = new Map()
  for (const r of each(routes)) {
    if (!LANDED.has(r?.outcome) || !r.from || !r.to) continue
    const from = movePath(r.from)
    const to = movePath(r.to)
    if (from !== to && from !== '/') moves.set(from, to)
  }
  return [...moves].map(([from, to]) => ({ from, to })).sort((a, b) => b.from.length - a.from.length)
}

/** Where a path answers now, or null when no move touches it. */
export function addressNow(path, moves) {
  const p = movePath(path)
  for (const m of each(moves)) {
    if (p === m.from) return m.to
    if (p.startsWith(`${m.from}/`)) return `${m.to}${p.slice(m.from.length)}`
  }
  return null
}

// An address of this site as a link or a url menu item holds it: an optional origin, an optional `index.php`, a path, and what
// follows the path. A path without a leading slash (`images/classes/a.jpg`, `classes/tennis`) is never read as an address.
const LINK =
  /^(?<origin>(?:https?:)?\/\/[^/?#\s]+)?(?<base>\/?index\.php(?=\/))?(?<path>\/[^?#\s]*)(?<rest>[?#].*)?$/i

/**
 * A link that names a moved address, rewritten to the address it answers at now.
 * @param {string} href
 * @param {{ from: string, to: string }[]} moves
 * @param {{ hosts?: string[] }} [site] the host names this site answers at; a link with any other host is left alone
 * @returns {null | { href: string, from: string, to: string } | { refused: string, from: string, to: string }} null when the
 *   link names no moved address; `refused` when it does but cannot be told to be this site's
 */
export function movedLink(href, moves, { hosts = [] } = {}) {
  const m = LINK.exec(String(href ?? '').trim())
  if (!m) return null
  const { origin = '', base = '', path, rest = '' } = m.groups
  if (!origin && !base && !path.startsWith('/')) return null
  const now = addressNow(path, moves)
  if (now === null) return null
  const from = movePath(path)
  if (origin) {
    const host = origin.replace(/^(?:https?:)?\/\//i, '').toLowerCase()
    const known = hosts.map((h) => String(h).toLowerCase())
    if (known.length && !known.includes(host)) return null
    if (!known.length)
      return {
        refused: `the link ${href} names the host ${host}, and the write step was not told which hosts are this site's, so it was left as it is`,
        from,
        to: now
      }
  }
  const trailing = path.length > 1 && path.endsWith('/') ? '/' : ''
  return { href: `${origin}${base}${now}${trailing}${rest}`, from, to: now }
}

const HREF = /(\bhref\s*=\s*)(["'])([^"']*)\2/gi

/**
 * The links inside a value of words (HTML, or the content map's doubled brackets), each one naming a moved address rewritten.
 * @param {string} text
 * @param {{ from: string, to: string }[]} moves
 * @param {{ hosts?: string[], whole?: boolean }} [site] `whole`: the value is an address itself (a url slot)
 * @returns {{ text: string, moved: { from: string, to: string, href: string, now: string }[], refused: string[] }}
 */
export function movedLinksIn(text, moves, { hosts = [], whole = false } = {}) {
  const moved = []
  const refused = []
  const one = (href) => {
    const found = movedLink(href, moves, { hosts })
    if (!found) return href
    if (found.refused) {
      refused.push(found.refused)
      return href
    }
    moved.push({ from: found.from, to: found.to, href, now: found.href })
    return found.href
  }
  const value = String(text ?? '')
  if (whole) return { text: one(value), moved, refused }
  const out = value.replace(HREF, (all, lead, quote, href) => `${lead}${quote}${one(href)}${quote}`)
  return { text: out, moved, refused }
}
