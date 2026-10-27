/**
 * Blocks a visitor sees as empty (G3 of PR 2, 14/10/2026): a large box whose content is there in the
 * markup but nothing of it shows: its words are the colour of its ground, its pictures never loaded
 * (lazy images waiting for a script the preview does not run), its cards lost their outline. JA Resort
 * Joomla under Moxie: the "Exclusive Luxury Properties" cards became pure black boxes, and a flat grey
 * slab of about 1180 × 275 px stood in the blog area. PREV-1's empty check reads the markup (no text,
 * no picture at all), so a block whose content is present but unseen passed.
 *
 * In the page: each large box (at least `minArea`, `minWidth` × `minHeight`), and whether anything in
 * its area is seen: a text reading at least `seenText` on its ground, a picture that loaded, a control,
 * a fill or border that steps off the box's ground, or words the box writes as its own text node
 * (JA Sensei's call-to-action banner, 16/10/2026: its only element child is an icon). A box laid over a
 * loaded picture that is not its own (a photo sibling under it, read from what the page paints at its
 * centre) stands on that picture and is seen: whether its words read there is photo-text's question.
 * A fill between them drawn at CSS opacity (a dimming scrim, WordPress's cover block) does not hide it.
 * A finding is the outermost box with nothing seen.
 * `by` says whether the template's own preview was already empty there.
 */
import { byPath, outermost, PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'empty-block'

const LIMITS = Object.freeze({
  minArea: 150000,
  minWidth: 300,
  minHeight: 120,
  seenText: 1.5,
  seenFill: 1.15
})

export const probe = `(() => {${PAGE_HELPERS}
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const opaque = (x) => { const c = ch(getComputedStyle(x).backgroundColor); return c && c.a > 0.9 ? c : null }
  const groundOf = (x) => { for (let y = x; y; y = y.parentElement) { if (/url\\(|gradient/.test(getComputedStyle(y).backgroundImage)) return null; const c = opaque(y); if (c) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const inside = (a, b) => a.right > b.left + 2 && a.left < b.right - 2 && a.bottom > b.top + 2 && a.top < b.bottom - 2
  // the words an element draws as its own text nodes, if they read on its ground
  const ownText = (x, xs) => {
    if (![...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || (parseFloat(xs.fontSize) || 0) < 6) return null
    const fg = ch(xs.color)
    const tg = groundOf(x)
    return !tg || (fg && fg.a > 0.3 && ratio(fg, tg) >= ${LIMITS.seenText}) ? 'text' : null
  }
  // what in this element is seen, if anything (a reason), judged against its own ground
  const shows = (x, xs, xr, box) => {
    const tag = x.tagName
    if (/^(IMG)$/.test(tag)) return x.complete && x.naturalWidth > 0 && xr.width >= 16 && xr.height >= 16 ? 'picture' : null
    if (/^(VIDEO|CANVAS|IFRAME|SVG|svg|INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag)) return xr.width >= 12 && xr.height >= 12 ? tag.toLowerCase() : null
    if (/url\\(|gradient/.test(xs.backgroundImage)) return 'picture'
    const g = x.parentElement ? groundOf(x.parentElement) : null
    const f = ch(xs.backgroundColor)
    if (g && f && f.a > 0.5 && xr.width * xr.height >= 2000 && ratio(f, g) >= ${LIMITS.seenFill}) return 'fill'
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const bw = parseFloat(xs['border' + side + 'Width']) || 0
      const bc = ch(xs['border' + side + 'Color'])
      if (g && bw >= 1 && bc && bc.a > 0.3 && ratio(bc, f && f.a > 0.9 ? f : g) >= ${LIMITS.seenFill} && (side === 'Top' || side === 'Bottom' ? xr.width : xr.height) >= 24) return 'border'
    }
    return ownText(x, xs)
  }
  // a loaded picture painted under the box's centre that is not its own (a photo sibling the box is laid
  // over, JA Vogue's article hero, 18/10/2026): the box stands on a picture, and its words there are
  // photo-text's. The first opaque fill under the box hides anything further down.
  const standsOnPicture = (e) => {
    const x0 = scrollX, y0 = scrollY
    let r = e.getBoundingClientRect()
    if (r.top + r.height / 2 < 0 || r.top + r.height / 2 >= innerHeight) { scrollTo(x0, y0 + r.top + r.height / 2 - innerHeight / 2); r = e.getBoundingClientRect() }
    try {
      const at = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      let below = !at.includes(e)
      for (const x of at) {
        if (x === e) { below = true; continue }
        if (!below || e.contains(x)) continue
        const xs = getComputedStyle(x), xr = x.getBoundingClientRect()
        if (x.tagName === 'IMG' && x.complete && x.naturalWidth > 0 && xr.width >= 16 && xr.height >= 16) return true
        if (x.tagName === 'VIDEO' && xr.width >= 16 && xr.height >= 16) return true
        if (/url\\(|gradient/.test(xs.backgroundImage)) return true
        // a fill drawn through CSS opacity is a scrim over the picture, not a ground that hides it
        // (WordPress's cover block dims its photo with an opaque span at opacity .6, JA Morgan WP 1.1.16)
        let shown = 1
        for (let y = x; y && !y.contains(e); y = y.parentElement) shown *= +getComputedStyle(y).opacity
        const c = ch(xs.backgroundColor)
        if (c && c.a > 0.9 && shown > 0.9) return false
      }
      return false
    } finally { if (scrollX !== x0 || scrollY !== y0) scrollTo(x0, y0) }
  }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 120) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < ${LIMITS.minWidth} || r.height < ${LIMITS.minHeight} || r.width * r.height < ${LIMITS.minArea}) continue
    if (/^(IMG|VIDEO|CANVAS|IFRAME|SVG|svg|PICTURE)$/.test(e.tagName) || /url\\(|gradient/.test(cs.backgroundImage)) continue
    // the box's own words count too: JA Sensei's call-to-action banner writes them straight into the anchor
    let what = ownText(e, cs)
    let held = what ? 1 : 0
    if (!what) for (const x of e.querySelectorAll('*')) {
      const xs = getComputedStyle(x)
      if (xs.display === 'none' || xs.visibility === 'hidden' || +xs.opacity === 0) continue
      const xr = x.getBoundingClientRect()
      if (xr.width < 1 || xr.height < 1 || !inside(xr, r)) continue
      held++
      what = shows(x, xs, xr, r)
      if (what) break
    }
    if (!what && held && standsOnPicture(e)) what = 'on picture'
    const g = groundOf(e)
    out.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), held, seen: what, ground: g })
  }
  return out
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const plainOf = byPath(plain?.data)
  // a box with content in the markup that shows none of it; an empty box with nothing at all is PREV-1's
  const empty = outermost((worn?.data ?? []).filter((b) => !b.seen && b.held > 0))
  const findings = empty.map((b) => {
    const was = plainOf.get(b.path)
    return {
      at: b.at,
      size: `${b.w}×${b.h}`,
      top: b.top,
      held: b.held,
      by: was && !was.seen ? 'template' : 'system'
    }
  })
  return { count: findings.length, findings }
}
