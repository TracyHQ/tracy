/**
 * The template's own brand or accent hue still on screen while a design system is worn (ACCENT-LEAK, probe
 * 10; Akemi, 17/10/2026). She found by eye what every other rule passed: JA Phio's stats ellipses and
 * feature icons stayed the template's red under every system (red pictures), JA Tour's blue bands and
 * accent pictures stayed blue under Mailchimp, JA Impact's green, orange and navy stayed on hovers, borders
 * and badges, and JA Vega's "Get started now" band and hero glow stayed blue under a pink system. The finder
 * that caught them (packages/design/tracy-ds-slot/scripts/accent-leak.mjs, its LEAK and PIC rules) is this
 * detector's model.
 *
 * In the page (plain and worn alike):
 * - every painted colour of every shown element and its ::before / ::after: words (where words or an icon
 *   glyph are drawn), fill, borders, outline, underline, box and text shadows, SVG fill and stroke, gradient
 *   stops; and, through the hover twins hover-unreadable lays (a `:hover` rule copied onto a class), what a
 *   button or link paints under the pointer;
 * - every decorative picture: a CSS background picture (a band's, a card's, a pseudo-element's), a small
 *   <img> (an icon, at most 160 px drawn) and an SVG file, read as pixels (through the measuring server's
 *   picture door when the picture lives on the demo's address): the share of its opaque pixels in one hue,
 *   that hue, and how smooth it is (a photograph has edges everywhere; a gradient, a glow or a flat
 *   drawing does not).
 * Logos, social network marks and listening/streaming platform marks (their colours are the networks' and
 * the platforms', kept on purpose: JA Podcast's Apple Podcasts / SoundCloud / Google Podcasts / Spotify
 * "listen on" logos, named by their class, link address, title or label) and status colours (danger, success,
 * warning, info: the slot tunes those itself) are marked and never judged; a near-neutral colour (under the
 * brand chroma, or a picture pixel under 35 % saturation) is never a brand hue.
 *
 * The template's brand colours are the chromatic colours its own page paints at rest (plain page). A finding,
 * on the worn page only (at rest or on hover):
 * - paint: a colour within the systems' tolerance of a brand colour that is near no colour of the system
 *   (its resolved roles, its library palette, the status colours the slot writes) while the system has no
 *   colour near that brand colour either (a system whose accent is the template's blue cannot be told
 *   apart from a leak, so it is not judged);
 * - picture: a drawn picture (with transparency: an icon, a shape) or a smooth one (a gradient, a glow), never a
 *   photograph (opaque edge to edge and busy), whose chromatic pixels
 *   are mostly one hue within 15 degrees of a brand colour's hue, covering at least 5 % of it (never an opaque
 *   <img> where that hue is under a third of it: content, a photograph or illustration with a detail in it), where no
 *   accent colour of the system lies within 30 degrees of that hue, and no tint or overlay the worn page
 *   adds (a blend mode, a filter, an overlay pseudo-element the template's page does not have) recolours it.
 * With no system worn (DEF-1) there is no worn page and nothing is judged.
 */
import { BUTTON_SELECTOR } from './lib/buttons.mjs'
import { chroma, DETECTOR_LIMITS, dist, hex, PAGE_HELPERS, ROLES_IN_PAGE, systemOf } from './lib/colour.mjs'

export const kind = 'accent-leak'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

/** The hover class hover-unreadable's twins answer to (one set of twins per page, whoever lays it). */
const ON = '__tdsr-on'
/** The picture door of preview-check.mjs: a picture of the demo's address, served from the page's origin. */
export const PICTURE_DOOR = '/__tdsr-picture'

