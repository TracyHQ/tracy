/**
 * The icon glyphs of a page, read alike by icon-font and icon-contrast (Akemi's eye check of 17/10/2026).
 * An icon glyph is drawn by an icon font: the element's own words (`<i class="fa …">`) or, far more
 * often, the content of its ::before or ::after. Each glyph comes back with the first family it is set
 * in, whether that family is an icon font, its colour and the opaque ground under the element.
 */
import { PAGE_HELPERS } from './colour.mjs'

/** Families that draw icons, not words (Font Awesome, T4's and Joomla's icon sets, the common kits). */
export const ICON_FAMILY =
  /awesome|icomoon|icon|glyph|fontello|ionicons|material|themify|linearicons|elegant|simple-line|feather|bootstrap-icons|dashicons|eicons|la-solid|la-regular|la-brands|fa-|pe-icon|flaticon|mdi|remixicon|tabler/i

/** In the page: `icons()`, every glyph seen, `[{ path, at, part, family, icon, colour, ground, size, pua }]`. */
export const ICONS_IN_PAGE = `${PAGE_HELPERS}
  const ICON_FAMILY = ${ICON_FAMILY}
  const ICON_CLASS = /(^|\\s)(fa|fas|far|fab|fal|fad|fa-[\\w-]+|icon-[\\w-]+|bi|bi-[\\w-]+|glyphicon[\\w-]*|ion-[\\w-]+|la|la-[\\w-]+|ti-[\\w-]+|mdi|mdi-[\\w-]+|material-icons|dashicons[\\w-]*)(\\s|$)/
  const firstFamily = (f) => String(f || '').split(',')[0].trim().replace(/^["']|["']$/g, '')
  // a fill or a picture: 'picture', the opaque colour, or null for a layer that paints no ground
  const layer = (y) => { const cs = getComputedStyle(y); if (/url\\(|gradient/.test(cs.backgroundImage) || /^(IMG|VIDEO|PICTURE)$/.test(y.tagName)) return 'picture'; const c = ch(cs.backgroundColor); return c && c.a > 0.9 ? c : null }
  // the first layer painted under the glyph's element at its centre, a sibling's as much as an ancestor's
  // (JA Phio's newsletter: the paper plane is its cell's ::after, laid over the Subscribe button, the cell's
  // sibling input, while the cell's ancestors only paint the page). The element is brought into the window to
  // be hit; layers painted above it are not its ground. undefined when the element is not hit there.
  const under = (x) => { let r = x.getBoundingClientRect(); const cy = r.top + r.height / 2; if (cy < 0 || cy >= innerHeight) { window.scrollTo({ top: scrollY + cy - innerHeight / 2, behavior: 'instant' }); r = x.getBoundingClientRect() } let below = false; for (const y of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) { if (y === x) { below = true; continue } if (!below) continue; const l = layer(y); if (l) return l } return undefined }
  // the glyph's ground: its element's own fill, else the first layer under it, else its ancestors' nearest
  // fill; null over a picture or a gradient
  const groundOf = (x) => { const own = layer(x); if (own) return own === 'picture' ? null : own; const u = under(x); if (u) return u === 'picture' ? null : u; for (let y = x.parentElement; y; y = y.parentElement) { const l = layer(y); if (l) return l === 'picture' ? null : l } return { r: 255, g: 255, b: 255, a: 1 } }
  // a code point in the private use area: what icon fonts map their glyphs to
  const pua = (s) => [...s].some((c) => { const n = c.codePointAt(0); return (n >= 0xe000 && n <= 0xf8ff) || n >= 0xf0000 })
  const icons = () => {
    const out = []
    const sx = scrollX
    const sy = scrollY
    for (const e of document.querySelectorAll('body *')) {
      if (out.length >= 600) break
      const cs = getComputedStyle(e)
      const r = seen(e, cs)
      if (!r || r.width > 120 || r.height > 120) continue
      const cls = typeof e.className === 'string' ? e.className : ''
      const own = ICON_CLASS.test(cls)
      for (const part of ['::before', '::after', '']) {
        const s = part ? getComputedStyle(e, part) : cs
        let text = ''
        if (part) { if (!s.content || /^(none|normal)$/.test(s.content)) continue; text = s.content.replace(/^["']|["']$/g, '') }
        else text = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
        if (!text || text.length > 3 || s.display === 'none' || +s.opacity === 0) continue
        const family = firstFamily(s.fontFamily)
        const icon = ICON_FAMILY.test(family)
        if (!icon && !own && !pua(text)) continue
        out.push({ path: pathOf(e) + part, at: label(e) + part, family, icon, colour: ch(s.color), ground: groundOf(e), size: Math.round(parseFloat(s.fontSize) || 0), pua: pua(text) })
        break
      }
    }
    window.scrollTo({ left: sx, top: sy, behavior: 'instant' })
    return out
  }
`
