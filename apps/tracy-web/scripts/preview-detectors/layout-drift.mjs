/**
 * Layout drift (LAYOUT-3, Akemi 14/10/2026): wearing a system must not break the template's own
 * layout. On JA Kinetic WordPress and Joomla the footer's newsletter row ("Monthly dispatch" and its
 * line on the left, the e-mail field and Subscribe on the right) is one line on the template's page;
 * in the preview it broke a different way under each system: the form dropped under the description
 * and went left, or the field shrank and a line of words sat between it and the button. Every colour
 * was the system's and every box kept its size, so no other detector read it.
 *
 * The structure of the page is compared with the template's own preview (same paths, same scheme,
 * same no-script frame):
 * - a ROW (a flex row or a grid with two to `maxKids` children in the flow): its lines (a child starts
 *   a new line when it sits below the line before it), the line each child is on, the order the eye
 *   reads the children in (line by line, left to right), and a grid's column count;
 * - a FORM GROUP (a form with two or more visible controls): the same lines for its controls;
 * - each child's place in its row: its left edge, right edge, centre and share of the row's width, the
 *   closest of the four to the template's. The row itself may be narrower or wider (a system's container
 *   width, LAYOUT-1 judges a squeeze), so a child anchored to an edge, centred or laid on a fraction of the
 *   row has not moved; one that changed sides or slid along its row has;
 * - each control's width and height (a field that shrank, a button that grew or went flat beside its
 *   field).
 *
 * Tolerance `drift`: max(24 px, 15% of the template's row width) for a child's place, max(24 px, 15% of
 * the template's width) for a control's width, max(6 px, 15%) for its height: a field and its button
 * that no longer line up read as broken from a few px (JA Kinetic Joomla under Moxie: Subscribe went
 * from 45 to 33 px tall beside its 45 px field). 24 px is beyond a font's hinting, a border or a system's own
 * gutter step (16 → 32 px is a gap, not a move); 15% is the share at which the eye reads a column as
 * moved rather than re-spaced, and it keeps a nav whose words are a few px wider in another face out.
 * The outermost row or group only: a row that wrapped counts once, not once per row inside it.
 */
