/**
 * What a visitor SEES in the design system preview, measured in the page (14/10/2026: the
 * Add site preview of JA Impact, Kinetic and Resort under Moxie looked broken while every built-site
 * rule passed, because those rules read a built site, never the preview, and let a template's own
 * colour blocks stay).
 *
 * `PREVIEW_PROBE` runs in a page and answers its blocks, texts and buttons with their colours, keyed
 * by a stable path so the same element can be found on the template's own page (no system) and on
 * the page wearing a system. `comparePreview` is pure: it judges the worn page against the default one.
 *
 * Four findings, each read by one rule (`measurement.mjs`):
 * - `kept`: a block the template paints in a colour of its own, large enough to be seen, still that
 *   colour under the system and far from every colour the system paints with (TPL-1);
 * - `glare`: under a system whose page is dark, a large neutral block far lighter than the page that
 *   is not a picture: a template or a role mapping that put a light ground on a dark system (TPL-1;
 *   JA Resort's rooms band in the system's secondary text colour under Moxie, 14/10/2026);
 * - `keptText`: a text in a brand colour of the template's own, still that colour under the system (TPL-1);
 * - `lowText`: a text under the floor (3:1) on its ground under the system, pictures left out (CON-2);
 * - `lostButtons`: a button whose shape the template showed (a fill or a border apart from its
 *   ground) and the system made vanish (BTN-1);
 * - `conformance`: the preview itself: a second document after the page, fonts that failed to load,
 *   main blocks that render empty (PREV-1).
 */

/**
 * `ch(css)` in the page: any computed colour as { r, g, b, a } on 0-255, or null (14/10/2026: a
 * colour-mix() computes to `color(srgb 0.26 0.25 0.23)`, whose numbers are 0-1, and the old reader
 * took them as 0-255, so every mixed ground read as black; Tracy Base WordPress's stats band was one).
 * rgb()/rgba() are read directly, anything else is painted on a 1-pixel canvas and read back.
 */
export const COLOUR_IN_PAGE = String.raw`
  const __cc = new Map()
  const __cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const ch = (s) => {
    s = String(s ?? '').trim()
    if (__cc.has(s)) return __cc.get(s)
    let out = null
    const m = /^rgba?\(([^)]*)\)$/i.exec(s)
    if (m) {
      const n = (m[1].match(/-?[\d.]+/g) || []).map(Number)
      out = n.length < 3 ? null : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }
    } else if (s && !/^(none|transparent|currentcolor|inherit|initial)$/i.test(s) && __cx) {
      __cx.fillStyle = '#010203'
      __cx.fillStyle = s
      if (__cx.fillStyle !== '#010203' || /^#010203$/i.test(s)) {
        __cx.clearRect(0, 0, 1, 1)
        __cx.fillRect(0, 0, 1, 1)
        const d = __cx.getImageData(0, 0, 1, 1).data
        out = { r: d[0], g: d[1], b: d[2], a: Math.round((d[3] / 255) * 1000) / 1000 }
      }
    }
    __cc.set(s, out)
    return out
  }
  // the pictures of the page (a background image or gradient, an <img>, <video>, <canvas>, <picture>) and
  // their boxes, read once per probe
  let __pics = null
  const __picsOf = () => {
    if (__pics) return __pics
    __pics = []
    for (const p of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(p)
      if (!/url\(|gradient/.test(cs.backgroundImage) && !/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(p.tagName)) continue
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
      const r = p.getBoundingClientRect()
      if (r.width * r.height >= 2500) __pics.push({ p, r })
    }
    return __pics
  }
  // whether words are painted on a picture that is not their ancestor, above the fill of g (the ancestor
  // whose fill the walk up found): a picture inside g, around neither, whose box holds the words' centre.
  // JA Space's transparent header is the hero's earlier sibling pulled over its photo (16/10/2026)
  const pictureUnder = (e, g) => {
    const r = e.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    return __picsOf().some(({ p, r: q }) => q.left <= x && x <= q.right && q.top <= y && y <= q.bottom && g.contains(p) && !p.contains(e) && !e.contains(p))
  }
  // the opaque layer really painted under the words, when it is not their ancestor: the first element below
  // them in the stack at their centre that is neither their ancestor nor inside them, met before g (the
  // ancestor whose fill the walk up found); its fill, or null when none (or the centre is off the viewport,
  // or the words are not in the stack). JA Sensei's header is the hero's earlier sibling pulled over it:
  // its menu sat on the hero's band, while its ancestors' only fill was the page (16/10/2026)
  const layerUnder = (e, g) => {
    const r = e.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
    const stack = document.elementsFromPoint(x, y)
    const at = stack.indexOf(e)
    if (at < 0) return null
    for (const l of stack.slice(at + 1)) {
      if (l === g) return null
      if (l.contains(e) || e.contains(l)) continue
      const cs = getComputedStyle(l)
      if (/url\(|gradient/.test(cs.backgroundImage)) return null
      const c = ch(cs.backgroundColor)
      if (c && c.a > 0.9) return c
    }
    return null
  }
`

