// How a control on the source is paired with the one on the port: by what a visitor meets — its ROLE, the landmark it sits in, its place
// (edge and order) and its shape — and by its NAME only to break a tie. A port's markup and accessible names legitimately differ from the
// source's ("Show the Our Services menu" next to a link, an unnamed three-bar button, a newsletter form with other field names): a control
// that exists on both sides in the same place is never `missing` or `extra` because of what it is called.
//
// One rule for the readers that need it: the page-side word lists below (interpolated into in-page scripts as regular-expression sources),
// and the Node-side pairing of icon-only controls by edge and shape. The site sweep (site-sweep-probe.mjs / -judge.mjs) states the same rule
// for its header insets (a menu button sits outside every list item; a submenu toggle is not the menu button; an unnamed icon is paired by role,
// edge and shape); a consumer of this file keeps the two from drifting.

/** What names a control that opens the whole menu (the three-bar button). A source-agnostic word list: nothing here is a selector of one port. */
export const MENU_BUTTON_WORDS = String.raw`burger|hamburger|toggler|nav-?toggle|menu-?toggle|drawer-?toggle|offcanvas|off-canvas|\bmenu\b|navbar-toggle`
/** What names a control that opens ONE branch of the menu (a chevron beside a link, a dropdown caret): it is not the menu button. */
export const SUBMENU_WORDS = String.raw`sub-?menu|dropdown|expand|show the|open the .+ menu|mega.?trigger|caret|chevron|disclosure`

/** The side of the viewport a control sits on, by its centre. */
export const edgeOf = (c, viewportWidth) => (c.x + c.w / 2 < viewportWidth / 2 ? 'left' : 'right')

/** Two boxes of the same kind of control: their areas within a factor of `ratio` and their aspect ratios within a factor of `ratio`. */
export function sameShape(a, b, ratio = 2.5) {
  if (!(a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0)) return false
  const within = (x, y) => Math.max(x, y) / Math.min(x, y) <= ratio
  return within(a.w * a.h, b.w * b.h) && within(a.w / a.h, b.w / b.h)
}

/**
 * The control of `candidates` (the lacking side's controls that no role was found for) that stands for `have` (the other side's control of a
 * role): the only one on the same edge with the same shape, and in the same band of the header. Several candidates, or none, is NOT a pairing.
 * @param {{x:number,y:number,w:number,h:number}} have  the control the other side has (its box)
 * @param {{x:number,y:number,w:number,h:number}[]} candidates
 * @param {{haveWidth:number, lackWidth:number, band?: number}} o  the viewport widths of the two sides; `band`: how far apart (px) their centres may be vertically
 * @returns {object|null}
 */
export function counterpartOf(have, candidates, { haveWidth, lackWidth, band = 24 }) {
  const edge = edgeOf(have, haveWidth)
  const near = (candidates ?? []).filter((c) => edgeOf(c, lackWidth) === edge && sameShape(have, c) && Math.abs(c.y + c.h / 2 - (have.y + have.h / 2)) <= band)
  return near.length === 1 ? near[0] : null
}

/** The keys a name is compared by: lower-case words. Used as the tie-breaker only. */
export const wordsKey = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

/**
 * Pair two ordered lists of things (source, site) by position within their role/landmark, the name breaking ties: the i-th of a role on the
 * source is the i-th on the site when both sides have the same number of them; when the counts differ, the ones whose words agree are paired
 * first and the rest stay unpaired (the caller decides — an unpaired one is not guessed).
 * @returns {{pairs: [object, object][], source: object[], site: object[]}}
 */
export function pairByOrder(source, site, nameOf = (x) => x.label) {
  if (source.length === site.length) return { pairs: source.map((s, i) => [s, site[i]]), source: [], site: [] }
  const pairs = []
  const left = [...site]
  const rest = []
  for (const s of source) {
    const i = left.findIndex((t) => wordsKey(nameOf(t)) && wordsKey(nameOf(t)) === wordsKey(nameOf(s)))
    if (i >= 0) pairs.push([s, left.splice(i, 1)[0]])
    else rest.push(s)
  }
  return { pairs, source: rest, site: left }
}
