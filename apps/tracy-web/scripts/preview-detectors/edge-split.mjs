/**
 * Sections that start at one left edge on the template's page and at several under a system
 * (LAYOUT-3, Akemi 14/10/2026). On JA Kinetic Joomla the hero, timeline and testimonial blocks moved to
 * x≈99 under every system while "What you get", the metrics band and the footer stayed at x≈80: the
 * contract gave the system's width to the template's padded containers only. On JA Kinetic WordPress
 * under Spotify the header and footer shrank to a 1024px column inside a 1240px page. Each box kept its
 * own size or moved as a whole, so neither the squeeze (LAYOUT-1) nor a row's drift read it.
 *
 * The probe reads every COLUMN of the page: a box with a max-width of its own, centred in the window
 * (its two side gaps within 2px), between half the window and the window less 8px wide. `detect`
 * groups the template's columns by their left edge (within `same` px) and pairs each with its twin on
 * the worn page: a group of two or more that shared an edge on the template's page and now starts
 * more than `spread` px apart is one finding.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'edge-split'

export const EDGES = Object.freeze({ same: 2, spread: 8, minShare: 0.5, maxColumns: 300 })

export const probe = `(() => {${PAGE_HELPERS}
  const columns = []
  for (const e of document.querySelectorAll('body *')) {
    if (columns.length >= ${EDGES.maxColumns}) break
    const cs = getComputedStyle(e)
    if (!/px$/.test(cs.maxWidth)) continue
    const r = seen(e, cs)
    if (!r || r.width < ${EDGES.minShare} * W || r.width > W - 8) continue
    if (Math.abs(r.left - (W - r.right)) > 2) continue
    columns.push({ path: pathOf(e), at: label(e), x: Math.round(r.left), w: Math.round(r.width) })
  }
  return { columns }
})()`

/** The template's columns grouped by left edge: groups of two or more, as arrays of columns. */
export function edgeGroups(/** @type {{ x: number }[]} */ columns, t = EDGES) {
  /** @type {any[][]} */
  const groups = []
  for (const c of [...columns].sort((a, b) => a.x - b.x)) {
    const g = groups.at(-1)
    if (g && c.x - g[0].x <= t.same) g.push(c)
    else groups.push([c])
  }
  return groups.filter((g) => g.length >= 2)
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const now = byPath(worn?.data?.columns)
  const findings = []
  for (const g of edgeGroups(plain?.data?.columns ?? [])) {
    const pairs = g.map((c) => ({ was: c, is: now.get(c.path) })).filter((p) => p.is)
    if (pairs.length < 2) continue
    const xs = [...new Set(pairs.map((p) => p.is.x))].sort((a, b) => a - b)
    if (xs.at(-1) - xs[0] <= EDGES.spread) continue
    // the columns off the edge most of the group keeps
    const count = (/** @type {number} */ x) => pairs.filter((p) => p.is.x === x).length
    const main = xs.reduce((a, b) => (count(b) > count(a) ? b : a))
    const off = pairs.filter((p) => Math.abs(p.is.x - main) > EDGES.spread)
    findings.push({
      at: off[0].is.at,
      why: `${pairs.length} columns share one left edge (${g[0].x}px) on the template's page; wearing the system they start at ${xs.join(', ')}px (${off.length} off the ${main}px edge: ${[...new Set(off.map((p) => p.is.at))].slice(0, 3).join(', ')})`
    })
  }
  return { count: findings.length, findings }
}