/**
 * The well-known third-party widgets a page embeds, by their structure (probe 10, 18/10/2026). What a widget draws
 * is the provider's, not the template's and not the system's: a design system cannot and should not repaint it.
 * In the live frame the page's scripts run, so the widgets render, and the detectors read them as template
 * colour left behind: JA Resume's Google Charts series palette (yoga, frontend developer homes) as accent-leak
 * and shape-fill, JA Seven's Google Maps error box (the stand's map key is refused) as glare and as the
 * provider's Roboto left among the system's faces. A general rule, not a list of templates: a selector names
 * the root a provider renders (Google Maps `.gm-style` and its error box, the Google Charts box whose SVG
 * carries the renderer's own defs, Leaflet, Mapbox/MapLibre, OpenLayers, Highcharts, ApexCharts, reCAPTCHA,
 * the rendered X/Instagram/Facebook embeds), and a frame on another origin is one too.
 */
export const WIDGET_ROOTS = Object.freeze([
  '.gm-style',
  '.gm-err-container',
  '[class^="gm-style-"]',
  ':has(> svg > defs[id^="_ABSTRACT_RENDERER_ID_"])',
  '[class^="google-visualization-"]',
  '[id^="google-visualization-"]',
  '.leaflet-container',
  '.mapboxgl-map',
  '.maplibregl-map',
  '.ol-viewport',
  '.highcharts-container',
  '.apexcharts-canvas',
  '.grecaptcha-badge',
  'twitter-widget',
  '.twitter-tweet-rendered',
  '.instagram-media-rendered',
  '.fb_iframe_widget'
])

/**
 * In the page: `inWidget(e)`, whether e is part of a third-party widget (WIDGET_ROOTS): inside a widget's root,
 * or a wrapper the widget fills (no words of its own, every child that shows a box a widget or such a wrapper,
 * its box within the boxes of those children). Google Maps paints its own grey (#e5e3df) on an unnamed div it
 * puts in the template's map element, and the map element holds nothing else: both are the widget's box. A
 * section around it with a heading, a padding or anything else of the template's stays judged, so a real
 * defect next to a widget is still found. `on` false (before probe 10): never, so no v9 file reads differently.
 * @param {boolean} on
 */
