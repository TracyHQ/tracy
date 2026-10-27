/**
 * Buttons the system blew up or shrank (G2 of PR 2, 14/10/2026). JA Resort's header "BOOK NOW" is
 * 129 × 44 px on the template's own page and 330 × 120 px wearing Moxie: the slot's button padding
 * and line height landed on a button whose own rules expect neither, and the pill covers the header.
 * collapsed-button only sees a button too small for its words; a button grown out of its place still
 * shows its label and passed.
 *
 * Measured as the preview frame runs the page (no script), the template's own header button is
 * already 330 × 120 px: a square tan block its band stretches to the header's height, drawn as a
 * block. Moxie's pill radius turns that block into a 330 × 120 pill. So the size is judged two ways:
 * - against the same button on the template's own page (same path): it grew by `ratio` or more (and
 *   by `minDelta` px), it shrank as much AND no longer holds its label (padding, line height, border), or its vertical padding or line height grew to
 *   `ratio` times the template's and by `minDelta` px;
 * - against its own label: a box its band stretched to `ratio` times what its padding, line height
 *   and border hold (and by `minDelta` px) that the system rounded into a pill or a blob (a corner of a
 *   quarter of its short side or more, where the template's corner was under that).
 * A button that keeps the template's own height and matches the field beside it (a search or subscribe row;
 * the field itself or one inside a sibling wrapper an autocomplete script adds) is that row's control, judged against the template's button and its partner, not stretched (dot-1, 18/10/2026).
 * A button already collapsed (collapsed-button's limits) is left to that kind, and a "button" the
 * template draws as a banner (`bannerArea` or more on its page) to shrunk-block, so one fault counts once.
 */

import { BUTTON_SELECTOR } from './lib/buttons.mjs'
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'button-size'

export const SIZE_LIMITS = Object.freeze({
  ratio: 1.6,
  minDelta: 16,
  collapsedHeight: 16,
  collapsedWidth: 24,
  /** a "button" this many px² or more on the template's page is a banner: shrunk-block judges it */
  bannerArea: 60000
})

export const probe = `(() => {${PAGE_HELPERS}
  // whether a band can stretch this box's height: a flex row or grid whose cross-axis alignment
  // stretches it (align-items normal/stretch, align-self auto/normal/stretch). A button centred in its
  // row, or in a block, has the height of its own rules (JA Kinetic's 44px Figma pill, 15/10/2026)
  const stretched = (e, cs) => {
    const p = e.parentElement
    if (!p) return false
    const ps = getComputedStyle(p)
    const flexRow = /flex/.test(ps.display) && !/column/.test(ps.flexDirection)
    const grid = /grid/.test(ps.display)
    if (!flexRow && !grid) return false
    const self = cs.alignSelf
    if (!/^(auto|normal|stretch)$/.test(self)) return false
    return self === 'stretch' || /^(normal|stretch)$/.test(ps.alignItems)
  }
  const out = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (out.length >= 300) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const text = (e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()
    if (!text) continue
    const px = (v) => Math.round(parseFloat(v) || 0)
    // its row partner: a field right before or after it within 16px (a search bar's input + button, a
    // subscribe field + button), whose height the row gives the button too (button-role reads the same pair).
    // The field may sit inside a sibling wrapper: an autocomplete script wraps it (Joomla's Smart Search
    // awesomplete: div.awesomplete > input, Tracy Business Joomla 1.2.5's search page, 18/10/2026)
    let fieldH = null
    const FIELD = 'input:not([type=hidden]), select, textarea'
    for (const s of [e.previousElementSibling, e.nextElementSibling]) {
      const f = !s ? null : s.matches(FIELD) ? s : s.querySelector(FIELD)
      if (!f) continue
      const fr = seen(f, getComputedStyle(f))
      if (fr && Math.max(r.left - fr.right, fr.left - r.right, r.top - fr.bottom, fr.top - r.bottom) <= 16) { fieldH = Math.round(fr.height); break }
    }
    out.push({ path: pathOf(e), at: label(e), text: text.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height),
      padY: px(cs.paddingTop) + px(cs.paddingBottom), padX: px(cs.paddingLeft) + px(cs.paddingRight),
      lh: cs.lineHeight === 'normal' ? null : px(cs.lineHeight), font: px(cs.fontSize),
      bw: px(cs.borderTopWidth) + px(cs.borderBottomWidth), radius: px(cs.borderTopLeftRadius), stretch: stretched(e, cs), ...(fieldH !== null && { fieldH }),
      // paints no box: no fill, no picture, no frame (one rule of 2px or less under or over its words is
      // an underline, not a frame): a text link the template classes as .btn
      bare: /rgba\\([^)]*,\\s*0\\)|transparent/.test(cs.backgroundColor) && cs.backgroundImage === 'none' &&
        ((sides) => sides.length === 0 || (sides.length === 1 && /Top|Bottom/.test(sides[0]) && px(cs['border' + sides[0] + 'Width']) <= 2))(
          ['Top', 'Right', 'Bottom', 'Left'].filter((k) => px(cs['border' + k + 'Width']) > 0 && cs['border' + k + 'Style'] !== 'none')) })
  }
  return out
})()`

