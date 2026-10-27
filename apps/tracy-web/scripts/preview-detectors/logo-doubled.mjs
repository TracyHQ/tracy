/**
 * Two logos where the template means one (G4 of PR 2, 14/10/2026: JA Vega WordPress under Moxie, light
 * visitor scheme, showed two "Vega" logos side by side in its header: the drawer's copy of the logo,
 * `.jv-drawer__logo`, which the live site keeps out of the desktop header, shows in the preview).
 *
 * The probe lists, per region (the header and the footer), the site's own logos a visitor sees: an
 * image or SVG in a header, footer or nav band, inside a logo / brand box, named "logo", or in a link
 * home, not in a list item unless named "logo"; displayed, not hidden, not faded out, on screen, and at
 * least 28 px on its long side (a social or toggle icon is not a logo). Each carries a signature: its
 * picture, or its SVG's shape.
 *
 * `detect` judges each region of the worn page: it shows a logo twice when it shows more logos than
 * the same region of the template's page, or the same logo (one signature) more than once. Like a
 * collapsed button, it is judged on what the visitor of the preview sees, whether the template's
 * page in the preview already doubled it or the system did; `was` says which, for the fix.
 */
import { PAGE_HELPERS } from './lib/colour.mjs'

export const kind = 'logo-doubled'

/** The regions a logo is counted in. */
export const REGIONS = Object.freeze(['header', 'footer'])

export const probe = `(() => {${PAGE_HELPERS}
  const brandBox = '[class*="logo" i], [id*="logo" i], .navbar-brand, .brand, .site-title, .site-branding, .custom-logo-link, .wp-block-site-logo'
  const band = 'header, footer, nav, [id*="header" i], [class*="header" i], [id*="footer" i], [class*="footer" i], [class*="navbar" i], [id*="topbar" i]'
  const foot = 'footer, [id*="footer" i], [class*="footer" i]'
  const home = (a) => { if (!a || /^\\s*(#|$|javascript:)/i.test(a.getAttribute('href') || '')) return false; try { const u = new URL(a.getAttribute('href') || '', location.href); return /^\\/(index\\.php)?$/.test(u.pathname) && !u.hash } catch { return false } }
  const out = { header: [], footer: [] }
  for (const e of document.querySelectorAll('body img, body svg')) {
    if (e.tagName.toLowerCase() === 'svg' && e.parentElement && e.parentElement.closest('svg')) continue
    if (!e.closest(band)) continue
    const own = /logo/i.test((e.getAttribute('class') || '') + ' ' + (e.getAttribute('src') || '') + ' ' + (e.getAttribute('alt') || ''))
    if (!own && !e.closest(brandBox) && !home(e.closest('a'))) continue
    // a list of icons (social links, a menu) is not a logo unless the picture says so
    if (!own && e.closest('li')) continue
    const r = seen(e, getComputedStyle(e))
    if (!r || r.width < 8 || r.height < 8 || Math.max(r.width, r.height) < 28) continue
    let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity
    if (op < 0.1) continue
    // a logo below the first screen is the footer's whatever its box is named (T4's #t4-footnav: JA Resort's
    // footer logo counted as a second header logo, 16/10/2026)
    const region = e.closest(foot) || r.top + scrollY > Math.max(innerHeight, 800) ? 'footer' : 'header'
    if (out[region].length >= 8) continue
    const src = (e.getAttribute('src') || '').split('/').slice(-2).join('/') || null
    const sig = src || 'svg:' + (e.getAttribute('viewBox') || '') + ':' + e.innerHTML.length
    out[region].push({ path: pathOf(e), at: label(e), src, sig, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
  }
  return out
})()`

/**
 * @param {{ worn: { data?: any }, plain: { data?: any } }} input
 * @returns {{ count: number, findings: { at: string, region: string, visible: number, was: number | null, logos: string[] }[] }}
 */
export function detect({ worn, plain }) {
  const findings = []
  let count = 0
  for (const region of REGIONS) {
    const now = Array.isArray(worn?.data?.[region]) ? worn.data[region] : []
    const before = Array.isArray(plain?.data?.[region]) ? plain.data[region] : null
    // more logos than the template's page shows in that region, or one logo shown twice
    const more = before ? now.length - Math.max(before.length, 1) : 0
    const twice = now.length - new Set(now.map((l) => String(l.sig ?? l.src ?? l.path))).size
    const extra = Math.max(more, twice)
    if (extra <= 0) continue
    count += extra
    findings.push({
      at: `${region}: ${now.length} logos visible (${now.map((l) => l.at).join(', ')})`,
      region,
      visible: now.length,
      was: before ? before.length : null,
      logos: now.map((l) => String(l.src ?? l.at))
    })
  }
  return { count, findings }
}
