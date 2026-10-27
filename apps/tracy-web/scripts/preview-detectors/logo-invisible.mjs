/**
 * Logo invisible on its new ground (Moxie audit, 14/10/2026: ja-trip and ja-vogue had their already
 * light dark-mode logo inverted by a blind `filter: invert(1)` onto a dark header; nova, prodex, rent
 * and sensei kept a dark logo made for a white band on the system's dark band).
 *
 * The probe lists the site's own logo (an image or SVG in the header, footer or nav, inside a logo /
 * brand box or a link home) with the ground it sits on, the CSS filter it wears and, when the browser
 * lets the page read its pixels, the luminance of its ink after that filter.
 *
 * `detect` judges each logo of the worn page against the same logo on the template's own page. Ink:
 * the measured pixels when readable; otherwise the template's page tells it, since a logo is made to
 * read on its own ground: a light ground means dark ink, a dark ground light ink, and an inversion the
 * system added (or removed) flips it. A logo whose ink falls under 3:1 against its new ground, where
 * the template's page read at 3:1 or more, is one finding. A logo over a picture is not judged: a picture
 * among its ancestors, or one met under its centre before any opaque layer (a header overlapping the
 * next section's photograph, JA Vega 1.0.7, 16/10/2026).
 */
import { COLOUR_IN_PAGE } from '../../src/sites/design-system-preview-probe.js'
export const kind = 'logo-invisible'

/** The contrast floor of a logo against its ground (WCAG non-text contrast). */
export const LOGO_FLOOR = 3

export const probe = `(async () => {
${COLOUR_IN_PAGE}
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const pathOf = (e) => { const out = []; for (let x = e; x && x !== document.body && out.length < 14; x = x.parentElement) { let i = 1; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName) i++; out.unshift(x.tagName.toLowerCase() + ':' + i) } return out.join('/') }
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  // A layer under the logo's centre comes first: a header that overlaps the next section (JA Vega's
  // .header-overlap, no ground of its own) lays the logo on that section's photograph, a sibling, while its
  // ancestors' only fill is the page. A picture or gradient met there before any opaque layer is the
  // logo's ground: a logo over a picture, not judged. An opaque layer met first is the logo's ground, a
  // sibling's as much as an ancestor's (JA Sensei 1.0.5: a hero pulled up under a header with no fill of its
  // own, painted a solid navy by a system; the ancestors' fill was the page's light grey). Layers painted
  // above the logo are not its ground. 'picture', the opaque colour, or null when nothing opaque is there.
  const under = (e) => { const r = e.getBoundingClientRect(); let below = false; for (const x of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) { if (x === e) { below = true; continue } if (!below) continue; const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage)) return 'picture'; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c } return null }
  // the ground: the first opaque layer under the logo, else the nearest opaque fill; null over a picture or a gradient
  const ground = (e) => { const u = under(e); if (u === 'picture') return null; if (u) return u; for (let x = e.parentElement; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  // the filters on the logo and its ancestors, as one chain, innermost first
  const filters = (e) => { const out = []; for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const f = getComputedStyle(x).filter; if (f && f !== 'none') out.push(f) } return out.join(' ') }
  const apply = (c, chain) => { let { r, g, b } = c; for (const m of chain.matchAll(/(invert|brightness|grayscale|contrast)\\(([\\d.]+)(%?)\\)/g)) { const k = +m[2] / (m[3] ? 100 : 1); if (m[1] === 'invert') { r = r + (255 - 2 * r) * k; g = g + (255 - 2 * g) * k; b = b + (255 - 2 * b) * k } else if (m[1] === 'brightness') { r *= k; g *= k; b *= k } else if (m[1] === 'contrast') { r = (r - 128) * k + 128; g = (g - 128) * k + 128; b = (b - 128) * k + 128 } else { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (y - r) * k; g += (y - g) * k; b += (y - b) * k } } const cl = (v) => Math.max(0, Math.min(255, v)); return { r: cl(r), g: cl(g), b: cl(b) } }
  // the median luminance of the ink after the filter; null when the pixels cannot be read (cross-origin)
  const inkOf = async (e, chain) => {
    try {
      let src = null
      if (e.tagName !== 'IMG') {
        // an inline SVG: the computed fill and stroke of its shapes are its ink
        const ls = []
        for (const sh of e.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line, text, use')) {
          const cs = getComputedStyle(sh)
          if (cs.display === 'none' || +cs.opacity === 0) continue
          for (const p of [cs.fill, cs.stroke]) { const c = ch(p); if (c && c.a > 0.5 && !/none|url/.test(p)) ls.push(lum(apply(c, chain))) }
        }
        if (!ls.length) return null
        ls.sort((a, b) => a - b)
        return Math.round(ls[ls.length >> 1] * 10000) / 10000
      }
      if (!e.complete) await new Promise((ok) => { e.onload = ok; e.onerror = ok; setTimeout(ok, 3000) })
      src = e
      const w = Math.min(src.naturalWidth || 0, 400), h = Math.min(src.naturalHeight || 0, 200)
      if (!w || !h) return null
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      const cx = cv.getContext('2d'); cx.drawImage(src, 0, 0, w, h)
      const px = cx.getImageData(0, 0, w, h).data
      const ls = []
      for (let i = 0; i < px.length; i += 16) if (px[i + 3] > 128) ls.push(lum(apply({ r: px[i], g: px[i + 1], b: px[i + 2] }, chain)))
      if (ls.length < 8) return null
      ls.sort((a, b) => a - b)
      return Math.round(ls[ls.length >> 1] * 10000) / 10000
    } catch { return null }
  }
  const brandBox = '[class*="logo" i], [id*="logo" i], .navbar-brand, .brand, .site-title, .site-branding, .custom-logo-link, .wp-block-site-logo'
  const band = 'header, footer, nav, [id*="header" i], [class*="header" i], [id*="footer" i], [class*="footer" i], [class*="navbar" i], [id*="topbar" i]'
  const home = (a) => { if (!a || /^\\s*(#|$|javascript:)/i.test(a.getAttribute('href') || '')) return false; try { const u = new URL(a.getAttribute('href') || '', location.href); return /^\\/(index\\.php)?$/.test(u.pathname) && !u.hash } catch { return false } }
  const W = document.documentElement.clientWidth
  const out = []
  for (const e of document.querySelectorAll('body img, body svg')) {
    if (e.tagName.toLowerCase() === 'svg' && e.parentElement && e.parentElement.closest('svg')) continue
    if (!e.closest(band)) continue
    const own = /logo/i.test((e.getAttribute('class') || '') + ' ' + (e.getAttribute('src') || '') + ' ' + (e.getAttribute('alt') || ''))
    if (!own && !e.closest(brandBox) && !home(e.closest('a'))) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = e.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.right <= 0 || r.left >= W) continue
    let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity
    if (op < 0.1) continue
    const chain = filters(e)
    const g = ground(e)
    out.push({ path: pathOf(e), at: label(e), src: (e.getAttribute('src') || '').split('/').slice(-2).join('/') || null, filter: chain || null, ground: g, ink: await inkOf(e, chain) })
    if (out.length >= 6) break
  }
  return out
})()`

