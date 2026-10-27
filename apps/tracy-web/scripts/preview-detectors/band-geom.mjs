/**
 * Wide blocks whose height the system changed far beyond its type scale (JA Sensei's call-to-action
 * banner, 17/10/2026: a slot font size reached the banner and it lost most of its height; JA Tour's
 * content column pushed down by a box the system drew). shrunk-block reads blocks that draw a box of
 * their own and halve; a plain band (a section, a row, a module) that grows or shrinks by a third was
 * read by nothing.
 *
 * In the page: every block at least `minWidth` of the viewport wide and `minHeight` tall, its size.
 * A finding is a band whose height on the worn page is outside [1 / `ratio`, `ratio`] times the
 * template's and moved by `minMove` px or more. Only the innermost such band is told (a section grows
 * because its row grew), and a block shrunk-block already tells (a box of its own that halved, a blown-up
 * strip) is left to it.
 * A band of laid-out items (buttons, badges, tiles: inline blocks and the items of a wrapping flex row) that
 * wraps them into more or fewer rows changes height row by row: that is the system's sizes reflowing, not a
 * band losing its shape. Its height is compared per row of items (JA Impact's Typography page, 18/10/2026:
 * its Buttons column went from five rows of buttons to three under Moxie's tighter buttons, 424 → 233 px,
 * every row as tall as before).
 * A band whose height moved only by the height its words take is the system's type scale reflowing them, not
 * a band losing its shape: the probe reads how tall the band's lines of text stand (the union of their line
 * boxes) and, when the band kept its width and its words carry at least two thirds of the move, tells nothing (JA Phio's
 * Typography page, 18/10/2026: the specimen table's h1 cell went 137 → 257 px under Moxie because the
 * system's larger h1 wraps "h1. Bootstrap heading" onto two lines; its padding stayed as it was).
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'
import { grew, shrank } from './shrunk-block.mjs'

export const kind = 'band-geom'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const BAND_LIMITS = Object.freeze({
  minWidth: 0.6,
  minHeight: 60,
  ratio: 1.5,
  minMove: 100,
  sameWidth: 0.1,
  restShare: 1 / 3
})

export const probe = `(() => {${PAGE_HELPERS}
  // laid-out items: inline blocks, and the items of a wrapping flex row
  const items = []
  for (const x of document.querySelectorAll('body *')) {
    if (items.length >= 1500) break
    const xs = getComputedStyle(x)
    const ps = x.parentElement && getComputedStyle(x.parentElement)
    if (!/^inline-(block|flex|grid|table)$/.test(xs.display) && !(ps && ps.flexWrap === 'wrap' && /flex/.test(ps.display))) continue
    const xr = x.getBoundingClientRect()
    if (xr.width >= 1 && xr.height >= 8) items.push({ x, top: Math.round(xr.top) })
  }
  // the line boxes of every visible text, to tell how tall a band's words stand
  const lines = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walk.nextNode(); n && lines.length < 8000; n = walk.nextNode()) {
    if (!n.data.trim()) continue
    range.selectNodeContents(n)
    for (const q of range.getClientRects()) if (q.width >= 1 && q.height >= 1) lines.push({ n, top: q.top, bottom: q.bottom })
  }
  // how much of the band's height its lines of text cover (overlapping lines counted once)
  const textHeight = (e, r) => {
    const spans = lines
      .filter((l) => l.bottom > r.top && l.top < r.bottom && e.contains(l.n))
      .map((l) => [Math.max(l.top, r.top), Math.min(l.bottom, r.bottom)])
      .sort((a, b) => a[0] - b[0])
    let total = 0
    let end = -1e9
    for (const [a, b] of spans) {
      if (b <= end) continue
      total += b - Math.max(a, end)
      end = b
    }
    return Math.round(total)
  }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 600) break
    if (/^(H[1-6]|P|SPAN|A|LABEL|STRONG|EM|B|I|SMALL|IMG|SVG|svg|VIDEO|PICTURE|INPUT|TEXTAREA|SELECT|IFRAME|CANVAS|UL|OL|LI|FORM)$/.test(e.tagName)) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < W * ${BAND_LIMITS.minWidth} || r.height < ${BAND_LIMITS.minHeight}) continue
    // a block that draws a box of its own (fill, picture, border) is shrunk-block's when it halves or a strip blows up
    const fill = ch(cs.backgroundColor)
    const draws = (fill && fill.a > 0.5) || cs.backgroundImage !== 'none' || (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0) >= 2
    // the rows its laid-out items stand in (tops 4 px apart)
    const tops = items.filter((i) => e.contains(i.x)).map((i) => i.top).sort((a, b) => a - b)
    let rows = 0
    for (let i = 0, last = -1e9; i < tops.length; i++) if (tops[i] - last > 4) { rows++; last = tops[i] }
    out.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), radius: 0, draws: !!draws, rows, text: textHeight(e, r) })
  }
  return out
})()`

/** How far the band moved, or null. @param {any} b @param {any} was */
export function drifted(b, was, t = BAND_LIMITS) {
  if (!b || !was || was.h <= 0) return null
  // items rewrapped into another number of rows: each row against each row
  const per = b.rows >= 2 && was.rows >= 2 && b.rows !== was.rows
  const k = per ? b.h / b.rows / (was.h / was.rows) : b.h / was.h
  if ((k <= t.ratio && k >= 1 / t.ratio) || Math.abs(b.h - was.h) < t.minMove) return null
  if (reflowed(b, was, t)) return null
  if (b.draws && (shrank(b, was) || grew(b, was))) return null
  return `height ${was.h} → ${b.h}px`
}

/**
 * The band kept its width and its words carry the move: what is not text (padding, gaps, pictures) moved by a
 * third of the height change at most, so the system's type scale reflowed the text (JA Sensei's call band, whose
 * padding collapsed along with its font, still moves by more than its words).
 * @param {any} b @param {any} was
 */
export function reflowed(b, was, t = BAND_LIMITS) {
  if (typeof b.text !== 'number' || typeof was.text !== 'number' || !b.text || !was.text) return false
  if (Math.abs(b.w - was.w) > was.w * t.sameWidth) return false
  const rest = b.h - b.text - (was.h - was.text)
  return Math.abs(rest) <= Math.abs(b.h - was.h) * t.restShare
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = BAND_LIMITS) {
  const plainOf = byPath(plain?.data)
  const moved = (worn?.data ?? []).filter((/** @type {any} */ b) => drifted(b, plainOf.get(b.path), t))
  const innermost = moved.filter((b) => !moved.some((o) => o !== b && o.path.startsWith(`${b.path}/`)))
  const findings = innermost.map((b) => ({
    at: b.at,
    size: `${b.w}×${b.h}`,
    why: drifted(b, plainOf.get(b.path), t),
    by: 'system'
  }))
  return { count: findings.length, findings }
}
