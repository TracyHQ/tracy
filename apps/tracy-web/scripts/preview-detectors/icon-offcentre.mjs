/**
 * Icon buttons whose glyph the system pushed off the centre of its button (Akemi's eye check of JA Resume,
 * 17/10/2026): the back-to-top square (50 × 50, padding 0, a chevron centred) took the system's button
 * padding (7px 21px) through the contract's .btn selector, and the chevron sat to the right of the middle.
 * No rule read where a glyph sits inside its box: every button check reads the box, its corner and colours.
 *
 * In the page: every button that shows an icon and no words (BUTTON_SELECTOR, plus a back-to-top control),
 * the centre of its icon (an <i>, <svg> or icon <span> inside it: the box the glyph is drawn in) against the
 * centre of the button. A floating control a script fades in on scroll (opacity 0 at the top of the page,
 * T3's .back-to-top.affix-top) is read too: the preview runs no script, the geometry is the same either way.
 * A finding is a button whose icon is off its centre by more than `px` and `share` of the button's short
 * side worn, where the template's own page kept it within `px` of where it was: the system moved it.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'icon-offcentre'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const OFFCENTRE_LIMITS = Object.freeze({ px: 3, share: 0.06 })

export const probe = `(() => {${PAGE_HELPERS}
  const ICON = 'i, svg, span[class*=icon], span[class*=fa-], span[class*=glyph]'
  const out = []
  const sel = ${JSON.stringify(BUTTON_SELECTOR)} + ', .back-to-top a, .back-to-top button, #back-to-top a, #back-to-top button, [class*=scroll-top] a, a[class*=scroll-top], a[class*=back-to-top], a[class*=go-top]'
  for (const e of document.querySelectorAll(sel)) {
    if (out.length >= 200) break
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    // words beside the icon centre the pair, not the icon: only a button that is its icon
    if ((e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()) continue
    const icons = [...e.querySelectorAll(ICON)].filter((i) => !i.parentElement.closest('svg'))
    if (icons.length !== 1) continue
    const r = e.getBoundingClientRect()
    const ir = icons[0].getBoundingClientRect()
    if (r.width < 12 || r.height < 12 || r.width > 120 || r.height > 120 || !ir.width || !ir.height) continue
    out.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height),
      dx: Math.round((ir.left + ir.width / 2 - (r.left + r.width / 2)) * 10) / 10,
      dy: Math.round((ir.top + ir.height / 2 - (r.top + r.height / 2)) * 10) / 10 })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = OFFCENTRE_LIMITS) {
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const b of worn?.data ?? []) {
    const was = plainOf.get(b.path)
    if (!was) continue
    const off = Math.hypot(b.dx, b.dy)
    const moved = Math.hypot(b.dx - was.dx, b.dy - was.dy)
    const limit = Math.max(t.px, t.share * Math.min(b.w, b.h))
    if (off > limit && moved > t.px)
      findings.push({
        at: b.at,
        text: '',
        why: `icon ${b.dx}px, ${b.dy}px off the centre of its ${b.w}×${b.h} button; the template's page has it at ${was.dx}px, ${was.dy}px`,
        by: 'system'
      })
  }
  return { count: findings.length, findings }
}
