// inline-colors.mjs — colour literals in inline `style` attributes → the theme's colour presets.
//
// A canvas export writes computed styles: `style="background: rgb(237,234,226); color:
// rgb(20,23,26)"`. The source followed dark mode through a CSS variable; the export baked the
// light value in. Verbatim HTML (a core/html fallback) therefore keeps a light background under
// the theme's dark palette while the inherited text colour flips — the About/Projects/Careers
// contrast 1.0 of G-W3. Rewriting a literal that IS a theme token to
// `var(--wp--preset--color--<slug>)` lets the preset (and so dark mode) own it again.
//
// Only literals within `style="…"` are touched, only the literal itself (the rest of a
// `border: 1px solid …` value stays), only when it lands within a small RGB distance of a
// palette entry, and never a translucent rgba() — the token is opaque, the literal is not. The
// canvas export writes an opaque colour as `rgba(r, g, b, 0.996)` (254/255, a rounding
// artefact); alpha ≥ 0.99 counts as opaque. A `var(--…)` is not a literal, so a second pass
// over rewritten markup changes nothing.

import { colorValue, parseTokensCss, tokensFromContract } from '../theme-tokens.mjs'

/** The 16 colour tokens of the 56; the theme.json preset slug is the name without `--`. */
const COLOR_TOKENS = Object.freeze([
  '--bg', '--surface', '--surface-warm', '--fg', '--fg-2', '--muted', '--meta', '--border',
  '--border-soft', '--accent', '--accent-on', '--accent-hover', '--accent-active', '--success',
  '--warn', '--danger'
])

// A literal is matched by colour AND by role: the source paints its dark "ink" bands with the
// same #14171a it writes body text in, and mapping that background to the `fg` preset turns the
// band light under dark mode (fg flips to #eceae4) — a band, text and all, gone pale. So a
// background only maps to a surface-role preset (or the theme's brand ink, a custom that flips
// to a darker ink), a text colour only to a text-role one. A border or shadow may be either — a
// line in the text colour flips with the text, a line in the page colour with the page — so it
// takes the nearest of all.
// `border` and `border-soft` are surfaces too: a rule the export draws as a 1px div, or a
// swatch of the line colour, is a background painted in the line colour — and lands 35 from the
// nearest paper, which is where it went before (the style guide's "Line" swatch showed Paper 2).
const ROLE = Object.freeze({
  surface: ['bg', 'surface', 'surface-warm', 'border', 'border-soft', 'accent', 'accent-hover', 'accent-active', 'success', 'warn', 'danger'],
  text: ['fg', 'fg-2', 'muted', 'meta', 'accent', 'accent-on', 'accent-hover', 'success', 'warn', 'danger']
})
const roleOf = (prop) => {
  const p = prop.trim().toLowerCase()
  if (/^background/.test(p)) return 'surface'
  if (p === 'color' || /text-fill-color|caret-color|^fill$|^stroke$|text-decoration-color/.test(p)) return 'text'
  return null
}

const STYLE_ATTR_RE = /\sstyle=("[^"]*"|'[^']*')/g
const LITERAL_RE = /(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\))/g

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const OPAQUE_ALPHA = 0.99 * 255

/** `#rrggbb` of a literal that is opaque (alpha ≥ 0.99), else null. */
function opaqueHex(literal) {
  const hex = colorValue(literal)
  if (!hex) return null
  if (hex.length === 7) return hex
  return hex.length === 9 && parseInt(hex.slice(7, 9), 16) >= OPAQUE_ALPHA ? hex.slice(0, 7) : null
}
const distance = (a, b) => Math.hypot(...channels(a).map((v, i) => v - channels(b)[i]))
// A neutral (grey, beige, off-white: channel spread ≤ 24) text or surface colour is a shade,
// not a hue: the source's #5a5952 body grey and #e4dfd6 panel beige sit 19–40 from the nearest
// token, and keeping them literal is exactly the light-on-dark failure this file exists to
// prevent. A neutral literal in a role therefore matches a neutral token of that role within a
// wider distance; a hue keeps the tight tolerance.
// A LINE is neutral the same way, and it needs the same widening: the canvas export draws the
// source's hairlines as `border: 1px solid rgb(220,215,204)`, 35–48 from the nearest line token,
// and a literal there survives into dark mode as a pale rule on a near-black page. Measured 15/09
// on the first dark run of wp-tracy-business: 16 bright-border findings, every one a hairline or
// a swatch the export baked. So the widening follows the LITERAL being neutral, not the role
// being known — a border and a shadow have no role (they may flip with the text or with the
// page), and that is a reason to let them find the nearest neutral token, not to deny it.
const spread = (hex) => Math.max(...channels(hex)) - Math.min(...channels(hex))
const isNeutral = (hex) => spread(hex) <= 24
const NEUTRAL_TOLERANCE = 48