import { outermost, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'layout-drift'

export const DRIFT_LIMITS = Object.freeze({ px: 24, controlPx: 6, share: 0.15, maxKids: 24, minWidth: 120 })

/** What a line of words never holds: a picture, a control, a button. */
const WORDLESS = 'img, picture, video, iframe, input, select, textarea, button, .btn, [class*="button"]'

/** The tallest picture a line of words still holds: an author's avatar or an icon set beside the words. */
export const INLINE_PICTURE_PX = 32

/**
 * Whether one wordless element is shown in the line and keeps it from being a line of words: a hidden one
 * does not; nor does a picture no taller than {@link INLINE_PICTURE_PX}, which sits in the line as a word does
 * (Tracy Apple Joomla's post meta: "By Lawrence" after a 24 px avatar, 3 lines on the template's card and 2
 * in Moxie's face, 16/10/2026). Runs in the page (the probe inlines it).
 * @param {any} x
 * @param {(e: any) => { display: string }} styleOf
 */
export function wordlessShown(x, styleOf) {
  if (styleOf(x).display === 'none') return false
  if (x.matches('img, picture')) return x.getBoundingClientRect().height > INLINE_PICTURE_PX
  return true
}

export const probe = `(() => {${PAGE_HELPERS}
  const WORDLESS = ${JSON.stringify(WORDLESS)}
  const INLINE_PICTURE_PX = ${INLINE_PICTURE_PX}
  const wordlessShown = ${wordlessShown.toString()}
  const rows = []
  const box = (r, o) => ({ x: Math.round(r.left - o.left), y: Math.round(r.top - o.top), w: Math.round(r.width), h: Math.round(r.height) })
  const inFlow = (k) => { const cs = getComputedStyle(k); if (cs.position === 'absolute' || cs.position === 'fixed') return null; const r = seen(k, cs); return r && r.height >= 1 ? r : null }
  for (const e of document.querySelectorAll('body *')) {
    if (rows.length >= 500) break
    const cs = getComputedStyle(e)
    const grid = /grid/.test(cs.display)
    const flex = /flex/.test(cs.display) && !cs.flexDirection.startsWith('column')
    if (!grid && !flex) continue
    const r = seen(e, cs)
    if (!r || r.width < ${DRIFT_LIMITS.minWidth}) continue
    const kids = []
    for (const k of e.children) { const kr = inFlow(k); if (kr) kids.push(box(kr, r)) }
    if (kids.length < 2 || kids.length > ${DRIFT_LIMITS.maxKids}) continue
    // a line of words: a wrapping flex row whose children show only text (no picture, control or button;
    // a logo the dark side hides behind its name is not shown)
    const words = flex && cs.flexWrap === 'wrap' && [...e.children].every((k) => (k.textContent || '').trim() !== '' && !k.matches(WORDLESS) && ![...k.querySelectorAll(WORDLESS)].some((x) => wordlessShown(x, getComputedStyle)))
    rows.push({ path: pathOf(e), at: label(e), grid, cols: grid ? cs.gridTemplateColumns.split(/\\s+/).filter((t) => /px$/.test(t)).length : 0, w: Math.round(r.width), kids, ...(words && { words: true }) })
  }
  const groups = []
  for (const f of document.querySelectorAll('form')) {
    if (groups.length >= 60) break
    const r = seen(f, getComputedStyle(f))
    if (!r) continue
    const kids = []
    for (const c of f.querySelectorAll('input:not([type=hidden]), select, textarea, button')) { const cr = seen(c, getComputedStyle(c)); if (cr) kids.push(box(cr, r)) }
    if (kids.length >= 2 && kids.length <= ${DRIFT_LIMITS.maxKids}) groups.push({ path: pathOf(f), at: label(f), form: true, w: Math.round(r.width), kids })
  }
  return { rows, groups }
})()`

/** The line of each child, in DOM order: a child starts a new line when it sits below the line before. */
export function linesOf(/** @type {{ x: number, y: number, w: number, h: number }[]} */ kids) {
  const order = kids.map((k, i) => ({ ...k, i })).sort((a, b) => a.y - b.y || a.x - b.x)
  /** @type {number[]} */
  const line = Array.from({ length: kids.length }, () => 0)
  let n = -1
  let bottom = Number.NEGATIVE_INFINITY
  for (const k of order) {
    // below the line so far (a 2 px overlap is still a new line: borders, rounding)
    if (k.y >= bottom - 2) {
      n++
      bottom = k.y + k.h
    } else bottom = Math.max(bottom, k.y + k.h)
    line[k.i] = n
  }
  return { count: n + 1, line }
}

/** The order the eye reads the children in, line by line, left to right: DOM indexes. */
const readingOrder = (/** @type {any[]} */ kids, /** @type {number[]} */ line) =>
  kids
    .map((k, i) => ({ i, l: line[i], x: k.x }))
    .sort((a, b) => a.l - b.l || a.x - b.x)
    .map((k) => k.i)
    .join(',')

/** How far a child slid along its row: the closest of its four anchors to the template's, in px. */
export function slid(
  /** @type {any} */ k,
  /** @type {any} */ was,
  /** @type {number} */ w,
  /** @type {number} */ wasW
) {
  const left = Math.abs(k.x - was.x)
  const right = Math.abs(w - (k.x + k.w) - (wasW - (was.x + was.w)))
  const centre = Math.abs(k.x + k.w / 2 - w / 2 - (was.x + was.w / 2 - wasW / 2))
  const share = Math.abs((k.x / (w || 1)) * wasW - was.x)
  return Math.min(left, right, centre, share)
}

/** Why a row or form group drifted from the template's, or null. @param {any} r @param {any} was */
export function drifted(r, was, t = DRIFT_LIMITS) {
  if (!r || !was || r.kids.length !== was.kids.length) return null
  // a line of words (a post's author, category and date) wraps where its words end, as a paragraph does:
  // another face sets them a few px wider or narrower and the line breaks elsewhere, the layout is the same
  // (Tracy Base EmDash's post meta, 3 lines on the template's card and 2 in Moxie's face, 16/10/2026)
  if (r.words && was.words) return null
  const now = linesOf(r.kids)
  const then = linesOf(was.kids)
  if (r.grid && was.grid && r.cols && was.cols && r.cols !== was.cols)
    return `${was.cols} columns on the template's page, ${r.cols} wearing the system`
  if (now.count !== then.count)
    return then.count === 1
      ? `one line on the template's page, wraps onto ${now.count} wearing the system`
      : `${then.count} lines on the template's page, ${now.count} wearing the system`
  const moved = now.line.findIndex((l, i) => l !== then.line[i])
  if (moved !== -1)
    return `child ${moved + 1} moved from line ${then.line[moved] + 1} to line ${now.line[moved] + 1}`
  if (readingOrder(r.kids, now.line) !== readingOrder(was.kids, then.line))
    return 'its children changed order'
  const tol = Math.max(t.px, t.share * was.w)
  for (const [i, k] of r.kids.entries()) {
    const d = slid(k, was.kids[i], r.w, was.w)
    if (d > tol)
      return `child ${i + 1} moved ${Math.round(d)}px along its row (tolerance ${Math.round(tol)}px)`
  }
  if (r.form)
    for (const [i, k] of r.kids.entries()) {
      const p = was.kids[i]
      if (
        Math.abs(k.w - p.w) > Math.max(t.px, t.share * p.w) ||
        Math.abs(k.h - p.h) > Math.max(t.controlPx, t.share * p.h)
      )
        return `control ${i + 1} went from ${p.w}×${p.h} to ${k.w}×${k.h}px`
    }
  return null
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const all = (/** @type {any} */ d) => [...(d?.rows ?? []), ...(d?.groups ?? [])]
  const plainOf = new Map(all(plain?.data).map((x) => [`${x.form ? 'f' : 'r'}|${x.path}`, x]))
  const why = (/** @type {any} */ r) => drifted(r, plainOf.get(`${r.form ? 'f' : 'r'}|${r.path}`))
  const hits = all(worn?.data).filter((r) => why(r))
  // the outermost, rows and groups together: a form inside a row that wrapped counts with the row
  const findings = outermost(hits.filter((r, i) => hits.findIndex((o) => o.path === r.path) === i)).map(
    (r) => ({
      at: r.at,
      why: why(r)
    })
  )
  return { count: findings.length, findings }
}
