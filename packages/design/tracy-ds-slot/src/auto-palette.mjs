/**
 * The template's whole palette, read off its own page and mapped to the worn system by role
 * (Akemi, 14/10/2026). Contracts that NAME the blocks to recolour (bands, followRules, inlineColours)
 * always missed some of a JA template's hard-coded colours, and keeping blocks (keepScopes) to pass a
 * rule made the page half the system's, half the template's. Tracy Business wears every system well
 * only because every colour of it goes through a token; this gives every other template the same: each
 * colour its stylesheets paint with takes the system colour of its role.
 *
 * Three parts:
 * - `PALETTE_PROBE` (in the template's own page, no system): every colour declaration of every
 *   stylesheet it can read (selector, property, colour, !important), every colour custom property of
 *   `:root`, the colours its content writes inline, and how the page USES each colour (area as a
 *   ground, how often as text and on which ground, as a border);
 * - `classifyPalette` (pure): each colour a role — page ground, surface, band (a ground on the other
 *   side of the page), accent fill, text, muted text, text on a band, text on an accent, accent text,
 *   border;
 * - `autoPaletteCss` (pure): the rules that give each declaration the system colour of its role, a band
 *   or accent ground with the text colour that reads on it, on the side (light or dark) of the worn page.
 *
 * The result travels in the contract (`autoPalette`), generated from the demo by
 * `apps/tracy-web/scripts/preview-check.mjs --palette`; a contract only states exceptions
 * (`paletteKeep`: pictures and brand art, with a reason) and role hints (`paletteRoles`).
 */

/** The roles a template colour can take, each a system colour (or a pair) at emit time. */
export const PALETTE_ROLES = Object.freeze([
  'bg',
  'surface',
  'band',
  'accent',
  'fg',
  'muted',
  'on-band',
  'on-accent',
  'accent-text',
  'border',
  'heading'
])

const COLOUR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color'
]

/**
 * In the template's own page: its colour declarations, colour variables, inline colours and usage.
 * Only stylesheets the page can read (same origin: the preview loads the demo's through Tracy's own
 * origin, `design-system-preview-assets.js`).
 */