/** The limits of this detector. One table. */
export const LEAK_LIMITS = Object.freeze({
  /** a paint is seen from this alpha */
  alpha: 0.3,
  /** an <img> drawn larger than this (px, either side) is content, not an icon */
  iconMax: 160,
  /** a picture is smooth (a gradient, a glow, a flat drawing) under this mean neighbour difference */
  smooth: 12,
  /** a picture's brand hue band covers at least this share of its opaque pixels */
  picShare: 0.05,
  /** and at least this share of its chromatic pixels */
  picPurity: 0.6,
  /** a picture drawn smaller than this (px²) is an icon: one in a colour darker than `iconLight` reads as ink */
  iconArea: 40000,
  /** the least area of brand hue (px²) a picture must show to count */
  minMass: 200,
  /** an icon's colour is the brand's when it has this share of the brand colour's chroma … */
  iconStrength: 0.45,
  /** … and its lightness within this much of it */
  iconLightGap: 0.3,
  /** an opaque <img> (a photograph, an illustration, a portrait) whose brand hue covers under this share of it is
   *  content with a detail in that colour, not a picture drawn in the brand colour */
  contentShare: 0.35,
  /** a picture's hue matches a brand colour's within this many degrees */
  hueNear: 15,
  /** a system colour within this many degrees of the picture's hue makes it the system's */
  hueSystem: 30
})

