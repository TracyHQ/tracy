/**
 * Texts over a picture whose veil the system recoloured until they no longer read (cross-check of
 * PR 2, 14/10/2026). A cover block lays a coloured veil (an absolute layer with a fill and an
 * opacity) between its picture and its words; the system repaints the veil, the words keep a colour
 * chosen for the old one. JA Essence WordPress under Moxie on a light visitor scheme: the lead cards'
 * titles went from white on a dark veil to grey on a grey veil. The base probe cannot see this: it
 * stops at a picture, so it never compares the words with the veil.
 *
 * In the page: every text with a veil under it (a sibling layer of one of its ancestors, painted
 * before it, covering the text's centre, with a fill and no text of its own, over a picture). Its
 * ground is the veil laid over a mid grey (the picture is unknown). A finding is a text that reads
 * under `TEXT_FLOOR` on the worn page and read at least that on the template's own page.
 */
import { COLOUR_IN_PAGE } from '../../src/sites/design-system-preview-probe.js'
import { byPath, hex } from './lib/colour.mjs'
import { WIDGETS_IN_PAGE } from './lib/widgets.mjs'

export const kind = 'veil-text'

/** CON-2's floor: a text the system made unreadable. */
const TEXT_FLOOR = 3

export const probe = `(() => {
${COLOUR_IN_PAGE}
${WIDGETS_IN_PAGE}
  const pathOf = (e) => { const out = []; for (let x = e; x && x !== document.body && out.length < 30; x = x.parentElement) { let i = 1; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName) i++; out.unshift(x.tagName.toLowerCase() + ':' + i) } return out.join('/') }
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const picture = (x) => /^(IMG|VIDEO|PICTURE|CANVAS)$/.test(x.tagName) || /url\\(/.test(getComputedStyle(x).backgroundImage)
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 300) break
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
    // a third-party widget's words are the provider's (lib/widgets.mjs)
    if (inWidget(e)) continue
    const r = e.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let veil = null
    for (let c = e, a = e.parentElement, n = 0; a && a !== document.body && n < 8 && !veil; c = a, a = a.parentElement, n++) {
      // a text on its own fill (a badge, a card) reads on that fill, not on the veil
      const own = ch(getComputedStyle(c).backgroundColor)
      if (own && own.a > 0.9) break
      const kids = [...a.children]
      const i = kids.indexOf(c)
      const hasPicture = picture(a) || kids.some((k, j) => j !== i && (picture(k) || k.querySelector('img, video, picture')))
      if (!hasPicture) continue
      for (const k of kids) {
        if (k === c || k.contains(e)) continue
        const ks = getComputedStyle(k)
        if (!/absolute|fixed/.test(ks.position) || (k.innerText || '').trim()) continue
        const kr = k.getBoundingClientRect()
        if (cx < kr.left || cx > kr.right || cy < kr.top || cy > kr.bottom) continue
        const bg = ch(ks.backgroundColor)
        const alpha = bg ? bg.a * (+ks.opacity) : 0
        if (!bg || alpha < 0.2) continue
        veil = { c: bg, a: Math.round(alpha * 100) / 100, at: label(k) }
        break
      }
    }
    if (!veil) continue
    const fg = ch(cs.color)
    if (!fg) continue
    const g = { r: veil.c.r * veil.a + 128 * (1 - veil.a), g: veil.c.g * veil.a + 128 * (1 - veil.a), b: veil.c.b * veil.a + 128 * (1 - veil.a) }
    out.push({ path: pathOf(e), at: label(e), text: e.textContent.trim().slice(0, 40), fg, ground: g, veil: veil.at, ratio: Math.round(ratio(fg, g) * 100) / 100 })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data)
  const findings = (worn?.data ?? [])
    .filter((x) => x.ratio < TEXT_FLOOR)
    .filter((x) => {
      const p = was.get(x.path)
      return p && p.ratio >= TEXT_FLOOR
    })
    .map((x) => ({
      // the element alone is often a bare a or time: the words say which one
      at: `${x.at} "${x.text.slice(0, 32)}"`,
      text: x.text,
      ratio: x.ratio,
      colour: hex(x.fg),
      ground: hex(x.ground),
      veil: x.veil,
      was: was.get(x.path).ratio
    }))
  return { count: findings.length, findings }
}
