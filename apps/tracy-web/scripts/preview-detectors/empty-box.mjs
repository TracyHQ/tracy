/**
 * Boxes the system drew out of nothing (Akemi's eye check of JA Tour, 17/10/2026). Joomla prints an
 * empty `#system-message-container` above the content of every page; the template draws nothing for
 * it (790 × 0 px). Under a system it took a border and a padding and showed as an empty outlined bar
 * at the top of the content column, pushing the content down. empty-block (EMPTY-1) passed it twice:
 * it reads only large boxes (120 px tall, 150 000 px²) and only boxes that HOLD content in the markup
 * (`held > 0`), and this one holds nothing.
 *
 * In the page: every hollow box at least `minWidth` wide (no words, no picture, no control, no
 * pseudo-element glyph, no background or mask picture and no clip-path shape inside it), its size and whether it draws (a border or a fill that steps off
 * the ground around it). A finding is a hollow box that draws and is at least `minHeight` tall on the
 * worn page while on the template's own page the same box drew nothing or had no height. Outermost only.
 *
 * A colour swatch is not a box drawn out of nothing (Tracy Base EmDash 0.5.6's /design-system/colour, 18/10/2026):
 * a hollow box whose fill is the value of a custom property its caption names (`--color-accent-on` printed
 * under it, within `swatchUp` ancestors and `swatchText` characters). Its job is to paint that colour: on the
 * template's page it "drew nothing" only because that role's value there equals the ground behind it, and
 * under a system it shows the system's value. The swatch's own fill, not a border or a padding the system
 * added, has to be what draws: a swatch that takes a border it never had is still judged.
 */
