/**
 * Things the template shows that the system made disappear (Akemi's eye check of JA Tour, 17/10/2026:
 * the login module's "Sign in with a passkey" button was there on the template's page and gone under a
 * system, the Remember Me row moved up into its place). No rule compared what is shown at all: every
 * detector judges the boxes it finds on the worn page, and a box that is not drawn is never found.
 *
 * In the page: every element a visitor reads or uses (words of its own, a link, a button, a control, a
 * picture, an icon) whether it is seen (`seen` of PAGE_HELPERS) and its size. A finding is an element
 * seen on the template's own page at least `minArea` px² whose region (its form, module, section…) is
 * seen on the worn page while the element is not (display none, hidden, faded out, no size). The outermost only.
 * An element inside an ancestor faded out (opacity 0, a control a script shows on scroll) is not seen on either page. A logo or a light
 * and dark pair the template swaps by scheme (a class naming logo, brand, dark, light, theme or mode on
 * it or a near ancestor) is left out: the system choosing the other variant is not a loss.
 *
 * A mark (a small box with no words, no picture, no child and no glyph in a pseudo-element, seen only by its own fill or outline: a
 * timeline dot, a bullet, a divider tick) is lost too when the system paints it into its ground: JA
 * Resume's timeline dots (17/10/2026), red and grey on the template's page, the page colour under every
 * system (a follow rule painted .item-icon the warm surface). It stays laid out, so `seen` keeps it; its
 * paint against the first opaque ground behind it says whether the visitor still sees it. A finding is a
 * mark at least `markContrast` from its ground on the template's page and under `meltedContrast` worn.
 *
 * An element laid out but scrolled out of sight inside a scroller (an ancestor with overflow auto or scroll,
 * the element past its box or past the viewport's edge) is not lost: the visitor scrolls that row to it
 * (JA Kinetic 1.0.8's blog topic chip "cost", dot-1 at probe 10, 18/10/2026). Nor is an element whose opacity a
 * script writes inline (a hover twin a script fades in and out): its state is the script's moment, not the system's.
 *
 * An element whose visibility follows the page's scroll position (a back-to-top button a scroll handler shows
 * past the first screen) is compared at the same scroll state on both pages. The page is measured after a walk
 * down it that ends at the top, and JA Vogue Joomla 1.0.8's arrow (`#back-to-top i`) was caught still shown on
 * the template's page and already hidden worn on one take, nothing on the next (22/10/2026). `read` scrolls the
 * page down and back, and records, for each element whose box comes or goes, what it shows in each state
 * (`byScroll`); such an element is lost when the template's page shows it in a state where the worn page does
 * not, or when the measure saw it shown on the template's page and lost worn and no state saw both pages show it.
 */