export const widgetsInPage = (on) =>
  on
    ? `
  const __wSel = ${JSON.stringify(WIDGET_ROOTS.join(', '))}
  const __wSkip = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR)$/
  const __wHome = (() => { try { return new URL(document.baseURI).origin } catch { return location.origin } })()
  const __wArea = (x) => { const q = x.getBoundingClientRect(); return q.width * q.height }
  const __wRoot = (e) => {
    try { if (e.matches(__wSel)) return true } catch {}
    if (!/^(IFRAME|FRAME|OBJECT|EMBED)$/.test(e.tagName)) return false
    const a = e.getAttribute('src') || e.getAttribute('data')
    if (!a) return false
    try { const u = new URL(a, document.baseURI); return /^https?:$/.test(u.protocol) && u.origin !== __wHome } catch { return false }
  }
  const __wMemo = new WeakMap()
  const __wInRoot = (d, top) => { for (let x = d; x && x !== top; x = x.parentElement) if (__wRoot(x)) return true; return false }
  // a child that paints nothing of its own: no box, and nothing with a box inside it but a widget's
  const __wIdle = (k) => __wArea(k) === 0 && [...k.querySelectorAll('*')].slice(0, 200).every((d) => __wArea(d) === 0 || __wInRoot(d, k))
  const __wSelf = (e) => {
    if (__wMemo.has(e)) return __wMemo.get(e)
    __wMemo.set(e, false)
    let v = __wRoot(e)
    if (!v && e !== document.body && e !== document.documentElement && ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const kids = [...e.children].filter((k) => !__wSkip.test(k.tagName) && !__wIdle(k))
      if (kids.length && kids.every(__wSelf)) {
        const r = e.getBoundingClientRect()
        const qs = kids.map((k) => k.getBoundingClientRect())
        const L = Math.min(...qs.map((q) => q.left)), T = Math.min(...qs.map((q) => q.top))
        const R = Math.max(...qs.map((q) => q.right)), B = Math.max(...qs.map((q) => q.bottom))
        v = r.left >= L - 4 && r.top >= T - 4 && r.right <= R + 4 && r.bottom <= B + 4
      }
    }
    __wMemo.set(e, v)
    return v
  }
  const inWidget = (e) => { for (let x = e; x && x !== document.body && x !== document.documentElement; x = x.parentElement) if (__wSelf(x)) return true; return false }
`
    : `
  const inWidget = () => false
`

/**
 * In the page (needs `ch`): whether a block's own fill shows only as hairlines between its children —
 * a ruled grid drawn as a list painted with the border colour behind opaque cells and a 1–2px gap
 * (Tracy Business Joomla's service, team and figure grids, 15/10/2026). What the eye sees there is a
 * set of grid lines (harsh-border judges their colour), not a block of that colour: under Figma (black
 * borders) the 1176 × 839 px list read as a black block (off-ground), under Moxie's dark side (cream
 * borders) as a cream glare block, while the page showed only thin lines between dark cells. A block
 * counts as hairlines when it has two or more children, each with an opaque fill, and what they leave
 * uncovered is no more than one and a half px per px of their summed widths and heights: an average gap
 * of about 2px. A grid with real gutters (24px) shows its fill as bands and stays a block.
 */
export const HAIRLINES_IN_PAGE = `
  const hairlines = (e, r) => {
    const kids = e.children
    if (!r || kids.length < 2 || kids.length > 400) return false
    let covered = 0
    let sides = 0
    for (const k of kids) {
      const c = ch(getComputedStyle(k).backgroundColor)
      if (!c || c.a <= 0.9) return false
      const kr = k.getBoundingClientRect()
      const w = Math.max(0, Math.min(kr.right, r.right) - Math.max(kr.left, r.left))
      const h = Math.max(0, Math.min(kr.bottom, r.bottom) - Math.max(kr.top, r.top))
      covered += w * h
      sides += kr.width + kr.height
    }
    // inside the block's own border: a ruled grid draws its outer line as a border, not as a gap
    const cs = getComputedStyle(e)
    const bx = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0)
    const by = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    const open = Math.max(0, r.width - bx) * Math.max(0, r.height - by) - covered
    return open >= -1 && open <= sides * 1.5
  }
`

/**
 * In the page: blocks, texts, buttons and fonts, as data. `widgets` (from probe 10): a third-party widget's
 * blocks, texts and buttons are left out (`widgetsInPage`).
 * @param {{ widgets?: boolean }} [o]
 */
