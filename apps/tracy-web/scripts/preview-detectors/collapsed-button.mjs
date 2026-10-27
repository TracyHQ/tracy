/**
 * Buttons that collapse or clip their label (D2 of PR 2, 14/10/2026). A system's radius, padding or
 * type scale can leave a button too small for its words: ja-trip's hero Search shrank to 42 × 14 px
 * with a font size of 0, ja-voyara's newsletter button became a disc showing "Subs".
 *
 * A button counts when, wearing the system, it has a label and the box is under `minHeight` ×
 * `minWidth`, the label is cut (its text is wider or taller than the box that clips it), or the label
 * is hidden (font under `minFont`) with no icon to stand for it. It is judged on the worn page alone:
 * the visitor of the preview sees the button as it is, whether the template's own page already broke
 * it (ja-trip's Search is 32 × 16 px with a font size of 0 there too) or the system did; `plain` says
 * which, for the fix. A button hidden off screen (a carousel's clone) is not seen and not judged.
 */
import { byPath, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'collapsed-button'

const LIMITS = Object.freeze({ minFont: 6, minHeight: 16, minWidth: 24 })

export const probe = `(() => {${PAGE_HELPERS}
  const ctx = document.createElement('canvas').getContext('2d')
  const out = []
  for (const e of document.querySelectorAll('a.btn, button, .btn, input[type=submit], input[type=button], input[type=reset], [class*="button"]:is(a, button)')) {
    if (out.length >= 300) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const input = e.tagName === 'INPUT'
    const text = (input ? e.value : e.innerText || '').trim()
    let clipped = false
    if (text) {
      // an input's label too wide for its content box is not centred any more: Chrome starts it at the
      // content box's left and clips it at the padding box's right, so it shows whole as long as it fits
      // between the two (JA Kinetic Joomla's footer Subscribe: 65 px of words in a 60 px content box
      // with 34 px of padding each side reads whole, 15/10/2026)
      if (input) { ctx.font = cs.font; clipped = ctx.measureText(text).width > e.clientWidth - (parseFloat(cs.paddingLeft) || 0) + 1 }
      else {
        // the words' own box against the inside of the button: the scroll size also counts a decorative
        // pseudo-element or child that overflows on purpose (JA Vogue's outline buttons draw their hover
        // fill with a rotated ::before inside overflow:hidden; scrollHeight 67 against 36, 16/10/2026)
        const rg = document.createRange()
        let t = null
        const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent.trim()) continue
          rg.selectNodeContents(n)
          for (const q of rg.getClientRects()) if (q.width && q.height) t = t ? { left: Math.min(t.left, q.left), right: Math.max(t.right, q.right), top: Math.min(t.top, q.top), bottom: Math.max(t.bottom, q.bottom) } : { left: q.left, right: q.right, top: q.top, bottom: q.bottom }
        }
        const left = r.left + e.clientLeft, top = r.top + e.clientTop
        const wide = t && (t.left < left - 1 || t.right > left + e.clientWidth + 1)
        const tall = t && (t.top < top - 2 || t.bottom > top + e.clientHeight + 2)
        clipped = Boolean(((cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis') && wide) || (cs.overflowY !== 'visible' && tall))
      }
    }
    // an icon that stands for a hidden label: a picture, an <i>/<svg> child, or a pseudo-element with content
    const pseudo = (p) => { const s = getComputedStyle(e, p); return s.content !== 'none' && s.content !== 'normal' && s.display !== 'none' }
    // or a pseudo-element of the button's parent laid over the button: JA Phio's newsletter cell
    // (td.acysubbuttons::after, a paper plane centred over its font-size-0 Subscribe input, 17/10/2026).
    // Its box: the parent's box plus its resolved left/top and the translation of its transform
    const parentIcon = () => {
      const p = e.parentElement
      if (!p) return false
      const pr = p.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      for (const k of ['::before', '::after']) {
        const s = getComputedStyle(p, k)
        if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.visibility === 'hidden') continue
        if (s.position !== 'absolute' && s.position !== 'fixed') continue
        const w = parseFloat(s.width) || 0, h = parseFloat(s.height) || 0
        if (!w || !h) continue
        let x = (s.position === 'fixed' ? 0 : pr.left + p.clientLeft) + (parseFloat(s.left) || 0)
        let y = (s.position === 'fixed' ? 0 : pr.top + p.clientTop) + (parseFloat(s.top) || 0)
        if (s.transform && s.transform !== 'none') { const m = new DOMMatrix(s.transform); x += m.e; y += m.f }
        if (cx >= x - 1 && cx <= x + w + 1 && cy >= y - 1 && cy <= y + h + 1) return true
      }
      return false
    }
    const icon = !!e.querySelector('svg, img, i, [class*="icon"], [class*="fa-"]') || pseudo('::before') || pseudo('::after') || parentIcon()
    out.push({ path: pathOf(e), at: label(e), text: text.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), font: parseFloat(cs.fontSize) || 0, clipped, icon })
  }
  return out
})()`

/** Why a button reads as broken, or null (template-cut-label reads the template's own page with it). @param {any} b */
export const broken = (b, t = LIMITS) => {
  if (!b?.text) return null
  // small only counts when the box is smaller than its own words: a text-link toggle 15 px high
  // around 13 px type (Tracy Business Joomla's language and theme switches) reads as it should
  if ((b.h < t.minHeight && !(b.font >= t.minFont && b.h >= b.font)) || (b.w < t.minWidth && b.clipped))
    return `collapsed to ${b.w}×${b.h}px`
  if (b.clipped) return 'label cut'
  if (b.font < t.minFont && !b.icon) return `label hidden (font ${b.font}px) and no icon`
  return null
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const b of worn?.data ?? []) {
    const why = broken(b)
    if (!why) continue
    const was = plainOf.get(b.path)
    findings.push({
      at: b.at,
      text: b.text,
      size: `${b.w}×${b.h}`,
      why,
      // who broke it: the template's own page already (fix the template), or the system (fix the slot)
      by: was && broken(was) ? 'template' : 'system'
    })
  }
  return { count: findings.length, findings }
}