export const PALETTE_PROBE = `(() => {
  const PROPS = ${JSON.stringify(COLOUR_PROPS)}
  const cv = document.createElement('canvas').getContext('2d')
  const hexOf = (v) => { if (!v || /var\\(|currentcolor|transparent|inherit|initial|unset|revert|gradient|url\\(/i.test(v)) return null; cv.fillStyle = '#010203'; cv.fillStyle = v; const f = cv.fillStyle; if (f === '#010203' && !/^#010203$/i.test(v.trim())) return null; if (!/^#[0-9a-f]{6}$/i.test(f)) { const m = f.match(/[\\d.]+/g); if (!m || m.length < 4 || +m[3] < 0.9) return null; return '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('') } return f.toLowerCase() }
  // a rule counts only when it paints something on this page (its selector, pseudo-classes and
  // pseudo-elements left out, matches an element): a stylesheet names far more than a page shows
  const strip = (x) => x.replace(/::?[a-z-]+(\\([^)]*\\))?/gi, '').trim() || '*'
  const splitTop = (sel) => { const out = []; let depth = 0; let cur = ''; for (const c of sel) { if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--; if (c === ',' && depth === 0) { out.push(cur); cur = '' } else cur += c } out.push(cur); return out }
  const hit = (sel) => splitTop(sel).some((x) => { try { return !!document.querySelector(strip(x)) } catch { return false } })
  const TOKEN = /^\\s*var\\(\\s*--ds-c-([a-z0-9-]+)\\s*,\\s*([^)]+\\)?)\\s*\\)\\s*$/i
  const TEXT_TOKENS = ['fg', 'fg-2', 'muted', 'meta', 'accent-text']
  const GROUND_TOKENS = ['bg', 'surface', 'surface-warm']
  // the ground a text rule's own elements sit on (the first one seen, off-screen clones left out):
  // a text colour is classified by where THIS rule writes it, not by where its hex is used most (JA
  // Nova's marquee titles share their dark with the dark bands' words: classified by the hex, they
  // turned the band's light text on the marquee's light pills, 14/10/2026)
  const groundOfSel = (sel) => { const seen = {}; for (const x of splitTop(sel)) { let els = []; try { els = [...document.querySelectorAll(strip(x))].slice(0, 24) } catch {} for (const el of els) { const r = el.getBoundingClientRect(); if (!r.width || r.right <= 0 || r.left >= innerWidth) continue; let g = null; for (let y = el; y; y = y.parentElement) { const cs = getComputedStyle(y); if (/url\\(|gradient/.test(cs.backgroundImage)) { g = 'picture'; break } const m = (cs.backgroundColor.match(/[\\d.]+/g) || []).map(Number); if (m.length >= 3 && (m.length < 4 || m[3] > 0.9)) { g = '#' + m.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); break } } if (g) seen[g] = (seen[g] || 0) + 1 } } const best = Object.entries(seen).sort((a, b) => b[1] - a[1])[0]; return best ? best[0] : null }
  const rootStyle = getComputedStyle(document.documentElement)
  let via = null
  const viaVar = (v) => { const m = /^\\s*var\\(\\s*(--[\\w-]+)\\s*(?:,[^)]*)?\\)\\s*$/.exec(v || ''); if (!m || m[1].startsWith('--ds-c-')) return null; via = m[1]; return hexOf(rootStyle.getPropertyValue(m[1]).trim()) }
  // a light-dark() pair, resolved to the side this page shows (the browser picks it by the page's own
  // color-scheme): read as its first hex, JA Kinetic WordPress's header (light-dark(var(--ds-c-bg,
  // #fbfcfa), #0a0d0c), the page ground on both sides) was its light side on the dark page it was read
  // from, a band, and turned the system's text colour under its own dark words (14/10/2026)
  const lightDarkOf = (v) => { const i = String(v || '').search(/light-dark\\(/i); if (i < 0) return null; let depth = 0; let end = -1; for (let j = i + 10; j < v.length; j++) { if (v[j] === '(') depth++; else if (v[j] === ')') { depth--; if (depth === 0) { end = j; break } } } if (end < 0) return null; const d = document.createElement('i'); d.style.display = 'none'; d.style.color = v.slice(i, end + 1); if (!d.style.color) return null; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return hexOf(c) }
  const rules = []
  const vars = {}
  // a rule inside a @media block keeps its condition (index 6 of its row): read flat, T4's phone menu
  // panel (@media (max-width: 991.98px) .nav-breakpoint-lg .t4-megamenu, white) was written for every
  // width and drew a box over JA Kinetic Joomla's desktop menu, black on the light side (14/10/2026)
  let mediaNow = null
  const add = (t) => rules.push(mediaNow ? [...t, ...Array(Math.max(0, 6 - t.length)).fill(null), mediaNow] : t)
  const walk = (list) => { for (const r of list) {
    // the template's other side of light (a dark-mode media block, a dark theme class) is not this
    // page's palette: a one-look system replaces the template's switch, and classified by the light
    // page's use its navy cards turned the accent under a visitor's dark scheme (JA Impact WordPress)
    if (r.media && /prefers-color-scheme:\\s*dark/i.test(r.media.mediaText)) continue
    if (r.cssRules && !r.selectorText) { const was = mediaNow; if (r.media && r.media.mediaText) mediaNow = was ? was + ' and ' + r.media.mediaText : r.media.mediaText; try { walk(r.cssRules) } catch {} mediaNow = was; continue }
    if (!r.style || !r.selectorText) continue
    if (/data-theme=["']?dark|\\.t4-dark|\\.dark-mode|\\.is-dark|data-bs-theme=["']?dark/i.test(r.selectorText)) continue
    const root = /^(:root|html|body)$/.test(r.selectorText.trim())
    if (!root && !hit(r.selectorText)) continue
    for (const p of PROPS) { const raw = r.style.getPropertyValue(p); let h = hexOf(raw)
      // a release's tokenized colour read in the other kind: a text token as a ground or a ground token
      // as a text (the release maps a hex to a token by identity, so JA Resort's dark green, its
      // heading colour, is also its band ground: var(--ds-c-fg-2, #294138) as a background)
      if (!h) { const t = TOKEN.exec(raw); if (t && (p === 'background-color' ? TEXT_TOKENS : p === 'color' ? GROUND_TOKENS : []).includes(t[1].toLowerCase())) h = hexOf(t[2].trim()) }
      // a ground or a text read through a variable of the template's own (JA Resort's rooms slides:
      // background: var(--heading_color), its heading colour): the colour it resolves to on this page,
      // classified by this use
      via = null
      if (!h && (p === 'background-color' || p === 'color')) h = lightDarkOf(raw)
      if (!h && (p === 'background-color' || p === 'color')) h = viaVar(raw || (p === 'background-color' ? r.style.getPropertyValue('background') : ''))
      if (h) add([r.selectorText, p, h, r.style.getPropertyPriority(p) === 'important' ? 1 : 0, p === 'color' ? groundOfSel(r.selectorText) : null, via]) }
    const bg = r.style.getPropertyValue('background'); if (bg && !r.style.getPropertyValue('background-color')) { const m = bg.match(/#[0-9a-f]{3,8}\\b|rgba?\\([^)]*\\)/i); const h = /gradient|url\\(/i.test(bg) ? null : /light-dark\\(/i.test(bg) ? lightDarkOf(bg) : m ? hexOf(m[0]) : null; if (h) add([r.selectorText, 'background-color', h, r.style.getPropertyPriority('background') === 'important' ? 1 : 0]) }
    if (/^(:root|html|body)$/.test(r.selectorText.trim())) for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (n.startsWith('--')) { const h = hexOf(r.style.getPropertyValue(n).trim()); if (h) vars[n] = h } }
  } }
  for (const s of document.styleSheets) { try { walk(s.cssRules) } catch {} }
  const inline = {}
  for (const e of document.querySelectorAll('[style]')) for (const p of ['color', 'background-color']) { const h = hexOf(e.style.getPropertyValue(p)); if (h) (inline[h + '|' + p] = (inline[h + '|' + p] || 0) + 1) }
  // usage, from what the page computes
  const ch = (s) => { const n = (String(s).match(/[\\d.]+/g) || []).map(Number); return n.length < 3 ? null : { h: '#' + n.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''), a: n.length > 3 ? n[3] : 1 } }
  const ground = (e) => { for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (/url\\(|gradient/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); if (c && c.a > 0.9) return c.h } return '#ffffff' }
  const use = {}
  const u = (h) => (use[h] ||= { area: 0, text: 0, grounds: {}, border: 0 })
  for (const e of document.querySelectorAll('body, body *')) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue
    const bg = ch(cs.backgroundColor); if (bg && bg.a > 0.9 && cs.backgroundImage === 'none') { u(bg.h).area += r.width * r.height; if (r.width >= 0.9 * innerWidth && r.height >= 32) u(bg.h).wide = true }
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const c = ch(cs.color); const g = ground(e); if (c) { const x = u(c.h); x.text++; if (g) x.grounds[g] = (x.grounds[g] || 0) + 1 } }
    if (parseFloat(cs.borderTopWidth) >= 1) { const b = ch(cs.borderTopColor); if (b && b.a > 0.5) u(b.h).border++ }
  }
  const body = ch(getComputedStyle(document.body).backgroundColor)
  const pageArea = document.documentElement.clientWidth * Math.max(document.documentElement.scrollHeight, 1)
  return { page: body && body.a > 0.9 ? body.h : '#ffffff', pageArea, rules, vars, inline, use }
})()`