import { byPath, outermost, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'empty-box'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const EMPTY_BOX_LIMITS = Object.freeze({
  minWidth: 120,
  minHeight: 8,
  stepOff: 1.15,
  seenStep: 1.05,
  swatchUp: 3,
  swatchText: 300
})

export const probe = `(() => {${PAGE_HELPERS}
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const groundOf = (x) => { for (let y = x; y; y = y.parentElement) { const c = ch(getComputedStyle(y).backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const glyph = (x) => ['::before', '::after'].some((p) => { const s = getComputedStyle(x, p); return s.content && !/^(none|normal|""|'')$/.test(s.content) && s.display !== 'none' })
  const hollow = (e) => {
    if ((e.innerText || e.textContent || '').trim()) return false
    if (e.querySelector('img, svg, video, canvas, iframe, input, select, textarea, button, object, embed, picture')) return false
    // a mask paints its picture in the box's fill (a doodle layer drawn in the accent): a picture, like a background;
    // a clip-path cut to a shape paints that shape (JA Sensei's hero wave, a polygon filled in the page's ground)
    for (const x of [e, ...e.querySelectorAll('*')]) { const xs = getComputedStyle(x); if (glyph(x) || [xs.backgroundImage, xs.maskImage, xs.webkitMaskImage].some((v) => /url\\(|gradient/.test(v || '')) || /^(polygon|path|circle|ellipse|shape|url)\\(/.test(xs.clipPath || '')) return false }
    return true
  }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 400) break
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR|HR|IMG|SVG|svg|INPUT|SELECT|TEXTAREA|BUTTON|IFRAME|VIDEO|CANVAS|PICTURE|OPTION)$/.test(e.tagName)) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none') continue
    const r = e.getBoundingClientRect()
    if (r.width < ${EMPTY_BOX_LIMITS.minWidth} || !hollow(e)) continue
    const g = e.parentElement ? groundOf(e.parentElement) : { r: 255, g: 255, b: 255, a: 1 }
    const f = ch(cs.backgroundColor)
    let draws = !!(f && f.a > 0.5 && ratio(f, g) >= ${EMPTY_BOX_LIMITS.stepOff})
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const bw = parseFloat(cs['border' + side + 'Width']) || 0
      const bc = ch(cs['border' + side + 'Color'])
      if (bw >= 1 && !/none|hidden/.test(cs['border' + side + 'Style']) && bc && bc.a > 0.3 && ratio(bc, f && f.a > 0.9 ? f : g) >= ${EMPTY_BOX_LIMITS.stepOff}) draws = true
    }
    // the largest step off the ground of anything the box paints: its fill, its borders, a fill inside it
    let step = f && f.a > 0.5 ? ratio(f, g) : 1
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const bw = parseFloat(cs['border' + side + 'Width']) || 0
      const bc = ch(cs['border' + side + 'Color'])
      if (bw >= 1 && !/none|hidden/.test(cs['border' + side + 'Style']) && bc && bc.a > 0.3) step = Math.max(step, ratio(bc, f && f.a > 0.9 ? f : g))
    }
    for (const x of [...e.querySelectorAll('*')].slice(0, 40)) {
      const xs = getComputedStyle(x), xr = x.getBoundingClientRect(), xf = ch(xs.backgroundColor)
      if (xs.display !== 'none' && xr.width >= 2 && xr.height >= 2 && xf && xf.a > 0.5) step = Math.max(step, ratio(xf, g))
    }
    const shown = cs.visibility !== 'hidden' && +cs.opacity > 0
    // a swatch: its fill is the value of a custom property its caption names (EMPTY_BOX_LIMITS.swatchUp)
    let swatch = null, edged = false
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if ((parseFloat(cs['border' + side + 'Width']) || 0) >= 1 && !/none|hidden/.test(cs['border' + side + 'Style'])) edged = true
    if (f && f.a > 0.9) {
      let a = e.parentElement
      for (let i = 0; a && a !== document.body && i < ${EMPTY_BOX_LIMITS.swatchUp} && !swatch; i++, a = a.parentElement) {
        const words = (a.innerText || '').trim()
        if (words.length > ${EMPTY_BOX_LIMITS.swatchText}) break
        for (const name of new Set(words.match(/--[a-zA-Z0-9_-]+/g) || [])) {
          const v = getComputedStyle(e).getPropertyValue(name).trim()
          if (!v) continue
          const t = document.createElement('i')
          t.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px'
          t.style.backgroundColor = v
          e.appendChild(t)
          const c = ch(getComputedStyle(t).backgroundColor)
          t.remove()
          if (c && Math.abs(c.r - f.r) <= 2 && Math.abs(c.g - f.g) <= 2 && Math.abs(c.b - f.b) <= 2) { swatch = name; break }
        }
      }
    }
    out.push({ path: pathOf(e), at: label(e) + (e.id ? '#' + e.id : ''), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), draws: draws && shown, step: shown ? Math.round(step * 100) / 100 : 1, ...(swatch && { swatch, edged }) })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = EMPTY_BOX_LIMITS) {
  const plainOf = byPath(plain?.data)
  const drawn = (/** @type {any} */ b) => b && b.draws && b.h >= t.minHeight
  // on the template's page: anything the visitor sees there (a faint track, a bar inside it)
  const seen = (/** @type {any} */ b) => b && b.h >= t.minHeight && (b.draws || (b.step ?? 1) >= t.seenStep)
  // a swatch painting the colour its caption names: drawn by its own fill, not by a border the system added
  const swatch = (/** @type {any} */ b) => !!b.swatch && !(b.edged && !plainOf.get(b.path)?.edged)
  const found = outermost(
    (worn?.data ?? []).filter((/** @type {any} */ b) => drawn(b) && !swatch(b) && !seen(plainOf.get(b.path)))
  )
  const findings = found.map((b) => {
    const was = plainOf.get(b.path)
    return {
      at: b.at,
      size: `${b.w}×${b.h}`,
      top: b.top,
      was: was ? `${was.w}×${was.h}${was.draws ? '' : ', drew nothing'}` : 'not shown',
      by: 'system'
    }
  })
  return { count: findings.length, findings }
}