export const previewProbeOf = ({ widgets = false } = {}) => `(() => {
${COLOUR_IN_PAGE}
${HAIRLINES_IN_PAGE}
${widgetsInPage(widgets)}
  const pathOf = (e) => { const out = []; for (let x = e; x && x !== document.body && out.length < 14; x = x.parentElement) { let i = 1; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName) i++; out.unshift(x.tagName.toLowerCase() + ':' + i) } return out.join('/') }
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  const picture = (e) => /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|SVG)$/i.test(e.tagName) || /url\\(/.test(getComputedStyle(e).backgroundImage)
  // a block whose whole box a picture inside it covers shows that picture, never its own fill (JA Essence's
  // carousel cards: a cream card ground under a photo laid edge to edge, read as a glare block on a dark
  // page, 16/10/2026): a descendant picture's box holds the block's box, or at its four corners and centre
  // the topmost of the block and its pictures is a picture (points in the viewport only)
  const coveredByPicture = (e, r) => {
    const pics = [...e.querySelectorAll('img, video, canvas, picture, svg, iframe, [style*="url("]')].filter(picture)
    if (!pics.length) return false
    for (const q of pics) {
      const b = q.getBoundingClientRect()
      if (b.left <= r.left + 1 && b.top <= r.top + 1 && b.right >= r.right - 1 && b.bottom >= r.bottom - 1) return true
    }
    const pts = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]
    if (!pts.every(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)) return false
    return pts.every(([x, y]) => {
      for (const h of document.elementsFromPoint(x, y)) {
        if (h === e) return false
        if (e.contains(h) && picture(h)) return true
      }
      return false
    })
  }
  // the ground a box shows: its own opaque fill or the nearest ancestor's; null over a picture
  // (a layer painted under it by position that is not its ancestor wins: layerUnder)
  const ground = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return pictureUnder(e, x) ? null : x === e ? c : layerUnder(e, x) ?? c } return pictureUnder(e, document.documentElement) ? null : layerUnder(e, document.documentElement) ?? { r: 255, g: 255, b: 255, a: 1 } }
  const W = document.documentElement.clientWidth
  const H = Math.max(document.documentElement.scrollHeight, 1)
  const blocks = []
  const texts = []
  const buttons = []
  // a palette swatch: a box whose own style paints its ground with one colour variable and nothing else
  // (Tracy Base EmDash's /design-system/colour: style="background: var(--color-accent-on)")
  const SWATCH = /^\\s*background(-color)?\\s*:\\s*var\\(\\s*--[\\w-]+\\s*(,[^;()]*)?\\)\\s*;?\\s*$/i
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
    // what a third-party widget draws is the provider's (widgetsInPage; off before probe 10)
    if (inWidget(e)) continue
    // the body of a closed <details> keeps its box but is never seen (JA Kinetic's FAQ answers, 15/10/2026)
    const shut = e.closest('details:not([open])')
    if (shut && shut !== e && !e.closest('summary')) continue
    const r = e.getBoundingClientRect()
    // off the page sideways (a carousel's cloned slides): not seen
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.left >= W) continue
    const area = r.width * r.height
    const bg = ch(cs.backgroundColor)
    // a block that is a veil over a picture (a cover's dim layer: opacity under 1) is not a ground
    if (bg && bg.a > 0.9 && area >= 4000 && cs.backgroundImage === 'none' && +cs.opacity >= 0.95 && !/background-dim/.test(e.className))
      blocks.push({ path: pathOf(e), at: label(e), area: Math.round(area), share: Math.round((area / (W * H)) * 10000) / 10000, top: Math.round(r.top + scrollY), bg, ...(hairlines(e, r) && { lines: true }), ...(SWATCH.test(e.getAttribute('style') || '') && { swatch: true }), ...(coveredByPicture(e, r) && { covered: true }) })
    // a box the template draws as a button with a class of its own (a "__cta" or "-btn" span or link:
    // Tracy Business Joomla's drawn contact slide, whose orange "Request an estimate" turned a pale
    // blue box on the blue slide under Moxie's dark side and no check saw it, 15/10/2026): a button-sized
    // box (a flex item is blockified, so its display says nothing), a short label
    const drawnButton = typeof e.className === 'string' && r.width <= 480 && r.height <= 96 && e.className.split(/\\s+/).some((c) => /(__|-)(cta|btn|button)$/.test(c)) && (e.textContent || '').trim().length <= 40
    // a box that only wraps the real control and paints nothing of its own (a block button wrapper carrying
    // the theme's .btn classes around its link, JA Impact WordPress 19/10/2026: the system leaves it bare) is
    // no button: the link inside it is read. A wrapper that paints a fill or a line is still read
    const bare = !(bg && bg.a > 0.5) && !((parseFloat(cs.borderTopWidth) || 0) >= 1 && (ch(cs.borderTopColor)?.a ?? 0) > 0.5)
    const wrapper = bare && e.matches(':is(div, span, li, p):has(> :is(a, button):is([class*="btn"], [class*="button"]))')
    const isButton = !wrapper && (drawnButton || e.matches('a.btn, button, .btn, input[type=submit], input[type=button], [class*="button"]:is(a, button)'))
    if (isButton) {
      const g = ground(e.parentElement || e)
      const bw = parseFloat(cs.borderTopWidth) || 0
      buttons.push({ path: pathOf(e), at: label(e), text: (e.textContent || '').trim().slice(0, 30), fill: bg && bg.a > 0.5 ? bg : null, border: bw >= 1 ? ch(cs.borderTopColor) : null, ground: g })
    }
    // a text: an element with its own text node
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    // words drawn in a fully transparent colour or at size 0 are never seen (JA Social II's slide dots hide
    // their labels so under a system, 19/10/2026): no text to read
    const fgc = ch(cs.color)
    const unseen = (fgc && (fgc.a ?? 1) < 0.1) || (parseFloat(cs.fontSize) || 0) < 1
    if (own && !unseen && texts.length < 1500) {
      const g = ground(e)
      if (g) texts.push({ path: pathOf(e), at: label(e), text: (e.textContent || '').trim().slice(0, 40), fg: ch(cs.color), ground: g, size: parseFloat(cs.fontSize) })
    }
  }
  // main blocks that render empty: a section-like box taller than a phone line with no text, picture or control in it
  const empty = [...document.querySelectorAll('main section, body > section, .t4-section, section, [class*="section"]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 160 && r.width > W * 0.5 })
    .filter((e) => !(e.innerText || '').trim() && !e.querySelector('img, video, picture, svg, canvas, iframe, input, button') && !/url\\(/.test(getComputedStyle(e).backgroundImage))
    .slice(0, 10).map(label)
  const fonts = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), status: f.status }))
  const failedFonts = [...new Set(fonts.filter((f) => f.status === 'error').map((f) => f.family))]
  const opaque = (x) => { const c = ch(getComputedStyle(x).backgroundColor); return c && c.a > 0.9 ? c : null }
  const page = opaque(document.body) || opaque(document.documentElement) || { r: 255, g: 255, b: 255, a: 1 }
  const rs = getComputedStyle(document.documentElement)
  const said = Object.fromEntries(['--ds-c-bg', '--ds-c-fg', '--wp--preset--color--bg', 'color-scheme'].map((n) => [n, (n.startsWith('--') ? rs.getPropertyValue(n) : rs.colorScheme).trim()]))
  return { width: W, height: H, page, said, blocks, texts, buttons, empty, failedFonts, docs: document.querySelectorAll('html').length }
})()`