const rgb = (/** @type {string} */ h) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h ?? ''))
  return m ? [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16)) : null
}
const lin = (/** @type {number} */ v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** Relative luminance of a hex colour. */
export const lum = (/** @type {string} */ h) => {
  const c = rgb(h)
  return c ? 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) : 0
}
/** WCAG contrast of two hex colours. */
export const contrastOf = (/** @type {string} */ a, /** @type {string} */ b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Chroma (max − min channel, 0–255). */
export const chromaOf = (/** @type {string} */ h) => {
  const c = rgb(h)
  return c ? Math.max(...c) - Math.min(...c) : 0
}
const dist = (/** @type {string} */ a, /** @type {string} */ b) => {
  const x = rgb(a)
  const y = rgb(b)
  return x && y ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : 999
}

/** A colour counts as saturated (a brand or accent colour) from this chroma. */
export const SATURATED = 48

/**
 * The role of a colour used as a GROUND, given the page's own ground.
 * @param {string} hex
 * @param {string} page
 * @param {number} [share] the share of the pages' area this colour grounds
 */
export function groundRole(hex, page, share = 0) {
  if (dist(hex, page) <= 8) return 'bg'
  const pageLight = lum(page) > 0.4
  const light = lum(hex) > 0.4
  // a brand colour on a button, a badge, a date box: the system's accent. A brand colour that grounds
  // a whole band is the system's band (or a panel when it is on the page's side): a system has one
  // accent, for actions, and a band and the buttons on it both in the accent are one flat field (JA
  // Impact WordPress's blue band and its green buttons both turned Moxie's blue, 14/10/2026)
  if (chromaOf(hex) >= SATURATED && share < BAND_SHARE) return 'accent'
  // the same side of the page: a card or a panel; the other side: a band drawn against the page
  return light === pageLight ? 'surface' : 'band'
}

/** A ground counts as a band from this share of the pages' area. */
export const BAND_SHARE = 0.03

/**
 * The role of a colour used as TEXT, given the ground it mostly sits on (classified like any ground).
 * @param {string} hex
 * @param {string} ground the ground it sits on most
 * @param {string} page
 * @param {number} [share] the share of the pages' area its ground covers
 */
export function textRole(hex, ground, page, share = 0) {
  const g = groundRole(ground, page, share)
  if (g === 'band') return 'on-band'
  if (g === 'accent') return 'on-accent'
  if (chromaOf(hex) >= SATURATED) return 'accent-text'
  return contrastOf(hex, ground) >= 6 ? 'fg' : 'muted'
}

/**
 * Each declaration and variable of the probe with the role of its colour. PURE.
 * @param {ReturnType<any>} probe `PALETTE_PROBE`'s answer
 * @param {{ roles?: Record<string, string>, selectors?: Record<string, string> }} [hints] a contract's role
 *   hints: `#hex` → role, or a part of a ground rule's selector → role
 * @returns {{ page: string, rules: [string, string, string, 0 | 1][], vars: [string, string][], inline: [string, string, string][], colours: Record<string, string> }}
 */
/** A template variable that names a line colour: --border, --line, --divider, --rule, --chrome-border… */
const LINE_VAR = /^--(?:[\w-]*-)?(?:border|line|divider|rule|hairline)(?:-[\w-]*)?$/i
/** A template variable that names its heading colour: --heading, --chrome-heading, --heading-color… */
const HEADING_VAR = /^--(?:[\w-]*-)?heading(?:-colou?r)?$/i

/**
 * The role of a colour the template reads through the system's own accent variable (the accent preset,
 * --ds-c-accent): a fill is the accent, the words written through accent-on are the accent's words,
 * however much of the page the hex grounds elsewhere. Classified by its hex, WordPress Tracy Base's
 * numbered step circles (.bg-accent, 40px) shared Apple's blue with the wide closing call box and took
 * the band, their digits (.text-accent-on) the band's words: under Figma dark both near-black and the
 * digits gone (15/10/2026). A band the template draws in the accent is the contract's (bands.mjs).
 * @param {string | null | undefined} via  the variable the rule reads
 * @param {string} prop
 * @returns {'accent' | 'on-accent' | null}
 */
export function accentRead(via, prop) {
  const n = String(via ?? '')
  if (prop === 'background-color' && /^--(?:wp--preset--color--|ds-c-)accent(?:-hover|-active)?$/.test(n))
    return 'accent'
  if (prop === 'color' && /^--(?:wp--preset--color--|ds-c-)accent-on$/.test(n)) return 'on-accent'
  return null
}

export function classifyPalette(probe, hints = {}) {
  const page = String(probe?.page ?? '#ffffff').toLowerCase()
  const use = probe?.use ?? {}
  // a hint can also name a selector (a part of it): that rule's colour takes the role, whatever its hex
  const bySelector = Object.entries(hints.selectors ?? {}).filter(([, r]) =>
    PALETTE_ROLES.includes(String(r))
  )
  const selectorHint = (/** @type {string} */ sel) => bySelector.find(([k]) => sel.includes(k))?.[1] ?? null
  const hint = (/** @type {string} */ h) => {
    const r = hints.roles?.[h]
    return PALETTE_ROLES.includes(String(r)) ? String(r) : null
  }
  /** the ground a colour sits on most when used as text; the page when never seen as text */
  const mostGround = (/** @type {string} */ h) => {
    const g = Object.entries(use[h]?.grounds ?? {}).sort((a, b) => b[1] - a[1])[0]
    return g ? g[0] : page
  }
  const pageArea = Number(probe?.pageArea) > 0 ? Number(probe.pageArea) : 0
  // a ground drawn across the whole width (a top bar, a footer) is a band however thin
  const shareOf = (/** @type {string} */ h) =>
    use[h]?.wide ? 1 : pageArea ? (use[h]?.area ?? 0) / pageArea : 0
  const colours = /** @type {Record<string, string>} */ ({})
  const roleFor = (/** @type {string} */ h, /** @type {string} */ prop) => {
    const forced = hint(h)
    if (forced) return forced
    if (prop === 'background-color') return groundRole(h, page, shareOf(h))
    if (prop === 'color' || prop === 'fill' || prop === 'text-decoration-color') {
      const g = mostGround(h)
      return textRole(h, g, page, shareOf(g))
    }
    return chromaOf(h) >= SATURATED ? 'accent' : 'border'
  }
  const rules = /** @type {[string, string, string, 0 | 1][]} */ (
    (probe?.rules ?? []).map(([s, p, h, imp, g, via, media]) => {
      // a rule of a @media block: its condition rides at the end (autoPaletteCss writes it back)
      const row = (/** @type {string | null} */ role) =>
        media
          ? [String(s), String(p), role, imp ? 1 : 0, via ? String(via) : null, String(media)]
          : via
            ? [String(s), String(p), role, imp ? 1 : 0, String(via)]
            : [String(s), String(p), role, imp ? 1 : 0]
      const forced = p === 'background-color' ? selectorHint(String(s)) : null
      if (forced) return row(forced)
      const accent = accentRead(via, String(p))
      if (accent) {
        colours[h] ??= accent
        return row(accent)
      }
      // a fill read through the template's line variable (background: var(--border)) is a line drawn
      // as a box, a hairline or a rule: it takes the line role whatever its hex is nearest. JA Kinetic
      // Joomla's incident timeline line, read as a surface, vanished into its band (14/10/2026)
      if (p === 'background-color' && via && LINE_VAR.test(String(via))) {
        colours[h] ??= 'border'
        return row('border')
      }
      // a text over a picture keeps a light-or-dark meaning the picture gives it: it is left alone
      const role =
        p === 'color' && g === 'picture' && !hint(h)
          ? null
          : p === 'color' && typeof g === 'string' && /^#[0-9a-f]{6}$/i.test(g) && !hint(h)
            ? textRole(h, g, page, shareOf(g))
            : roleFor(h, p)
      if (role) colours[h] ??= role
      // words read through the template's heading variable (color: var(--heading)) are its headings:
      // as text they take the system's heading colour, as its tokenized variable does for every other
      // heading. Classified by their hex (the darkest text), JA Kinetic Joomla's timeline heading took
      // the body text colour, near-black under Toggl Track beside plum headings (14/10/2026)
      if (role === 'fg' && p === 'color' && via && HEADING_VAR.test(String(via))) return row('heading')
      return row(role)
    })
  ).filter((r) => r[2] !== null)
  // a colour variable: only a saturated one (a brand colour), by how the page uses it. A neutral
  // variable (--white, --body-text-color) is used both as a ground and as a text (a white that is the
  // page on one block is the text over a photo on the next), so its meaning is the contract's
  // (runtime, templateVars) or the release's tokens, never a guess from usage: mapped by usage, JA
  // Impact's white titles over photos turned black under Moxie (14/10/2026)
  const vars = /** @type {[string, string][]} */ (
    Object.entries(probe?.vars ?? {})
      .filter(([, h]) => hint(h) || chromaOf(h) >= SATURATED)
      .map(([n, h]) => {
        const u = use[h]
        return [n, hint(h) ?? (u && u.text > 0 && u.text * 2000 > u.area ? 'accent-text' : 'accent')]
      })
  )
  const inline = /** @type {[string, string, string][]} */ (
    Object.keys(probe?.inline ?? {}).map((k) => {
      const [h, p] = k.split('|')
      return [h, p, roleFor(h, p)]
    })
  )
  return { page, rules, vars, inline, colours }
}

/**
 * The system colour (CSS value) of each role. A band and the text on it depend on the side of light the
 * worn page is on, which the page decides (a WordPress theme's presets are light-dark() pairs, so the
 * same system shows its light side on a visitor whose system is light and its dark side on one whose
 * system is dark, 14/10/2026): they are written with light-dark(), which follows the page's own
 * color-scheme, never a side guessed at emit time.
 */
export function roleValues() {
  return {
    bg: 'var(--ds-c-bg)',
    surface: 'var(--ds-c-surface)',
    // a band is a ground on the other side of the page: the system's ink, its strongest text colour on
    // a light page and a raised surface on a dark one (a near-white band on a dark page is not a band
    // but a glare), each side's ink computed with the words that read on it (role-values.mjs). The ink,
    // not the role named fg: a template whose headings hold the strongest ink left its fg the system's
    // body grey, and JA Resort's bands turned Notion's #6c6c6c, its accent words 1:1 on them. Its words
    // are the ink's own (--ds-c-on-ink), never a colour of the page side: on a dark side the ink is a
    // dark ground, and the band's words written as the ink were dark on dark (Figma dark #1b1b1b on
    // #202020, every palette band of every dark side, 15/10/2026)
    band: `var(--ds-c-ink, light-dark(var(--ds-c-fg), ${DARK_BAND}))`,
    'on-band': 'var(--ds-c-on-ink, light-dark(var(--ds-c-bg), var(--ds-c-fg)))',
    accent: 'var(--ds-c-accent)',
    'on-accent': 'var(--ds-c-accent-on)',
    'accent-text': 'var(--ds-c-accent-text, var(--ds-c-accent))',
    fg: 'var(--ds-c-fg)',
    // a system's heading colour where it has one (--ds-c-fg-2), else its text colour
    heading: 'var(--ds-c-fg-2, var(--ds-c-fg))',
    muted: 'var(--ds-c-muted)',
    border: 'var(--ds-c-border)'
  }
}

/** A band on a dark page where the sheet writes no ink: the system's surface lifted toward its text colour. */
export const DARK_BAND = 'color-mix(in srgb, var(--ds-c-surface) 82%, var(--ds-c-fg))'

/**
 * Variables that are the CMS's or the slot's own, never a template colour to repoint: WordPress's presets
 * are what the system's colours are written into (--ds-c-accent is var(--wp--preset--color--accent)), so
 * repointing one at its role made a cycle and every button that read it lost its fill (JA Vega, Impact
 * WordPress, 14/10/2026); the admin bar's and the slot's own likewise.
 */
const SYSTEM_VARS = /^--(wp-|wp--|ds-)/

/** A selector list split at its top-level commas only (never inside :is(), :where(), :not() or []). */
export function splitTop(/** @type {string} */ sel) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of String(sel)) {
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Roles that belong to a band or an accent ground, never to the whole page. */
const GROUND_ONLY = new Set(['band', 'on-band', 'accent', 'on-accent'])

/**
 * Whether a selector names elements only (no class, id or attribute): it reaches the whole page. The
 * framework's heading classes (.h1 to .h6) are the headings by another name: Bootstrap writes them with
 * h1 to h6 in one rule, which read as a class rule took a band's words to every heading of the page
 * (JA Kinetic Joomla, 15/10/2026).
 */
function isGeneric(/** @type {string} */ sel) {
  return splitTop(sel).every(
    (x) => !/[.#[]/.test(x.replace(/:(not|is|where)\([^)]*\)/g, '').replace(/\.h[1-6](?![\w-])/g, ''))
  )
}

/** Whether a selector names only the page itself (`body`, `html`, `:root`, or a list of them). */
function isPage(/** @type {string} */ sel) {
  return splitTop(sel).every((x) => /^(html|body|:root)$/.test(x.trim()))
}

/** A selector whose last element is a link: never one drawn as a button (its words are the button's). */
function notButton(/** @type {string} */ x) {
  const m = /(^|[\s>+~])a((?:[.:#[][^\s>+~]*)?)$/.exec(x)
  if (!m || /btn|button/i.test(m[2])) return x
  const pseudo = /::?(before|after|hover|focus|active|visited)(\([^)]*\))?$/.exec(x)
  const at = pseudo ? x.length - pseudo[0].length : x.length
  return `${x.slice(0, at)}:not([class*=btn]):not([class*=button])${x.slice(at)}`
}

/** Whether every part of a selector ends on a button. */
function isButton(/** @type {string} */ sel) {
  return splitTop(sel).every((x) =>
    /btn|button|owl-dot|slick-dots|swiper-pagination-bullet/i.test(
      x
        .trim()
        .split(/[\s>+~]+/)
        .at(-1) ?? ''
    )
  )
}

/** Whether a rule paints a contract band's own ground, or a word inside one. */
function bandOwned(/** @type {string} */ sel, /** @type {string} */ prop, /** @type {string[]} */ bands) {
  const keys = bands.filter((b) => /^[.#][\w-]+$/.test(b))
  if (!keys.length) return false
  const parts = splitTop(sel).map((x) => x.trim())
  const at = (/** @type {string} */ x, /** @type {string} */ k) =>
    new RegExp(`${k.replace(/[.#]/g, '\\$&')}(?![\\w-])`).exec(x)
  if (prop === 'background-color')
    return parts.some((x) =>
      keys.some((k) => {
        const m = at(x, k)
        return (
          m &&
          !/[\s>+~]/.test(
            x
              .slice(m.index + k.length)
              .replace(/::?[\w-]+(\([^)]*\))?/g, '')
              .trim()
              ? 'x x'
              : ''
          )
        )
      })
    )
  return parts.some((x) => keys.some((k) => at(x, k)))
}

/** Whether a variable named for one kind of colour (text, ground) is read as the other. */
export function otherKind(/** @type {string} */ name, /** @type {string} */ prop) {
  const n = name.toLowerCase()
  const text = /(^|-)(fg|fg-2|muted|meta|text|heading|ink)$/.test(n)
  const ground = /(^|-)(bg|surface|surface-warm|paper|ground|band)$/.test(n)
  return (prop === 'background-color' && text) || (prop === 'color' && ground)
}

const SAFE_SELECTOR = /^[^{}<>;\\]+$/
/** A @media condition a palette row carries: words, numbers, parentheses, colons, commas, dots. */
const SAFE_MEDIA = /^[\w\s():.,-]+$/

/**
 * The rules that give the template's palette the worn system's colours. PURE.
 * @param {ReturnType<typeof classifyPalette> | null | undefined} auto the contract's `autoPalette`
 * @param {{ dark?: boolean, hi: string, outside?: (list: string[]) => string[], keep?: string[], known?: string[] }} p
 *   `hi`: the specificity prefix of the emitter; `outside`: the emitter's kept-band exclusion;
 *   `keep`: the contract's justified exceptions (`paletteKeep` selectors), never recoloured;
 *   `known`: variables the contract already maps (runtime, templateVars), which keep its meaning
 * @returns {string}
 */
export function autoPaletteCss(auto, { hi, outside = (l) => l, keep = [], known = [], bands = [] }) {
  if (!auto || !Array.isArray(auto.rules)) return ''
  const v = roleValues()
  const keepList = keep.filter((s) => typeof s === 'string' && SAFE_SELECTOR.test(s))
  const skip = (/** @type {string} */ sel) => keepList.some((k) => sel.includes(k))
  const out = []
  // colour variables of the template's root: repointed at their role
  const vars = (auto.vars ?? [])
    .filter(([n, r]) => /^--[\w-]+$/.test(n) && v[r] && !known.includes(n) && !SYSTEM_VARS.test(n))
    .map(([n, r]) => `${n}:${v[r]}`)
  if (vars.length) out.push(`${hi}{${vars.join(';')}}`)
  // the selectors that set a text colour of their own: a band ground does not override them
  /** @type {Map<string, string[]>} */
  const bySel = new Map()
  for (const [sel, prop, read, imp, via, media] of auto.rules) {
    // the page's own ground (body, html) is the page on every page the palette was read off: read against
    // the first page's colour, the darker grounds of JA Kinetic's other demo homes made its body a surface,
    // the last page's role won, and the page took the system's surface (Moxie's #1a1a1a for its #000,
    // MotherDuck's white for its #f4efea, Spotify's #1f1f1f, 15/10/2026)
    // a colour read through the system's accent is the accent's whatever role a palette stored for it
    // (accentRead): palettes classified before it held Tracy Base's step circles as a band
    const role = accentRead(via, prop) ?? (prop === 'background-color' && isPage(sel) ? 'bg' : read)
    if (!SAFE_SELECTOR.test(sel) || !v[role] || skip(sel)) continue
    if (media && !SAFE_MEDIA.test(media)) continue
    // a band the contract paints (bands.mjs) chose its ground and the words that read on it together:
    // its ground and its words are left to it (JA Impact WordPress's top bar: the palette's band ground
    // under the contract's words, dark on black, 14/10/2026)
    if (bandOwned(sel, prop, bands)) continue
    // a bare element selector (a, h1, p, body) paints the whole page: it never takes a band's or an
    // accent's colours, whatever most of its elements sat on (JA Kinetic Joomla: every link took the
    // band text colour, a cream button label on the light accent, 14/10/2026)
    if (GROUND_ONLY.has(role) && isGeneric(sel)) continue
    // read through a variable that already follows the system (a CMS preset, a token the slot or the
    // contract sets): it is right already. Tracy Business's headings read the fg preset; reclassified,
    // they took the band text colour everywhere (cream on cream, 14/10/2026)
    // unless it is read in the other kind: a text colour as a ground, a ground as a text (JA Resort's
    // heading colour as its rooms band)
    // a ground the page draws as a band stays a band, so the words classified on it read (JA Impact's
    // navy top bar, read through --color-primary: kept the accent while its words took the band's)
    // and a text written on a band or an accent ground, which the page colour it reads would leave
    // unreadable once that ground is the system's band (JA Impact WordPress's footer words, JA Nova's
    // feature band: the fg preset, black on the band's black, 14/10/2026)
    if (
      via &&
      (SYSTEM_VARS.test(via) || known.includes(via)) &&
      !otherKind(via, prop) &&
      role !== 'band' &&
      role !== 'on-band' &&
      role !== 'on-accent'
    )
      continue
    // a button is the button rules' (the contract and the system's button roles pair its fill, its
    // border and its words): the palette recolouring one part of it left words on a fill they were not
    // chosen for (JA Resort's Book Now, JA Kinetic's Start free, 14/10/2026)
    if (isButton(sel)) continue
    const at = media ? `${media}\u0000${sel}` : sel
    const decls = bySel.get(at) ?? []
    decls.push(`${prop}:${v[role]}${imp ? '!important' : ''}`)
    // a band or accent ground carries the text colour that reads on it, when the selector sets none
    // the words on a band or an accent ground take its text colour through the words rule below, never
    // through the ground's own color: inherited, it reached the buttons on the band too, whose words are
    // chosen for their own fill (JA Resort's Book Now, JA Kinetic's Start free, 14/10/2026)
    bySel.set(at, decls)
  }
  for (const [at, decls] of bySel) {
    const cut = at.indexOf('\u0000')
    const media = cut < 0 ? null : at.slice(0, cut)
    const sel = cut < 0 ? at : at.slice(cut + 1)
    const list = splitTop(sel)
      .map((x) => x.trim())
      .filter(Boolean)
    // every palette rule is its template rule plus one :root, never the slot's six: a template rule
    // that outweighs another keeps doing so once both are recoloured (JA Impact WordPress: the band's
    // heading rule, raised above the card's own title rule, turned the cards' titles the band's cream
    // on the cards' cream, 14/10/2026), and every contract rule still outweighs the palette
    const prefix = ':root'
    const scoped = outside(list.map(notButton)).map((x) =>
      /^(:root|html)\b/.test(x) ? x.replace(/^(:root|html)/, prefix) : `${prefix} ${x}`
    )
    const rule = `${scoped.join(',')}{${[...new Set(decls)].join(';')}}`
    if (scoped.length) out.push(media ? `@media ${media}{${rule}}` : rule)
  }
  // colours the content writes inline: only !important outranks an inline style
  for (const [h, prop, role] of auto.inline ?? []) {
    if (!/^#[0-9a-f]{6}$/i.test(h) || !v[role] || !/^(color|background-color)$/.test(prop)) continue
    const forms = [';', ''].flatMap((lead) =>
      [`${prop}:`, `${prop}: `].map((c) =>
        lead === '' ? `[style^="${c}${h}" i]` : `[style*="${lead}${c}${h}" i]`
      )
    )
    out.push(
      `${outside(forms)
        .map((x) => `${hi} ${x}`)
        .join(',')}{${prop}:${v[role]}!important}`
    )
  }
  return out.join('\n')
}