export const probe = `(async () => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const still = document.createElement('style')
  still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important }'
  document.head.appendChild(still)
  if (!window.__tdsrTwins) {
    window.__tdsrTwins = 1
    const twin = (sel) => sel.replace(/:(hover|focus-visible|focus)(?![\\w-])/g, '.${ON}')
    const walk = (list, owner) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i]
        if (r.cssRules && r.cssRules.length) { try { walk(r.cssRules, r) } catch {} }
        if (r.cssRules && !r.selectorText) continue
        if (!r.selectorText || !/:(hover|focus)(?![\\w-])|:focus-visible/.test(r.selectorText)) continue
        try { owner.insertRule(twin(r.selectorText) + '{' + r.style.cssText + '}', i + 1) } catch {}
      }
    }
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, sh) } catch {} }
  }
  const SOCIAL = /facebook|twitter|x-twitter|instagram|youtube|linkedin|pinterest|whatsapp|tiktok|telegram|behance|dribbble|vimeo|flickr|skype|reddit|tumblr|social|fa-brands|\\bfab\\b|share/i
  // a status class as Bootstrap and Joomla spell it (text-danger, alert-info, invalid-feedback, is-invalid,
  // a bare "error"), one class at a time: "info-top" is no status
  const STATUS = /^((text|bg|btn|btn-outline|alert|badge|border|link|table|list-group-item|toast|callout)-(danger|success|warning|info|error)|(in)?valid-(feedback|tooltip)|is-(in)?valid|alert|error|danger|warning|success|invalid)$/i
  // a third-party platform's mark (a podcast, music or app store service): its colours are the platform's, like a
  // social network's; named by a class, an address, a title or a label ("pod-spotify", open.spotify.com, "Listen
  // on iTunes"). Words that are also plain English (anchor, medium, stripe, overcast, audible)
  // are left out of the class test on purpose
  const PLATFORM = /spotify|soundcloud|itunes|apple[-_ ]?(podcasts?|music)|google[-_ ]?(podcasts?|play)|pocket[-_ ]?casts|stitcher|deezer|castbox|podbean|tunein|iheart|amazon[-_ ]?music|app[-_ ]?store|play[-_ ]?store/i
  const PLATFORM_HOST = /(spotify|soundcloud|deezer|stitcher|podbean|castbox|pocketcasts|overcast|tunein|iheart|audible)\\.(com|fm|co)|(podcasts|music|itunes)\\.apple\\.com|podcasts\\.google\\.com|music\\.amazon\\./i
  const LOGO = /logo|brand/i
  const classOf = (x) => (typeof x.className === 'string' ? x.className : x.getAttribute('class') || '') + ' ' + (x.id || '')
  // what an element must not be judged for: inside a logo, a social mark, a platform mark, a status message
  const flagsOf = (e) => {
    let f = ''
    for (let x = e, n = 0; x && x !== document.body && n < 8; x = x.parentElement, n++) {
      const c = classOf(x)
      const href = x.tagName === 'A' ? x.getAttribute('href') || '' : ''
      if (!f.includes('l') && (LOGO.test(c) || (x.tagName === 'IMG' && LOGO.test((x.getAttribute('src') || '') + ' ' + (x.getAttribute('alt') || ''))))) f += 'l'
      if (!f.includes('s') && n < 4 && (SOCIAL.test(c) || /(facebook|twitter|x|instagram|youtube|linkedin|pinterest|tiktok)\\.com/i.test(href))) f += 's'
      if (!f.includes('p') && n < 4 && (PLATFORM.test(c) || PLATFORM_HOST.test(href) || (x.tagName === 'A' && PLATFORM.test((x.getAttribute('title') || '') + ' ' + (x.getAttribute('aria-label') || ''))))) f += 'p'
      if (!f.includes('t') && n < 4 && c.split(/\\s+/).some((k) => STATUS.test(k))) f += 't'
    }
    return f
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const glyph = (ps) => ps.content && !/^(none|normal|""|'')$/.test(ps.content)
  const stops = (img) => [...String(img).matchAll(/rgba?\\([^)]*\\)/g)].map((m) => ch(m[0])).filter(Boolean)
  // the colours one box (or pseudo-element) paints, as [what, colour]
  const paintsOf = (el, cs, pseudo) => {
    const out = []
    const svg = el instanceof SVGElement
    const add = (what, c) => { if (c && c.a >= ${LEAK_LIMITS.alpha}) out.push([what, c]) }
    if (pseudo ? glyph(cs) : ownText(el) || /^(I|svg)$/i.test(el.tagName)) add('words', ch(cs.color))
    if (!svg) add('fill', ch(cs.backgroundColor))
    for (const s of ['Top', 'Right', 'Bottom', 'Left'])
      if (parseFloat(cs['border' + s + 'Width']) >= 1 && cs['border' + s + 'Style'] !== 'none') add('border', ch(cs['border' + s + 'Color']))
    // an outline on a hover twin is a focus ring (the twins copy :focus rules too), often the browser's own
    // (-webkit-focus-ring-color, JA Morgan's links): only the outline a box wears at rest is judged
    if (!hovering && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) add('outline', ch(cs.outlineColor))
    if (cs.textDecorationLine && cs.textDecorationLine !== 'none' && (pseudo ? glyph(cs) : ownText(el))) add('underline', ch(cs.textDecorationColor))
    if (cs.boxShadow !== 'none') for (const c of stops(cs.boxShadow)) add('shadow', c)
    if (cs.textShadow !== 'none' && ownText(el)) for (const c of stops(cs.textShadow)) add('shadow', c)
    if (svg) { add('fill', ch(cs.fill)); add('stroke', ch(cs.stroke)) }
    if (/gradient/.test(cs.backgroundImage)) for (const c of stops(cs.backgroundImage)) add('gradient', c)
    return out
  }
  let hovering = false
  const paints = []
  const pics = []
  const seenPaint = new Set()
  // a label /ops can find: a bare tag says the nearest ancestor with a class or an id first
  const atOf = (e) => {
    const own = label(e).replace('.${ON}', '')
    if (own.includes('.')) return own
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement)
      if ((typeof x.className === 'string' && x.className.trim()) || x.id) return (x.id ? x.tagName.toLowerCase() + '#' + x.id : label(x)) + ' ' + own
    return own
  }
  const keep = (path, at, state, f, list) => {
    for (const [what, c] of list) {
      const k = path + '|' + state + '|' + what + '|' + [c.r, c.g, c.b].join(',')
      if (seenPaint.has(k) || paints.length >= 6000) continue
      seenPaint.add(k)
      paints.push({ path, at: at.replaceAll('.${ON}', ''), state, what, c: [c.r, c.g, c.b], a: c.a, f })
    }
  }
  // url("…") as the computed style writes it (quoted, a quote inside escaped), or a bare url(…)
  const urls = (v) => [...String(v || '').matchAll(/url\\(\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|([^)\\s]*))\\s*\\)/g)].map((m) => (m[1] ?? m[2]).replace(/\\\\(.)/g, '$1'))
  // pictures of one box: CSS background pictures (its own and its pseudo-elements'), a small <img>
  const picsOf = (el, cs, pseudo, r, f, state) => {
    if (pics.length >= 200) return
    const mask = cs.webkitMaskImage && cs.webkitMaskImage !== 'none'
    // an SVG filter of the page that floods the picture (JA Tour's and Phio's accent tint, transparent without a
    // system): the visitor sees the flood colour, judged as a paint; a transparent flood leaves the picture as is
    const fm = /url\\(\\s*"?[^")]*#([^")]+)"?\\s*\\)/.exec(cs.filter || '')
    const fl = fm && document.getElementById(fm[1])?.querySelector('feFlood')
    let flood = null
    if (fl) { const fs = getComputedStyle(fl); const c = ch(fs.floodColor); const a = c ? c.a * (parseFloat(fs.floodOpacity) || 0) : 0; flood = a >= 0.05 ? [c.r, c.g, c.b] : 'none' }
    const tinted = (cs.filter && cs.filter !== 'none' && !fl) || (cs.backgroundBlendMode && cs.backgroundBlendMode !== 'normal') || (cs.mixBlendMode && cs.mixBlendMode !== 'normal')
    // a pseudo-element's own box where its size is known, else its element's
    const pw = pseudo ? parseFloat(cs.width) : NaN, ph = pseudo ? parseFloat(cs.height) : NaN
    const area = pw > 0 && ph > 0 ? Math.round(pw * ph) : Math.round(r.width * r.height)
    for (const u of urls(cs.backgroundImage)) pics.push({ path: pathOf(el) + (pseudo ? '::' + pseudo : ''), at: atOf(el) + (pseudo ? '::' + pseudo : ''), state, kind: 'background', url: u, area, y: Math.round(r.top + scrollY), mask, tinted, flood, f })
    if (!pseudo && el.tagName === 'IMG' && el.currentSrc && (/\\.svg(\\?|#|$)/i.test(el.currentSrc) || (r.width <= ${LEAK_LIMITS.iconMax} && r.height <= ${LEAK_LIMITS.iconMax})))
      pics.push({ path: pathOf(el), at: atOf(el), state, kind: 'img', url: el.currentSrc, area: Math.round(r.width * r.height), y: Math.round(r.top + scrollY), mask: false, tinted, flood, f })
  }
  const overlayOf = (el) => {
    for (const p of ['::before', '::after']) {
      const s = getComputedStyle(el, p)
      if (s.content === 'none' || s.content === 'normal' || s.position !== 'absolute') continue
      const c = ch(s.backgroundColor)
      if ((c && c.a >= 0.6) || /gradient/.test(s.backgroundImage)) return true
    }
    return false
  }
  const visit = (el, state) => {
    const cs = getComputedStyle(el)
    const r = seen(el, cs)
    if (!r) return
    const path = pathOf(el)
    const f = flagsOf(el)
    keep(path, atOf(el), state, f, paintsOf(el, cs, null))
    // pictures at rest only: a hover that swaps a picture is rare, and the rest pass reads every one
    const first = pics.length
    if (state === 'rest') picsOf(el, cs, null, r, f, state)
    if (pics.length > first && overlayOf(el)) pics[first].covered = true
    for (const p of ['before', 'after']) {
      const ps = getComputedStyle(el, '::' + p)
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.visibility === 'hidden' || +ps.opacity === 0) continue
      keep(path + '::' + p, atOf(el) + '::' + p, state, f, paintsOf(el, ps, p))
      if (state === 'rest') picsOf(el, ps, p, r, f, state)
    }
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('script,style,noscript,template')) continue
    visit(el, 'rest')
  }
  // hover: each button and link with its ancestors on the twin class, what changes on it and inside it
  const restOf = new Map()
  for (const p of paints) restOf.set(p.path + '|' + p.what + '|' + p.c.join(','), 1)
  let hovered = 0
  for (const e of document.querySelectorAll('${BUTTON_SELECTOR}, a[href]')) {
    if (hovered >= 300) break
    const r = seen(e, getComputedStyle(e))
    if (!r || r.width < 8 || r.height < 8) continue
    hovered++
    const chain = []
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) chain.push(x)
    for (const x of chain) x.classList.add('${ON}')
    hovering = true
    const before = paints.length
    for (const x of [e, ...[...e.querySelectorAll('*')].slice(0, 20)]) visit(x, 'hover')
    // keep only what the hover changed
    const added = paints.splice(before).filter((p) => !restOf.has(p.path + '|' + p.what + '|' + p.c.join(',')))
    paints.push(...added)
    for (const x of chain) x.classList.remove('${ON}')
    hovering = false
  }
  // the pixels of every picture, once per address
  const door = (u) => {
    if (/^data:/i.test(u)) return u
    const abs = new URL(u, document.baseURI)
    abs.hash = ''
    // the page's <base> names the demo: the door is on the measuring server's own origin
    return abs.origin === location.origin ? abs.href : location.origin + '${PICTURE_DOOR}?u=' + encodeURIComponent(abs.href)
  }
  const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l] }
  const read = async (u) => {
    const res = await fetch(door(u))
    if (!res.ok) return { error: 'http ' + res.status }
    const blob = await res.blob()
    let src = blob
    if (/svg/.test(blob.type) || /\\.svg(\\?|#|$)/i.test(u)) {
      const img = new Image()
      img.src = URL.createObjectURL(blob)
      await img.decode()
      src = img
    }
    const bmp = src instanceof Blob ? await createImageBitmap(src) : src
    const W0 = bmp.width || bmp.naturalWidth || 96, H0 = bmp.height || bmp.naturalHeight || 96
    const k = Math.min(1, 96 / Math.max(W0, H0))
    const w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k))
    const c = new OffscreenCanvas(w, h)
    const x = c.getContext('2d')
    x.drawImage(bmp, 0, 0, w, h)
    const d = x.getImageData(0, 0, w, h).data
    const hues = new Array(36).fill(0)
    const rgb = Array.from({ length: 36 }, () => [0, 0, 0])
    // every pixel weighs its alpha: a soft glow drawn in a translucent PNG is seen as much as it shows
    let opaque = 0, chromatic = 0, tex = 0, pairs = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue
      const wt = d[i + 3] / 255
      opaque += wt
      if ((i / 4) % w && d[i - 1] >= 40) { tex += Math.abs(d[i] - d[i - 4]) + Math.abs(d[i + 1] - d[i - 3]) + Math.abs(d[i + 2] - d[i - 2]); pairs++ }
      const [hh, s, l] = hsl(d[i], d[i + 1], d[i + 2])
      if (s < 0.35 || l <= 0.08 || l >= 0.9) continue
      chromatic += wt
      const b = Math.floor(hh / 10) % 36
      hues[b] += wt
      rgb[b][0] += d[i] * wt; rgb[b][1] += d[i + 1] * wt; rgb[b][2] += d[i + 2] * wt
    }
    let best = 0, at = 0
    for (let i = 0; i < 36; i++) { const v = hues[i] + hues[(i + 1) % 36] + hues[(i + 35) % 36]; if (v > best) { best = v; at = i } }
    // the band's mean colour: the three bins of the window, weighed as counted
    const band = [at, (at + 1) % 36, (at + 35) % 36]
    const sum = [0, 1, 2].map((k) => band.reduce((a, b) => a + rgb[b][k], 0))
    return {
      opaque: +(opaque / (w * h)).toFixed(3),
      share: +(best / Math.max(1, opaque)).toFixed(3),
      purity: +(best / Math.max(1, chromatic)).toFixed(3),
      tex: +(tex / Math.max(1, pairs)).toFixed(1),
      hue: at * 10 + 5,
      c: sum.map((v) => Math.round(v / Math.max(best, 1e-9)))
    }
  }
  const cache = new Map()
  for (const p of pics) {
    if (p.mask || p.area < 64) continue
    if (!cache.has(p.url)) cache.set(p.url, await Promise.race([read(p.url).catch((e) => ({ error: String(e).slice(0, 60) })), new Promise((ok) => setTimeout(() => ok({ error: 'timeout' }), 8000))]))
    Object.assign(p, { px: cache.get(p.url) })
    if (p.url.length > 160) p.url = p.url.slice(0, 120) + '…' + p.url.slice(-30)
  }
  return { paints, pics, roles: rolesOf() }
})()`