/** How the worn button changed against the template's, or null. @param {any} b @param {any} was */
export function sizeChange(b, was, t = SIZE_LIMITS) {
  if (!b?.text || !was || !was.w || !was.h || !b.w || !b.h) return null
  if (b.h < t.collapsedHeight || b.w < t.collapsedWidth) return null
  if (was.w * was.h >= t.bannerArea) return null
  const grew = (/** @type {number} */ now, /** @type {number} */ then) =>
    now >= then * t.ratio && now - then >= t.minDelta
  const why = []
  // what the label needs: its padding, line height and border
  const holds = b.padY + (b.lh ?? Math.round(b.font * 1.2)) + (b.bw ?? 0)
  // a text link the template classes as a button (no fill, no border, no vertical padding, here and on
  // the template's page) whose words wrap onto more lines in the same column: the system's wider face
  // broke the line, nothing blew the box up (JA Symphony Joomla's "Read more: <title>", 431×31 to
  // 439×61px, dot 3, 19/10/2026)
  const line = b.lh ?? Math.round(b.font * 1.2)
  const wrapped =
    b.bare === true &&
    was.bare === true &&
    b.padY <= 4 &&
    was.padY <= 4 &&
    !grew(b.w, was.w) &&
    b.w <= was.w * 1.2 &&
    Math.round(b.h / line) > Math.round(was.h / (was.lh ?? line))
  if (!wrapped && (grew(b.h, was.h) || grew(b.w, was.w)))
    why.push(`grew from ${was.w}×${was.h} to ${b.w}×${b.h}px`)
  // a smaller button that still holds its label is the system's size, not a fault (JA Resort's
  // booking CHECK, 123×61 to 106×37, reads as a normal button): only one too small for its label counts
  else if ((grew(was.h, b.h) || grew(was.w, b.w)) && b.h < holds - 2)
    why.push(`shrank from ${was.w}×${was.h} to ${b.w}×${b.h}px, under the ${holds}px its label needs`)
  // a box of its own fixed height that kept it and still holds its label shows no change: the padding
  // or line height the slot added sits inside the same box, the label centred as before. JA Kinetic
  // WordPress's hero buttons are 44px tall with no vertical padding of their own; Figma's 10px a side
  // read as "vertical padding 0 to 20px" while the button stayed 44px with its label whole (16/10/2026)
  const held = Math.abs(b.h - was.h) <= 2 && holds <= b.h + 2
  if (!held && grew(b.padY, was.padY)) why.push(`vertical padding ${was.padY} to ${b.padY}px`)
  if (!held && b.lh !== null && was.lh !== null && grew(b.lh, was.lh))
    why.push(`line height ${was.lh} to ${b.lh}px`)
  // a box stretched past its label, rounded by the system: a block became a giant pill
  const round = (/** @type {any} */ x) =>
    Math.min(x.radius ?? 0, Math.min(x.w, x.h) / 2) >= Math.min(x.w, x.h) / 4
  // an icon control (a square box of 48px or less around a one- or two-character glyph: a header's
  // search or menu toggle) is sized by its own width and height, not stretched by its band: the
  // system's corner makes it the system's round icon button (Tracy Business Joomla's header search,
  // 38 × 38 px, 15/10/2026)
  const icon = Math.abs(b.w - b.h) <= 2 && b.h <= 48 && [...String(b.text)].length <= 2
  // a button at the template's own height that matches its row partner (the field beside it) is a control of
  // that row, not a block its band blew up: Tracy Business Joomla's search bar Search, 47px like its input on
  // the template's page and under every system, rounded into the system's pill (dot-1 at probe 10, 18/10/2026)
  const partnered =
    Math.abs(b.h - was.h) <= 2 && typeof b.fieldH === 'number' && Math.abs(b.h - b.fieldH) <= 2
  // only a band can stretch a box: one its row does not stretch (stretch false) has its own height
  if (!icon && !partnered && b.stretch !== false && grew(b.h, holds) && round(b) && !round(was))
    why.push(`a ${b.w}×${b.h}px box its band stretched (its label holds ${holds}px) rounded into a pill`)
  return why.length ? why.join(', ') : null
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const b of worn?.data ?? []) {
    const why = sizeChange(b, plainOf.get(b.path))
    if (why) findings.push({ at: b.at, text: b.text, size: `${b.w}×${b.h}`, why })
  }
  return { count: findings.length, findings }
}