import { byPath, outermost, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'missing-element'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const MISSING_LIMITS = Object.freeze({
  minArea: 400,
  /** a mark: each side from 4 to 48 px */
  markMin: 4,
  markMax: 48,
  /** seen on the template's page from this contrast with its ground... */
  markContrast: 1.5,
  /** ...and painted into its ground under this one worn */
  meltedContrast: 1.15
})

/** In the page, after PAGE_HELPERS: `each()` (the elements judged, in probe order), `shownBox(e)` and `regionSeen(e)`. */
const SHOWN = `
  const SEL = 'a, button, input, select, textarea, label, img, svg, video, iframe, [role=button], .btn, h1, h2, h3, h4, h5, h6, p, li, i[class], span[class*=icon], span[class*=fa-]'
  const VARIANT = /logo|brand|dark|light|theme|mode|sticky|mobile|offcanvas|off-canvas|collapse|dropdown|modal|tooltip|popover/i
  const variant = (e) => { for (let x = e, i = 0; x && i < 4; x = x.parentElement, i++) if (typeof x.className === 'string' && VARIANT.test(x.className + ' ' + x.id)) return true; return false }
  // an ancestor faded out hides the element as much as its own opacity: JA Morgan's back-to-top button sits in
  // #back-to-top at opacity 0 until a script shows it on scroll, so on the template's page it was never seen
  // (the worn page's worn-only visibility:hidden on it is no loss, 17/10/2026)
  const faded = (e) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) if (+getComputedStyle(x).opacity === 0) return true; return false }
  const shownBox = (e) => { const cs = getComputedStyle(e); return faded(e) ? null : seen(e, cs) }
  // the region it belongs to (a form, a module, a section): a whole region hidden is one loss, read on its own words
  const regionOf = (e) => e.parentElement && e.parentElement.closest('form, section, aside, main, nav, header, footer, article, [class*=module], [class*=card]')
  const regionSeen = (e) => { const region = regionOf(e); return region ? !!shownBox(region) : true }
  const each = function* () { let n = 0; for (const e of document.querySelectorAll(SEL)) { if (n >= 3000) return; if (variant(e)) continue; n++; yield e } }
`

export const probe = `(() => {${PAGE_HELPERS}${SHOWN}
  // laid out but scrolled out of sight inside a scroller (an ancestor with overflow auto or scroll): a visitor
  // reaches it by scrolling that row, so it is not lost. JA Kinetic's blog topic chips sit in a horizontal
  // scroller (.hx-blogtopics .hx-container, overflow-x auto); a system's wider chips pushed "cost" past the
  // viewport's right edge, where seen() reads no box (dot-1 at probe 10, 18/10/2026)
  const CAROUSEL = /owl|carousel|slick|swiper|splide|glide|slider/i
  const scrolledAway = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    for (let x = e.parentElement; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
      const xs = getComputedStyle(x)
      // a scroller that really scrolls on that axis, with the element outside its box (or past the viewport)
      // or a carousel's track, clipped (overflow hidden) and wider than its box: its next slides lie past the
      // edge by design, and a system's wider gutter moves one from a sliver inside the viewport to just past it
      // (JA Symphony Joomla's article carousel, "Rare Jeff Buckley…" at 1407px then 1450px of a 1440px page, dot 3)
      const track = /(hidden|clip)/.test(xs.overflowX) && CAROUSEL.test(String(x.className) + ' ' + String(x.parentElement?.className ?? ''))
      const sx = (/(auto|scroll)/.test(xs.overflowX) || track) && x.scrollWidth > x.clientWidth + 1
      const sy = /(auto|scroll)/.test(xs.overflowY) && x.scrollHeight > x.clientHeight + 1
      if (!sx && !sy) continue
      const q = x.getBoundingClientRect()
      if (sx && (r.left >= Math.min(q.right, W) - 1 || r.right <= Math.max(q.left, 0) + 1)) return true
      if (sy && (r.top >= q.bottom - 1 || r.bottom <= q.top + 1)) return true
    }
    return false
  }
  const out = []
  for (const e of each()) {
    const r = shownBox(e)
    out.push({ path: pathOf(e), at: label(e), text: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40), area: r ? Math.round(r.width * r.height) : 0, parentSeen: regionSeen(e), ...(!r && scrolledAway(e) && { scrolled: true }), ...(/opacity/i.test(e.getAttribute('style') || '') && { scripted: true }) })
  }
  // marks: childless boxes with no words, seen only by their own fill or outline, with the first opaque
  // ground behind them (an ancestor's fill; a picture or gradient on the way leaves the ground unknown)
  const marks = []
  for (const e of document.querySelectorAll('body *')) {
    if (marks.length >= 600) break
    if (e.children.length || (e.textContent || '').trim() || /^(IMG|SVG|VIDEO|IFRAME|INPUT|SELECT|TEXTAREA|BUTTON|CANVAS|PICTURE|svg|path)$/.test(e.tagName)) continue
    const cs = getComputedStyle(e)
    const r = shownBox(e)
    if (!r || r.width < ${MISSING_LIMITS.markMin} || r.height < ${MISSING_LIMITS.markMin} || r.width > ${MISSING_LIMITS.markMax} || r.height > ${MISSING_LIMITS.markMax}) continue
    if (cs.backgroundImage !== 'none' || variant(e)) continue
    // an icon draws its glyph in a pseudo-element: a disc behind it the system dropped leaves the glyph
    // (JA Morgan's accordion span.fa-minus), which the icon detectors judge
    const glyph = (k) => { const p = getComputedStyle(e, k).content; return p && p !== 'none' && p !== 'normal' }
    if (glyph('::before') || glyph('::after')) continue
    const fill = ch(cs.backgroundColor)
    const bw = parseFloat(cs.borderTopWidth) || 0
    const line = bw >= 1 && cs.borderTopStyle !== 'none' ? ch(cs.borderTopColor) : null
    const paints = [fill, line].filter((c) => c && c.a > 0.5)
    if (!paints.length) continue
    let ground = null
    for (let x = e.parentElement; x; x = x.parentElement) { const c2 = getComputedStyle(x); if (c2.backgroundImage !== 'none') break; const c = ch(c2.backgroundColor); if (c && c.a > 0.9) { ground = c; break } }
    if (!ground && !e.parentElement?.closest('[style*=background-image]')) ground = { r: 255, g: 255, b: 255, a: 1 }
    if (ground) marks.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), paints, ground })
  }
  return { elements: out, marks }
})()`

/** How far `read` scrolls the page down (px, less on a shorter page), and how long each state settles (ms). */
export const SCROLL_STATES = Object.freeze({ down: 1200, settle: 700 })

/**
 * In the page: every judged element's [area, region seen] at the top (the page's own starting scroll, settled)
 * and scrolled down, for those whose box comes or goes between the measure, the top and down; the page left at
 * its starting scroll, settled. Nothing on a page that does not scroll.
 */
const scrollProbe = (
  /** @type {number} */ down,
  /** @type {number} */ settle
) => `(async () => {${PAGE_HELPERS}${SHOWN}
  const se = document.scrollingElement || document.documentElement
  const y0 = scrollY
  const room = se.scrollHeight - innerHeight
  if (room < 2) return {}
  // instant: a page with scroll-behavior smooth would still be on its way when a state is read
  const go = (y) => se.scrollTo({ top: y, behavior: 'instant' })
  const rest = async () => { await new Promise((r) => setTimeout(r, ${settle})); for (let t = 0; t < 20; t++) { const a = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.getComputedTiming?.().endTime !== Infinity) : []; if (!a.length) break; await new Promise((r) => setTimeout(r, 100)) } }
  const read = () => { const m = new Map(); for (const e of each()) { const r = shownBox(e); m.set(pathOf(e), [r ? Math.round(r.width * r.height) : 0, regionSeen(e) ? 1 : 0]) } return m }
  const now = read()
  go(Math.min(room, Math.max(y0 + ${down}, innerHeight)))
  await rest()
  const below = read()
  go(y0)
  await rest()
  const top = read()
  const out = {}
  for (const [path, t] of top) {
    const d = below.get(path) ?? [0, 0]
    const n = now.get(path) ?? [0, 0]
    if (!t[0] !== !d[0] || !t[0] !== !n[0]) out[path] = { top: t, down: d }
  }
  return out
})()`

/**
 * The second step on the open page: the elements whose visibility follows the scroll position get `byScroll`.
 * @param {any} chrome @param {any} data
 */
export async function read(chrome, data, s = SCROLL_STATES) {
  if (!data?.elements) return data
  const toggles = (await chrome.evaluate(scrollProbe(s.down, s.settle)).catch(() => null)) ?? {}
  if (!Object.keys(toggles).length) return data
  return {
    ...data,
    elements: data.elements.map((/** @type {any} */ e) =>
      toggles[e.path] ? { ...e, byScroll: toggles[e.path] } : e
    )
  }
}

/** An element's [area, region seen] in a scroll state: its own when it follows the scroll, else as measured. */
const inState = (/** @type {any} */ e, /** @type {'top' | 'down'} */ k) =>
  e.byScroll?.[k] ?? [e.area, e.parentSeen ? 1 : 0]

/** The best contrast a mark's paints (fill, outline) make with its ground. @param {any} m */
const markContrast = (m) => Math.max(1, ...m.paints.map((/** @type {any} */ c) => ratio(c, m.ground)))

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = MISSING_LIMITS) {
  const wornOf = byPath(worn?.data?.elements)
  const lost = (plain?.data?.elements ?? []).filter((/** @type {any} */ b) => {
    const now = wornOf.get(b.path)
    // an element whose opacity a script writes on it (a hover twin faded in and out by jQuery: JA Social II's
    // client logos, a colour copy over each grey logo, faded in on one take and out on the next as the hover
    // probes pass over it, 20/10/2026) is in a script's passing state on either page, not a look the system chose
    if (!now || now.scrolled || b.scripted || now.scripted) return false
    const measured = b.area >= t.minArea && now.parentSeen && now.area === 0
    if (!b.byScroll && !now.byScroll) return measured
    // shown or hidden by the scroll position on either page: judged state by state, never across two
    const states = /** @type {const} */ (['top', 'down'])
    if (
      states.some((k) => {
        const [was] = inState(b, k)
        const [is, region] = inState(now, k)
        return was >= t.minArea && region && is === 0
      })
    )
      return true
    // what the measure saw stands unless the worn page was seen showing the element in a state where the
    // template's page shows it too: a button shown only past the read's reach, which the system hides
    // everywhere, is still lost (the read never saw the state the measure caught it in)
    return measured && !states.some((k) => inState(b, k)[0] > 0 && inState(now, k)[0] > 0)
  })
  const findings = outermost(lost).map((b) => ({ at: b.at, text: b.text, was: `${b.area}px²`, by: 'system' }))
  // marks painted into their ground: seen on the template's page, the ground's own colour worn
  const wornMarks = byPath(worn?.data?.marks)
  for (const m of plain?.data?.marks ?? []) {
    const now = wornMarks.get(m.path)
    if (!now) continue
    const was = markContrast(m)
    const is = markContrast(now)
    if (was >= t.markContrast && is < t.meltedContrast)
      findings.push({
        at: m.at,
        text: '',
        was: `${m.w}×${m.h} mark at ${was.toFixed(2)}:1 on its ground`,
        why: `painted into its ground (${is.toFixed(2)}:1)`,
        by: 'system'
      })
  }
  return { count: findings.length, findings }
}