/** The probe as v9 reads it: no widget left out. */
export const PREVIEW_PROBE = previewProbeOf()

const lin = (/** @type {number} */ v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** @param {{ r: number, g: number, b: number }} c */
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
/** WCAG contrast of two colours. */
export const ratio = (/** @type {any} */ a, /** @type {any} */ b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Chroma of a colour on 0–255 (max − min channel). */
export const chroma = (/** @type {any} */ c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
const dist = (/** @type {any} */ a, /** @type {any} */ b) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
const hex = (/** @type {any} */ c) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const rgbOf = (/** @type {string} */ h) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h ?? ''))
  return m
    ? {
        r: Number.parseInt(m[1].slice(0, 2), 16),
        g: Number.parseInt(m[1].slice(2, 4), 16),
        b: Number.parseInt(m[1].slice(4, 6), 16)
      }
    : null
}

/** The limits the comparison judges with. One table, read by the rules too. */
export const PREVIEW_LIMITS = Object.freeze({
  /** a block counts from this share of the page's area */
  keptShare: 0.004,
  /** a colour counts as a brand colour from this chroma (0–255); a glare block is under it */
  keptChroma: 48,
  /** a dark system's page: luminance under this */
  darkPage: 0.2,
  /** a glare block: at least this contrast with a dark page */
  glareContrast: 4,
  /** a colour within this channel distance of a system colour is the system's */
  systemTolerance: 24,
  /** CON-2: no text under this ratio under a worn system */
  textFloor: 3,
  /** a button's fill or border shows its shape from this contrast against its ground */
  shapeContrast: 1.25
})

