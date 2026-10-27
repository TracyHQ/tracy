/**
 * A fixed or sticky header the page's content shows through (E2 of PR 2, 14/10/2026). On JA Social II
 * Joomla under Moxie the header stays on screen while the page scrolls, with no ground of its own:
 * "JA Social II | Meet New People" runs over the photos and the text below it.
 *
 * A header counts when it is fixed or sticky at the top of the screen, spans most of the width, and
 * neither it nor a block filling it paints an opaque ground (a fill of alpha `opaque` or more, a
 * picture, or a frosted glass: Tracy Base EmDash's sticky header is 80 % fill with a backdrop blur).
 * It is judged on the worn page, as the visitor of the preview sees it; `by` says whether
 * the template's own page already showed it so (fix the template's header) or the system took its
 * ground away (fix the role map).
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'see-through-header'

export const HEADER_LIMITS = Object.freeze({
  widthShare: 0.8,
  minHeight: 30,
  maxHeight: 320,
  nearTop: 16,
  opaque: 0.9
})

export const probe = `(() => {${PAGE_HELPERS}
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 20) break
    const cs = getComputedStyle(e)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    const r = seen(e, cs)
    if (!r || r.width < W * ${HEADER_LIMITS.widthShare} || r.height < ${HEADER_LIMITS.minHeight} || r.height > ${HEADER_LIMITS.maxHeight}) continue
    if (r.top > ${HEADER_LIMITS.nearTop} || !(e.innerText || '').trim()) continue
    if (out.some((o) => o.el.contains(e))) continue
    // the ground: its own, or that of a block covering most of it (a wrapper's inner bar)
    let ground = 0
    for (const x of [e, ...e.querySelectorAll('*')]) {
      const xs = x === e ? cs : getComputedStyle(x)
      const xr = x === e ? r : x.getBoundingClientRect()
      if (xr.width * xr.height < r.width * r.height * 0.8) continue
      const fill = ch(xs.backgroundColor)
      // a picture, or a frosted glass (backdrop blur) the words read on, is a ground
      const frosted = (xs.backdropFilter || xs.webkitBackdropFilter || 'none') !== 'none'
      const a = xs.backgroundImage !== 'none' || frosted ? 1 : fill ? fill.a * (+xs.opacity || 0) : 0
      if (a > ground) ground = a
      if (ground >= 1) break
    }
    out.push({ el: e, path: pathOf(e), at: label(e), position: cs.position, w: Math.round(r.width), h: Math.round(r.height), ground: Math.round(ground * 100) / 100, text: e.innerText.trim().slice(0, 40) })
  }
  return out.map(({ el, ...o }) => o)
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = HEADER_LIMITS) {
  const plainOf = byPath(plain?.data)
  const findings = (worn?.data ?? [])
    .filter((/** @type {any} */ h) => h.ground < t.opaque)
    .map((/** @type {any} */ h) => {
      const was = plainOf.get(h.path)
      return {
        at: h.at,
        text: h.text,
        size: `${h.w}×${h.h}`,
        why: `a ${h.position} header with a ground of alpha ${h.ground}: the content shows through it as the page scrolls`,
        by: was && was.ground < t.opaque ? 'template' : 'system'
      }
    })
  return { count: findings.length, findings }
}