// A pale tint is not a paper. The source's callout green rgb(232,240,235), its error pink
// rgb(252,243,242) and its warning amber rgb(251,242,226) each sit within 16 of a warm paper
// preset — RGB distance cannot tell a tint from a shade at that lightness — and mapping them to
// the paper loses exactly the colour that carried the state (G-W20). Two tests tell them apart.
// The hue, when both colours have one, must agree within HUE_TOLERANCE degrees: "has one" is
// HSL saturation ≥ TINT_SATURATION — the pale green (0.21) and the warm papers (0.17–0.26) do,
// a body grey #5a5952 (0.05) does not, its hue angle is noise and a cool grey token still
// takes it. And the chroma must be alike: a literal whose channel spread is more than twice the
// token's (plus a little) is a tint of something the token is not — the amber (25) against the
// paper (7). Either mismatch keeps the literal. The muted green text #22453a (spread 35) still
// meets the accent (52): same hue, chroma within the ratio.
const TINT_SATURATION = 0.1
const TINT_SPREAD = 6
const HUE_TOLERANCE = 20
const hue = (hex) => {
  const [r, g, b] = channels(hex)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
/** HSL saturation, 0–1. */
const saturation = (hex) => {
  const c = channels(hex).map((v) => v / 255)
  const max = Math.max(...c)
  const min = Math.min(...c)
  const d = max - min
  if (!d) return 0
  const l = (max + min) / 2
  return d / (1 - Math.abs(2 * l - 1))
}
const hueDiff = (a, b) => {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}
const tintMismatch = (literal, token) => {
  if (saturation(literal) >= TINT_SATURATION && saturation(token) >= TINT_SATURATION && hueDiff(literal, token) > HUE_TOLERANCE) return true
  const sl = spread(literal)
  const st = spread(token)
  return Math.max(sl, st) > 2 * Math.min(sl, st) + TINT_SPREAD
}

/** The palette entry within `tolerance` of an opaque `#rrggbb`, nearest first; null when none. */
function nearest(hex, palette, tolerance, role = null) {
  let best = null
  const neutral = isNeutral(hex)
  for (const p of palette) {
    if (role ? !(p.roles ? p.roles.includes(role) : ROLE[role].includes(p.slug)) : p.roles) continue
    const d = distance(hex, p.color)
    if (d > 0 && tintMismatch(hex, p.color)) continue
    const limit = neutral && isNeutral(p.color) ? Math.max(tolerance, NEUTRAL_TOLERANCE) : tolerance
    // On a tie a brand custom wins over a preset (the merged palette lists presets first).
    const better = best === null || d < best.d || (d === best.d && p.var && !best.custom)
    if (d <= limit && better) best = { slug: p.slug, var: p.var ?? `var(--wp--preset--color--${p.slug})`, custom: !!p.var, d }
  }
  return best
}

/**
 * Rewrite colour literals in inline styles to the theme's colour presets.
 * @param {string} markup
 * @param {Array<{ slug: string, color: string }>} palette - opaque `#rrggbb` per preset slug
 * @param {{ tolerance?: number }} [opts] - max RGB Euclidean distance for a match (default 16: the source paints a muted green text #22453a, 14 from the accent)
 * @returns {{ markup: string, replaced: number, kept: number }}
 */
export function presetInlineColors(markup, palette, { tolerance = 16 } = {}) {
  let replaced = 0
  let kept = 0
  // A colour the copy NAMES is a swatch, not a theme colour. The style guide prints its palette as
  // boxes painted `background: rgb(245,243,238)` beside the text "#F5F3EE"; mapped to the paper
  // preset the box flips with dark mode and the card lies about the brand (colour lens, 15/09:
  // Paper drawn ink, Ink drawn deep green). So every hex the markup carries as TEXT — outside a
  // style attribute — keeps its literal in that markup.
  const named = new Set()
  // text nodes only: an `href="#f5f3ee"` is an anchor, not a name
  for (const m of markup.matchAll(/>([^<]*)</g)) for (const h of m[1].matchAll(/#([0-9a-fA-F]{6})\b/g)) named.add(`#${h[1].toLowerCase()}`)
  const out = markup.replace(STYLE_ATTR_RE, (attr, quoted) => {
    const value = quoted
      .slice(1, -1)
      .split(';')
      .map((decl) => {
        const colon = decl.indexOf(':')
        if (colon === -1) return decl
        const role = roleOf(decl.slice(0, colon))
        return decl.slice(0, colon + 1) + decl.slice(colon + 1).replace(LITERAL_RE, (literal) => {
          const hex = opaqueHex(literal)
          // A swatch is a FILLED box: only a surface painted in a named colour stays literal.
          // The text on the same page set in that colour is text — the style guide names the
          // brand ink beside its swatch and every paragraph on it is ink too (15/09: kept literal,
          // ink on ink in dark, 1.04:1).
          const hit = hex && !(named.has(hex) && role === 'surface') ? nearest(hex, palette, tolerance, role) : null
          if (!hit) {
            kept++
            return literal
          }
          replaced++
          return hit.var
        })
      })
      .join(';')
    return ` style=${quoted[0]}${value}${quoted[0]}`
  })
  return { markup: out, replaced, kept }
}

const toPalette = (tokens) =>
  COLOR_TOKENS.flatMap((name) => {
    const hex = colorValue(tokens[name])
    return hex && hex.length === 7 ? [{ slug: name.slice(2), color: hex }] : []
  })

/** The colour tokens a design contract measures (`tokensFromContract`, one variant), as presets. */
export function paletteFromContract(contract, { variant = 'desktop-light' } = {}) {
  return toPalette(tokensFromContract(contract, { variant }).tokens)
}

/** The colour tokens of a tokens.css (the theme overlay's `rootTokens`), as presets. */
export function paletteFromTokensCss(css) {
  return toPalette(parseTokensCss(css))
}

/**
 * The brand customs a surface may map to: `ink` and `header` are restated by the theme's dark
 * block, `green` is the filled button the source keeps green in both modes (white text on it
 * stays 7:1). `paper`, `mint`, `orange` are not: paper would stay white under dark.
 */
const BRAND_SURFACES = ['ink', 'header', 'green']
/**
 * The brand customs a TEXT colour may map to: `prose`, the body copy the theme restates for
 * dark (#242830 → #DDDAD3). The source writes its transactional email body in it, 33 from the
 * `fg` preset — inside the neutral tolerance — so it mapped to fg and measured ink where the
 * source measured prose, in both modes (full-2, 15/09: 8 rows on the email page). `inkText`,
 * `greenText` and the captions are text ON a band; the theme does not restate them and a
 * paragraph on the page painted in them would not flip.
 */
const BRAND_TEXTS = ['prose']

/**
 * A built theme.json's `settings.color.palette`, opaque entries only — plus the theme's brand
 * customs above (`settings.custom.tracy.brand.*`) as surface- or text-role entries, listed FIRST so that
 * on a tie (the brand green is also the `accent` preset) the custom wins: a band painted in the
 * brand ink maps to `var(--wp--custom--tracy--brand--ink)`, which the theme flips for dark, and
 * a green button stays green instead of turning the dark accent's mint with white text on it.
 */
export function paletteFromThemeJson(themeJson) {
  const presets = (themeJson?.settings?.color?.palette ?? []).flatMap((p) => {
    const hex = colorValue(p?.color)
    return hex && hex.length === 7 && typeof p.slug === 'string' ? [{ slug: p.slug, color: hex }] : []
  })
  const brand = themeJson?.settings?.custom?.tracy?.brand ?? {}
  const custom = (names, roles) =>
    names.flatMap((name) => {
      const hex = colorValue(brand[name])
      return hex && hex.length === 7 ? [{ slug: `brand-${name}`, color: hex, roles, var: `var(--wp--custom--tracy--brand--${name})` }] : []
    })
  return [...custom(BRAND_SURFACES, ['surface']), ...custom(BRAND_TEXTS, ['text']), ...presets]
}

/** Later sources win by slug: the built theme is what the preset resolves to, the contract what was measured. */
export function mergePalettes(...palettes) {
  const bySlug = new Map()
  for (const list of palettes) for (const p of list) bySlug.set(p.slug, p)
  return [...bySlug.values()]
}