/**
 * The worn page against the template's own page: the findings the four preview rules read. PURE.
 * @param {any} worn      `PREVIEW_PROBE` on the page wearing the system
 * @param {any} plain     `PREVIEW_PROBE` on the same page without a system
 * @param {string[]} systemColours hex colours the worn system paints with
 * @param {typeof PREVIEW_LIMITS} [t]
 */
export function comparePreview(worn, plain, systemColours, t = PREVIEW_LIMITS) {
  const sys = systemColours.map(rgbOf).filter(Boolean)
  // a system colour: within a few channel steps, or (a neutral) all but the same lightness as a neutral
  // of the system (#121316 under a black page is the system's dark, not a block of the template's)
  const nearSystem = (/** @type {any} */ c) =>
    sys.some(
      (s) =>
        dist(c, s) <= t.systemTolerance ||
        (chroma(c) < t.keptChroma && chroma(s) < t.keptChroma && ratio(c, s) < 1.2)
    )
  const plainBlocks = new Map((plain?.blocks ?? []).map((b) => [b.path, b]))
  // the outermost block of a nest only: its children wear the same fill
  const outermost = (/** @type {any[]} */ list) =>
    list.filter((b) => !list.some((o) => o !== b && b.path.startsWith(`${o.path}/`) && dist(o.bg, b.bg) <= 6))
  const kept = outermost(
    (worn?.blocks ?? [])
      .filter((b) => b.share >= t.keptShare && !b.lines && !nearSystem(b.bg))
      .filter((b) => {
        const was = plainBlocks.get(b.path)
        return was && dist(was.bg, b.bg) <= 6
      })
  ).map((b) => ({ at: b.at, colour: hex(b.bg), share: b.share, top: b.top }))
  // the system's own page colour when the worn page states it: a WordPress page paints its ground
  // on a wrapper, so body and html read transparent and the page fell back to white, and a khaki band
  // on Tracy Base WordPress under Moxie (a text colour as a ground) was never judged as glare
  const page = rgbOf(worn?.said?.['--ds-c-bg']) ?? worn?.page
  const darkPage = !!page && lum(page) < t.darkPage
  // a light block the template's own dark page already shows (a palette swatch of its light text colour,
  // Tracy Base EmDash's /design-system/colour, 16/10/2026) is its design, not a light ground the wear put
  // on a dark system; a one-look template has no dark page of its own, so nothing is left out there
  const plainPage = plain?.page
  const plainGlare = (/** @type {any} */ b) => {
    const was = plainBlocks.get(b.path)
    return (
      !!was &&
      !!plainPage &&
      lum(plainPage) < t.darkPage &&
      chroma(was.bg) < t.keptChroma &&
      ratio(was.bg, plainPage) >= t.glareContrast
    )
  }
  const glare = darkPage
    ? outermost(
        (worn?.blocks ?? []).filter(
          (b) =>
            b.share >= t.keptShare &&
            !b.lines &&
            // a fill its own picture covers whole is never seen (coveredByPicture)
            !b.covered &&
            chroma(b.bg) < t.keptChroma &&
            ratio(b.bg, page) >= t.glareContrast &&
            !plainGlare(b) &&
            // a palette swatch showing a colour of the system is that colour's sample, not a light ground
            // the wear put on the page: Tracy Base EmDash's "On accent" swatch is Figma's white accent-on on
            // its dark side (black on the template's own dark page), 16/10/2026
            !(b.swatch && nearSystem(b.bg))
        )
      ).map((b) => ({ at: b.at, colour: hex(b.bg), share: b.share, top: b.top }))
    : []
  // a text the template colours with a brand colour of its own, still that colour under the system
  const plainTexts = new Map((plain?.texts ?? []).map((x) => [x.path, x]))
  const keptText = (worn?.texts ?? [])
    .filter((x) => x.fg && chroma(x.fg) >= t.keptChroma && !nearSystem(x.fg))
    .filter((x) => {
      const was = plainTexts.get(x.path)
      return was?.fg && dist(was.fg, x.fg) <= 6
    })
    .map((x) => ({ at: x.at, text: x.text, colour: hex(x.fg) }))
  // only a text the system made unreadable: one already under the floor on the template's own page
  // (words over a photograph the probe cannot see through) is the template's, not the wear's
  const lowText = (worn?.texts ?? [])
    .filter((x) => x.fg && x.ground && ratio(x.fg, x.ground) < t.textFloor)
    .filter((x) => {
      const was = plainTexts.get(x.path)
      return !was?.fg || !was.ground || ratio(was.fg, was.ground) >= t.textFloor
    })
    .map((x) => ({
      at: x.at,
      text: x.text,
      ratio: Math.round(ratio(x.fg, x.ground) * 100) / 100,
      colour: hex(x.fg),
      ground: hex(x.ground)
    }))
  // a transparent border draws no shape: the page reads it as black (alpha 0), so a ghost link with
  // `border: 1px solid transparent` on a bright band read as a black-rimmed button and was "lost" on a
  // dark band (Tracy Base EmDash's "Explore our services", 16/10/2026)
  const shaped = (/** @type {any} */ b) =>
    !!b.ground &&
    ((b.fill && ratio(b.fill, b.ground) >= t.shapeContrast) ||
      (b.border && (b.border.a ?? 1) > 0.5 && ratio(b.border, b.ground) >= t.shapeContrast))
  const plainButtons = new Map((plain?.buttons ?? []).map((b) => [b.path, b]))
  const lostButtons = (worn?.buttons ?? [])
    .filter((b) => {
      const was = plainButtons.get(b.path)
      return was && shaped(was) && !shaped(b)
    })
    .map((b) => ({
      at: b.at,
      text: b.text,
      fill: b.fill ? hex(b.fill) : null,
      border: b.border ? hex(b.border) : null,
      ground: b.ground ? hex(b.ground) : null
    }))
  return {
    kept,
    keptShare: Math.round(kept.reduce((a, b) => a + b.share, 0) * 1000) / 1000,
    glare,
    keptText,
    lowText,
    lostButtons,
    conformance: {
      docs: worn?.docs ?? null,
      failedFonts: worn?.failedFonts ?? [],
      // a block the template's own page renders empty too is the template's (JA Impact WordPress's menu
      // parent pages, an empty padded body under their title band, 19/10/2026), not a preview that lost
      // its content: only the blocks the worn page alone shows empty count
      empty: (worn?.empty ?? []).filter((/** @type {string} */ at) => !(plain?.empty ?? []).includes(at))
    }
  }
}