/** Hue of a colour in degrees, and whether it has one (saturation and lightness of a colour, not a grey). */
const hueOf = (/** @type {any} */ c) => {
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255]
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx === mn) return null
  const d = mx - mn
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}
/** HSL lightness of `[r, g, b]`, 0–1. */
const lightOf = (/** @type {number[]} */ c) => (Math.max(...c) + Math.min(...c)) / 510
const hueGap = (/** @type {number} */ a, /** @type {number} */ b) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
const rgbOfList = (/** @type {number[]} */ c) => ({ r: c[0], g: c[1], b: c[2], a: 1 })

/**
 * @param {{ worn: any, plain: any, systemColours: string[], systemPalette?: string[], statusColours?: string[] }} input
 */
export function detect(
  { worn, plain, systemColours, systemPalette = [], statusColours = [] },
  t = DETECTOR_LIMITS,
  l = LEAK_LIMITS
) {
  const roles = (worn?.data?.roles ?? []).map((/** @type {any} */ r) => (r?.c ? r : { name: '', c: r }))
  const sys = [
    ...systemOf(systemColours),
    ...systemOf(systemPalette),
    ...systemOf(statusColours),
    ...roles.map((/** @type {any} */ r) => r.c)
  ]
  // no system read (or no worn page: the template's own look, DEF-1): nothing to judge against
  if (!sys.length || !worn?.data || !plain?.data) return { count: 0, findings: [] }
  const ofSystem = (/** @type {any} */ c) => sys.some((s) => dist(c, s) <= t.systemTolerance)
  // the hues the system's accent paints with (accent, link, primary roles of the worn page): a picture in one
  // of them follows the system by chance, whatever else the system's palette holds
  const sysHues = roles
    .filter(
      (/** @type {any} */ r) => /accent|link|primary|brand/.test(r.name) && chroma(r.c) >= t.brandChroma
    )
    .map((/** @type {any} */ r) => hueOf(r.c))
  // the template's brand colours: what its own page paints in colour, logos, social marks and status aside
  /** @type {Map<string, any>} */
  const brand = new Map()
  // at rest only: a colour the template shows only under the pointer (Bootstrap's darker link hover #0a58ca on a
  // red template) is a state tint of the framework, not a colour of the brand; a hover in a brand colour is still
  // found below, as it lies near the brand colour shown at rest
  for (const p of plain.data.paints ?? []) {
    if (p.f || p.state !== 'rest') continue
    const c = rgbOfList(p.c)
    if (chroma(c) < t.brandChroma) continue
    brand.set(hex(c), c)
  }
  const brandOf = (/** @type {any} */ c) => {
    let best = null
    for (const b of brand.values())
      if (dist(c, b) <= t.systemTolerance && (!best || dist(c, b) < dist(c, best))) best = b
    return best
  }
  /** @type {Map<string, any>} */
  const found = new Map()
  for (const p of worn.data.paints ?? []) {
    if (p.f) continue
    const c = rgbOfList(p.c)
    if (chroma(c) < t.brandChroma || ofSystem(c)) continue
    const b = brandOf(c)
    // a system with a colour of its own near that brand colour: the system asked for it
    if (!b || ofSystem(b)) continue
    const at = `${p.at}${p.state === 'hover' ? ':hover' : ''} ${p.what} ${hex(c)}`
    if (!found.has(at)) found.set(at, { at, what: p.what, state: p.state, colour: hex(c), template: hex(b) })
  }
  const brandList = [...brand.values()].map((c) => ({ c, hue: hueOf(c), light: lightOf([c.r, c.g, c.b]) }))
  // a picture the worn page tints or covers (a blend mode, a filter, an overlay) where the template's page did
  // not: the system recolours it, the pixels are not what the visitor sees
  const plainPic = new Map((plain.data.pics ?? []).map((/** @type {any} */ p) => [`${p.at}|${p.url}`, p]))
  for (const p of worn.data.pics ?? []) {
    const px = p.px
    if (p.f || p.mask) continue
    // a picture flooded by an SVG filter shows the flood: a paint like any other
    if (Array.isArray(p.flood)) {
      const c = rgbOfList(p.flood)
      const b = chroma(c) >= t.brandChroma && !ofSystem(c) ? brandOf(c) : null
      if (b && !ofSystem(b)) {
        const at = `${p.at} picture tint ${hex(c)}`
        if (!found.has(at))
          found.set(at, { at, what: 'picture tint', state: p.state, colour: hex(c), template: hex(b) })
      }
      continue
    }
    if (!px || px.error) continue
    const was = plainPic.get(`${p.at}|${p.url}`)
    if ((p.tinted && !was?.tinted) || (p.covered && !was?.covered)) continue
    // a photograph: opaque edge to edge and busy; a picture with transparency is drawn (an icon, a shape)
    if ((px.opaque >= 0.95 && px.tex > l.smooth) || px.share < l.picShare || px.purity < l.picPurity) continue
    // content an editor places (an <img> opaque edge to edge: a photograph, a flat illustration, a portrait) in
    // which the brand hue is a detail, not the picture: Tracy Business Joomla's styleguide portrait gd-3.png, a
    // figure in an orange hard hat on grey (7.9 % orange, smooth), dot-1 at probe 10, 18/10/2026. A tile mostly
    // in the brand colour, an icon with transparency and a CSS band or glow (JA Vega's hero) are still judged
    if (p.kind === 'img' && px.opaque >= 0.95 && px.share < l.contentShare) continue
    const icon = p.area < l.iconArea
    // how much of the hue the visitor sees (px²): a thin 16 px chevron (Bootstrap's accordion arrow) is a few
    // dozen pixels of colour, not a coloured place
    if (p.area * px.opaque * px.share < l.minMass) continue
    const band = rgbOfList(px.c)
    // the brand colour the picture is drawn in: its hue, and for an icon its strength too (a pale skin tone in
    // JA Impact's helping-hands drawing shares the orange's hue, not its colour); a large band picture (a
    // gradient, a glow) is judged by its hue alone
    const near = brandList.some(
      (b) =>
        b.hue !== null &&
        hueGap(b.hue, px.hue) <= l.hueNear &&
        (!icon ||
          (chroma(band) >= l.iconStrength * chroma(b.c) &&
            Math.abs(lightOf(px.c) - b.light) <= l.iconLightGap))
    )
    if (!near) continue
    if (sysHues.some((h) => h !== null && hueGap(h, px.hue) <= l.hueSystem)) continue
    const colour = hex(rgbOfList(px.c))
    const name = String(p.url).startsWith('data:')
      ? 'inline picture'
      : String(p.url).split(/[?#]/)[0].split('/').pop()
    const at = `${p.at}${p.state === 'hover' ? ':hover' : ''} picture ${colour} (${name})`
    if (!found.has(at))
      found.set(at, { at, what: 'picture', state: p.state, colour, share: px.share, url: p.url })
  }
  const findings = [...found.values()]
  return { count: findings.length, findings }
}
