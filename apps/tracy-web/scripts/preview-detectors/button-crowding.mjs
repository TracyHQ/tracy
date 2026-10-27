/**
 * Buttons that sit on the block below them, with no room between (Akemi's eye check of JA Vital, 17/10/2026:
 * the services' VIEW MORE touched the cards under it). The template's columns had wrapped (T4's CSS optimizer
 * dropped its box-sizing reset), so the button ended right where the card grid began; once a system rounds
 * and fills the button it reads as glued to the cards. button-overlap only compares buttons with buttons.
 *
 * In the page: every button with a label (BUTTON_SELECTOR) and the nearest box below it that the visitor sees
 * as a block of its own (a fill other than its ground, an outline, a shadow, a picture, or words), within its
 * columns (overlapping at least `cover` of the button's width), neither inside the button nor holding it.
 * A button of a header or menu band is left out (its band ends where the next one starts).
 * A finding is a button whose gap to that block is under `gap` px on the worn page (judged as the visitor of
 * the preview sees it). `by` says whether the template's own page already crowded it: Akemi wants those fixed
 * too, in the template.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'button-crowding'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const CROWDING_LIMITS = Object.freeze({ gap: 4, overlap: 4, cover: 0.5, look: 48 })

export const probe = `(() => {${PAGE_HELPERS}
  const L = ${JSON.stringify(CROWDING_LIMITS)}
  const buttons = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (buttons.length >= 150) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.height < 16 || r.width > 600) continue
    const text = (e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()
    if (!text) continue
    // a button of a group, a menu, a form row or a fixed layer is laid out with its neighbours on purpose
    if (e.closest('.btn-group, nav, [role=navigation], form, .dropdown-menu, .pagination') || ['fixed', 'sticky'].includes(cs.position)) continue
    // a header's call to action ends with its band: the next band starts where the header does (JA Impact's
    // Donate now, a full-height cell of the menu row, on the hero)
    if (e.closest('header, [role=banner], [class*=header], [id*=header], [class*=navbar], [class*=mainnav]')) continue
    buttons.push({ e, r: { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY }, text })
  }
  if (!buttons.length) return []
  const groundOf = (x) => { for (let p = x.parentElement; p; p = p.parentElement) { const c = ch(getComputedStyle(p).backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const ownWords = (x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  // the blocks a visitor sees as boxes of their own
  const blocks = []
  for (const x of document.querySelectorAll('body *')) {
    if (blocks.length >= 6000) break
    const cs = getComputedStyle(x)
    const r = seen(x, cs)
    if (!r || r.height < 8) continue
    const fill = ch(cs.backgroundColor)
    const g = fill && fill.a > 0.5 ? groundOf(x) : null
    const filled = g && Math.max(Math.abs(fill.r - g.r), Math.abs(fill.g - g.g), Math.abs(fill.b - g.b)) > 6
    const lined = ['Top', 'Left'].some((s) => (parseFloat(cs['border' + s + 'Width']) || 0) >= 1 && cs['border' + s + 'Style'] !== 'none')
    const pic = /^(IMG|VIDEO|PICTURE|IFRAME|CANVAS)$/.test(x.tagName) || cs.backgroundImage.includes('url(')
    const words = ownWords(x) && /^(P|H[1-6]|LI|SPAN|A|DIV|BLOCKQUOTE|LABEL|TD|TH|DT|DD)$/.test(x.tagName)
    if (!(filled || lined || pic || cs.boxShadow !== 'none' || words)) continue
    blocks.push({ x, left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY })
  }
  const out = []
  for (const b of buttons) {
    let near = null
    for (const k of blocks) {
      if (k.x === b.e || b.e.contains(k.x) || k.x.contains(b.e)) continue
      const gap = k.top - b.r.bottom
      if (gap < -L.overlap || gap > L.look) continue
      // it starts below the button (not a box the button sits in or beside)
      if (k.top < b.r.top + (b.r.bottom - b.r.top) / 2) continue
      const w = Math.min(k.right, b.r.right) - Math.max(k.left, b.r.left)
      if (w < L.cover * (b.r.right - b.r.left)) continue
      if (!near || gap < near.gap) near = { gap, k }
    }
    if (near) out.push({ path: pathOf(b.e), at: label(b.e), text: b.text.slice(0, 30), gap: Math.round(near.gap), below: label(near.k.x) })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = CROWDING_LIMITS) {
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const b of worn?.data ?? []) {
    if (b.gap >= t.gap) continue
    const was = plainOf.get(b.path)
    findings.push({
      at: b.at,
      text: b.text,
      why: `${Math.max(0, b.gap)}px above ${b.below}`,
      // the template's own page crowded it already: the template's spacing to fix
      by: was && was.gap < t.gap ? 'template' : 'system'
    })
  }
  return { count: findings.length, findings }
}