const lin = (/** @type {number} */ v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** @param {{ r: number, g: number, b: number }} c */
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
const ratio = (/** @type {number} */ a, /** @type {number} */ b) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
/** Whether a filter chain inverts the logo (an odd number of inversions of 50% or more). */
const inverts = (/** @type {string | null} */ f) =>
  [...String(f ?? '').matchAll(/invert\(([\d.]+)(%?)\)/g)].filter((m) => +m[1] / (m[2] ? 100 : 1) >= 0.5)
    .length %
    2 ===
  1
/** The luminance where black and white contrast alike with a ground. */
const MID = 0.179

/**
 * @param {{ worn: { data?: any[] }, plain: { data?: any[] } }} input
 * @returns {{ count: number, findings: { at: string, src: string | null, contrast: number, was: number | null, filter: string | null, how: string }[] }}
 */
export function detect({ worn, plain }) {
  const before = Array.isArray(plain?.data) ? plain.data : []
  const findings = []
  for (const logo of Array.isArray(worn?.data) ? worn.data : []) {
    if (!logo?.ground) continue
    const twin =
      before.find((p) => p.path === logo.path) ?? before.find((p) => logo.src && p.src === logo.src) ?? null
    const ground = lum(logo.ground)
    /** @type {number | null} */
    let ink = null
    let how = 'pixels'
    /** @type {number | null} */
    let was = null
    if (typeof logo.ink === 'number') {
      ink = logo.ink
      if (twin?.ground && typeof twin.ink === 'number') was = ratio(twin.ink, lum(twin.ground))
    } else if (twin?.ground) {
      // the template's page: the ink is the far side of its own ground, flipped by an added inversion
      how = 'ground'
      const dark = lum(twin.ground) > MID
      const flipped = inverts(logo.filter) !== inverts(twin.filter)
      ink = dark !== flipped ? 0 : 1
      was = ratio(dark ? 0 : 1, lum(twin.ground))
    }
    if (ink === null) continue
    const contrast = ratio(ink, ground)
    if (contrast >= LOGO_FLOOR || (was !== null && was < LOGO_FLOOR)) continue
    findings.push({
      at: logo.at,
      src: logo.src ?? null,
      contrast: Math.round(contrast * 100) / 100,
      was: was === null ? null : Math.round(was * 100) / 100,
      filter: logo.filter ?? null,
      how
    })
  }
  return { count: findings.length, findings }
}
