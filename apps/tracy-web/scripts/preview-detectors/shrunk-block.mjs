/**
 * Large links, banners and cards the system shrank (E2 of PR 2, 14/10/2026). On JA Sensei Joomla
 * under Moxie a 1260 × 186 px green banner link (`a.btn.btn-success.btn-block`) became a 1164 × 56 px
 * pill: the slot's button padding, line height and radius reached a block the template draws as a
 * banner. button-size judges buttons; a "button" of SIZE_LIMITS.bannerArea or more on the template's
 * page is a banner and is judged here instead, with every other block that draws a box of its own (a
 * link, a button, or a block with its own fill, picture or border), so one fault counts once. Words
 * (headings, paragraphs) are not blocks: a smaller type scale is the system's choice. That holds for a link
 * or button inside a heading too unless it draws a box of its own (fill, picture, border): JA Tour 1.0.4's
 * hero headline (h1.slide-title > a.heading-link) went from three lines at 80px to one at Moxie's 55px and
 * was reported as a shrunk block (16/10/2026, kept at probe v9 by the manager's call).
 *
 * A block counts when, on the template's page, it is at least SIZE_LIMITS.bannerArea px² and
 * `minHeight` px tall, and wearing the system its height fell by button-size's ratio
 * (SIZE_LIMITS.ratio) and by `minLoss` px or more. Width alone is squeezed-container's. The outermost
 * only.
 */
import { SIZE_LIMITS } from './button-size.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'
import { byPath, outermost, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'shrunk-block'

export const BLOCK_LIMITS = Object.freeze({ minHeight: 80, minLoss: 48 })

/**
 * A strip the system blew up: a wide band the template draws low (a logo strip, a ticker) that grew
 * to `ratio` times its height and by `minGain` px or more wearing the system. JA Kinetic Joomla's logo
 * strip (padding 0 in the template) took the system's section rhythm and went from 90 to 290 px under
 * Moxie, a tall empty band (14/10/2026). Sections the template already pads (taller than `maxHeight`)
 * are the section rhythm's to change.
 */
export const STRIP_LIMITS = Object.freeze({ minWidth: 600, maxHeight: 160, ratio: 2, minGain: 120 })

export const probe = `(() => {${PAGE_HELPERS}
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 800) break
    if (/^(H[1-6]|P|SPAN|LABEL|STRONG|EM|B|I|SMALL|IMG|SVG|VIDEO|PICTURE|INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width * r.height < 2000) continue
    const fill = ch(cs.backgroundColor)
    const draws = (fill && fill.a > 0.5) || cs.backgroundImage !== 'none' || (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0) >= 2
    // inside a heading, a link or button that draws no box of its own is the heading's words (their size is the system's)
    const inHeading = !!e.closest('h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6')
    const own = inHeading ? draws : e.tagName === 'A' || e.matches(${JSON.stringify(BUTTON_SELECTOR)}) || draws
    if (!own) continue
    out.push({ path: pathOf(e), at: label(e), text: (e.innerText || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height),
      radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0) })
  }
  return out
})()`

/** How the worn block shrank against the template's, or null. @param {any} b @param {any} was */
export function shrank(b, was, t = BLOCK_LIMITS, s = SIZE_LIMITS) {
  if (!b || !was || was.w * was.h < s.bannerArea || was.h < t.minHeight) return null
  if (b.h * s.ratio > was.h || was.h - b.h < t.minLoss) return null
  const pill = Math.min(b.radius ?? 0, b.h / 2) >= b.h / 4 && Math.min(was.radius ?? 0, was.h / 2) < was.h / 4
  return `shrank from ${was.w}×${was.h} to ${b.w}×${b.h}px${pill ? ', rounded into a pill' : ''}`
}

/** How a strip of the template's grew, or null. @param {any} b @param {any} was */
export function grew(b, was, t = STRIP_LIMITS) {
  if (!b || !was || was.w < t.minWidth || was.h > t.maxHeight || was.h <= 0) return null
  if (b.h < was.h * t.ratio || b.h - was.h < t.minGain) return null
  return `grew from ${was.w}×${was.h} to ${b.w}×${b.h}px`
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data)
  const why = (/** @type {any} */ b) => shrank(b, plainOf.get(b.path)) ?? grew(b, plainOf.get(b.path))
  const findings = outermost((worn?.data ?? []).filter((/** @type {any} */ b) => why(b))).map((b) => ({
    at: b.at,
    text: b.text,
    size: `${b.w}×${b.h}`,
    why: why(b)
  }))
  return { count: findings.length, findings }
}
