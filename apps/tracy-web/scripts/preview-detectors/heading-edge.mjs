/**
 * Headings whose words run to or past the window's edge under a system (LAYOUT-1, Akemi's eye check of
 * JA Symphony Joomla 1.0.4, 19/10/2026). The hero title "We are Symphony." is set at the template's 200px
 * in its brush face; worn, the system's display face (Inter under Figma) drew "Symphony." 1068px wide in
 * the 800px hero, out to 1388px of a 1440px window, its full stop at the edge. No rule failed: the box kept
 * its size, the words simply spilled out of it.
 *
 * The probe reads every visible heading's words (their text boxes, not the element's box, which keeps its
 * width while the words overflow it). `detect` pairs each heading with the same heading on the template's
 * page: one whose words sat in their box and at least `inside` px within the window there, and now run more
 * than `spill` px out of their own box or within `edge` px of a window edge (or past it), is one finding.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'heading-edge'
/** Added at probe 10 (dot 3, 19/10/2026), the version stays 10 (preview-probe-version.mjs). */
export const since = 10

export const HEADING_EDGE = Object.freeze({ inside: 4, edge: 24, spill: 16, max: 400 })

/** How far a heading's words run past its own box, and how close to (or past) the window's edges. */
const spillOf = (/** @type {any} */ h) => Math.max(h.boxLeft - h.left, h.right - h.boxRight)
const marginOf = (/** @type {any} */ h) => Math.min(h.left, h.w - h.right)

export const probe = `(() => {${PAGE_HELPERS}
  const out = []
  const rg = document.createRange()
  for (const e of document.querySelectorAll('h1, h2, h3, h4, h5, h6, .h1, .h2, .h3')) {
    if (out.length >= ${HEADING_EDGE.max}) break
    const cs = getComputedStyle(e)
    const b = seen(e, cs)
    if (!b) continue
    let left = Infinity, right = -Infinity
    const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      rg.selectNodeContents(n)
      for (const q of rg.getClientRects()) if (q.width && q.height) { left = Math.min(left, q.left); right = Math.max(right, q.right) }
    }
    if (left === Infinity) continue
    out.push({ path: pathOf(e), at: label(e), text: (e.innerText || '').trim().slice(0, 40), left: Math.round(left), right: Math.round(right), boxLeft: Math.round(b.left), boxRight: Math.round(b.right), w: W })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = HEADING_EDGE) {
  const was = byPath(plain?.data)
  const findings = []
  for (const h of worn?.data ?? []) {
    const p = was.get(h.path)
    if (!p) continue
    // on the template's page its words sat in its box and clear of the window's edges
    if (spillOf(p) > t.spill || marginOf(p) < t.inside) continue
    // worn, they run out of the box, or to the window's edge (or past it)
    const spill = spillOf(h)
    const margin = marginOf(h)
    if (spill <= t.spill && margin >= t.edge) continue
    // a heading the template itself set within `edge` of the window (JA Mood's last carousel card title, 9px
    // from the edge) counts only when the system moves it more than `inside` px closer
    if (spill <= t.spill && margin >= marginOf(p) - t.inside) continue
    findings.push({
      at: h.at,
      text: h.text,
      why: `its words run from ${h.left} to ${h.right}px of a ${h.w}px window, ${spill > t.spill ? `${spill}px past its own box (${h.boxLeft}-${h.boxRight}px)` : `${Math.max(0, margin)}px from the window's edge`}; on the template's page ${p.left} to ${p.right}px`
    })
  }
  return { count: findings.length, findings }
}
