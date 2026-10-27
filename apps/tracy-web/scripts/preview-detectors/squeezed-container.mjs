/**
 * Containers the system squeezed (E2 of PR 2, 14/10/2026). On
 * JA Sensei Joomla under Moxie the hero's `.container` is 603 px wide with a 369 px left margin where
 * the template's own page gives it 1296 px: the headline and its paragraph are pushed right onto the
 * illustration. On JA Vital Joomla the services sit in a half-width column, the right half empty.
 * No colour rule sees either: every colour is the system's.
 *
 * A block counts when it is at least `wideShare` of the page wide on the template's own page (same
 * path) and, wearing the system, keeps `keep` of its width or less (and loses `minLoss` px or more).
 * The outermost only, so a squeezed container counts once and not once per child. Words pushed onto
 * a picture are not judged apart: a text-over-picture check read JA Morgan WordPress's cover images
 * (pictures under the words by design) as faults on both pages and shifted by a few px when worn.
 * JA Vital's half-width services are the same on the template's own page in the preview (its
 * carousel needs a script), so they are not the system's squeeze and do not count here.
 */
import { byPath, outermost, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'squeezed-container'

export const LAYOUT_LIMITS = Object.freeze({
  /** a block counts from this share of the page width on the template's page */
  wideShare: 0.5,
  /** squeezed: the worn block keeps this share of its width or less */
  keep: 0.7,
  /** and loses at least this many px */
  minLoss: 240
})

export const probe = `(() => {${PAGE_HELPERS}
  const boxes = []
  for (const e of document.querySelectorAll('div, section, main, article, header, footer, nav, aside, form, ul')) {
    if (boxes.length >= 1500) break
    const cs = getComputedStyle(e)
    if (cs.position === 'fixed' || cs.position === 'absolute') continue
    const r = seen(e, cs)
    if (!r || r.width < W * 0.25 || r.height < 24) continue
    boxes.push({ path: pathOf(e), at: label(e), x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY) })
  }
  return { W, boxes }
})()`

/** How the worn block was squeezed against the template's, or null. @param {any} b @param {any} was */
export function squeezed(b, was, pageWidth = 1440, t = LAYOUT_LIMITS) {
  if (!b || !was || was.w < pageWidth * t.wideShare) return null
  if (b.w > was.w * t.keep || was.w - b.w < t.minLoss) return null
  return `squeezed from ${was.w} to ${b.w}px wide`
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data?.boxes)
  const pageWidth = plain?.data?.W || 1440
  const findings = outermost(
    (worn?.data?.boxes ?? []).filter((/** @type {any} */ b) => squeezed(b, plainOf.get(b.path), pageWidth))
  ).map((b) => ({
    at: b.at,
    top: b.top,
    size: `${b.w}×${b.h}`,
    why: squeezed(b, plainOf.get(b.path), pageWidth)
  }))
  return { count: findings.length, findings }
}
