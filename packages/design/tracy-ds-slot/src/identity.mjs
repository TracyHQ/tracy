/**
 * IDENT-1 and MODE-1 (ADR 0031, amended 13/10/2026): does the logo or brand mark still show once a
 * system is worn, and is the page the system's side of light? PURE: the probe is a string run IN the
 * page, the verdicts take what it returned.
 */
import { luminance, parseHex } from './colour.mjs'
import { channels } from './probe.mjs'

/**
 * Where a template shows its logo, when the contract does not say (`selectors.logo`): the first
 * picture, drawing or text mark inside the page's first link to its home, else inside anything
 * called a logo or a brand.
 */
export const LOGO_SELECTORS = Object.freeze([
  'header a img',
  'header a svg',
  '.logo img',
  '.logo svg',
  '.navbar-brand img',
  '.navbar-brand svg',
  '.site-logo img',
  '.custom-logo',
  '[class*="logo"] img',
  '[class*="logo"] svg',
  '[class*="brand"] img',
  '[class*="brand"] svg',
  '.site-logo',
  // a site name or text logo inside the brand box, before any span in a header link: a header's
  // social or menu icons are spans in links too (JA Essence J6, 13/10/2026: a glyph-only icon span
  // was read as its logo and found empty)
  '.navbar-brand .site-name',
  '.logo .site-name',
  'header a > span',
  'header a span',
  '.logo a',
  '.navbar-brand',
  '[class*="logo"]',
  '[class*="brand"]'
])

/**
 * The logo as the page shows it now: its kind, box, what it holds and the colour it is drawn with
 * against what lies under it. `null` when nothing matches.
 * @param {string | string[] | undefined} selectors the contract's, else the defaults
 */
export const identityProbe = (selectors) => `(() => {
  const SEL = ${JSON.stringify(selectors ? [selectors].flat() : LOGO_SELECTORS)}
  const rgb = ${channels.toString()}
  const seen = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.bottom > 0 && r.top < innerHeight }
  let el = null
  for (const s of SEL) { try { el = [...document.querySelectorAll(s)].find(seen) ?? null } catch { el = null } if (el) break }
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const tag = el.tagName.toLowerCase()
  // what the mark holds: a picture that decoded, a drawing with shapes, or words
  const content = tag === 'img'
    ? (el.complete && el.naturalWidth > 0 ? 'picture:' + (el.currentSrc || el.src || '').split('/').pop() : '')
    : tag === 'svg' ? (el.querySelector('path, rect, circle, polygon, use, text, image') ? 'drawing:' + el.children.length : '')
    : (el.textContent || '').trim() ? 'text:' + (el.textContent || '').trim().slice(0, 40) : (cs.backgroundImage !== 'none' ? 'background' : '')
  // the ground under the mark: what is painted under its centre, top to bottom, the mark's own fill
  // first (a badge: Tracy Business's white monogram on its forest square). A picture there (an image,
  // a video, a background image: a logo on the hero photo, JA Space and JA Social II) is a ground with
  // no one colour, said as onPicture; an ancestor walk read the page colour behind the photo instead
  const opaque = (e) => { const m = rgb(getComputedStyle(e).backgroundColor); return m && (m.length < 4 || m[3] > 0.9) ? m.slice(0, 3) : null }
  const PICTURE = ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'image']
  let ground = opaque(el), onPicture = false
  if (!ground) {
    const under = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((e) => e !== el && !el.contains(e))
    for (const e of under) {
      if (PICTURE.includes(e.tagName) || /url\\(|gradient\\(/.test(getComputedStyle(e).backgroundImage)) { onPicture = true; break }
      ground = opaque(e)
      if (ground) break
    }
  }
  // nothing hit-testable under it (pointer-events: none): the first ancestor painting an opaque colour
  for (let g = el.parentElement; g && !ground && !onPicture; g = g.parentElement) ground = opaque(g)
  return { tag, width: Math.round(r.width), height: Math.round(r.height), content, color: rgb(cs.color)?.slice(0, 3) ?? null, ground, onPicture }
})()`

/**
 * MODE-2's first half: the template's own light/dark switch is still there to press once a system is
 * worn. `null` when the contract names no switch.
 * @param {string | undefined} selector the contract's `selectors.themeToggle`
 */
export const toggleProbe = (selector) =>
  selector
    ? `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 }); return el ? true : document.querySelector(${JSON.stringify(selector)}) ? false : null })()`
    : 'null'

/** WCAG contrast of two [r, g, b] triples. */
const ratio = (a, b) => {
  const l = (c) => luminance({ r: c[0], g: c[1], b: c[2] })
  const [x, y] = [l(a), l(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * IDENT-1 for one view: the mark is there, holds something, keeps the size the template gave it, and
 * (words) reads on its ground. `null` when the default page had no mark either (nothing to keep).
 * @param {ReturnType<typeof JSON.parse> | null} now the probe under the system
 * @param {ReturnType<typeof JSON.parse> | null} before the probe on the default page
 * @returns {boolean | null}
 */
export function identityVerdict(now, before) {
  if (!before) return null
  if (!now || !now.content) return false
  // a picture or drawing swapped for another is still a mark; one shrunk to nothing is not
  const kept = (a, b) => Math.abs(a - b) <= Math.max(2, 0.25 * Math.max(a, b))
  // a wordmark set in the system's face grows or narrows with that face (JA Social II's "JA Social II" is
  // 110px in Montserrat, 151px in MotherDuck's mono, 19/10/2026): only words shrunk away are lost
  const text = String(now.content).startsWith('text:') && String(before.content ?? '').startsWith('text:')
  const fits = (a, b) => (text ? a >= b * 0.75 - 2 : kept(a, b))
  if (!fits(now.width, before.width) || !fits(now.height, before.height)) return false
  // words on one colour read at 3:1, or at least as well as the template draws them itself (JA Resume's
  // white "CV" on its coral pill is 2.9:1 with no system worn), never under 2:1; words on a picture are
  // not judged here
  if (now.content.startsWith('text:') && now.color && now.ground) {
    const own = before.color && before.ground && !before.onPicture ? ratio(before.color, before.ground) : 3
    return ratio(now.color, now.ground) >= Math.max(2, Math.min(3, own - 0.05))
  }
  return true
}

/**
 * The side of light a page is from its ground (`modeOf` in probe.mjs reads the same line), as CSS
 * gives it: `rgb(…)`, `rgba(…)` or a hex.
 * @param {string | null | undefined} bg
 * @returns {'dark' | 'light' | null}
 */
export function pageModeOf(bg) {
  const hex = parseHex(String(bg ?? ''))
  const c = hex ? [hex.r, hex.g, hex.b] : channels(String(bg ?? ''))
  if (!c || (c.length === 4 && c[3] < 0.5)) return null
  return luminance({ r: c[0], g: c[1], b: c[2] }) < 0.3 ? 'dark' : 'light'
}

/**
 * MODE-1 for one view: the page is the system's side of light.
 * @param {string | null | undefined} pageBg the page's computed background
 * @param {boolean} systemDark the worn system's dark flag (`palette(profile).dark`)
 * @returns {boolean | null}
 */
export function modeMatch(pageBg, systemDark) {
  const mode = pageModeOf(pageBg)
  return mode === null ? null : mode === (systemDark ? 'dark' : 'light')
}
