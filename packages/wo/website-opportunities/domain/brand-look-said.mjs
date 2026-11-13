// Whether a line of a plan names the template's look (ticket #616, two reviews of 13/11). Two checks:
//   - the template's accent VALUE, in any form it is written: `#rrggbb` or `rrggbb` in any case, `#rgb` when it
//     expands to the accent, `rgb()` / `rgba()`, and `hsl()` / `hsla()` within rounding of the accent. This holds in
//     every language a line is written in;
//   - the template's WORDS: its (the theme's, the demo's) accent, colours, palette, look, a colour name or its logo
//     ("the template's red", "the demo look", "theme colours", a straight or curly possessive), "default colours /
//     palette / accent", what "came with the template", and the kit's name followed by "logo" or "colours". The kit's
//     FULL name (the slug's words, "JA Boxing", or a name of several words) always counts; a short one word name only
//     beside "template", "theme" or "demo" in the same clause, so "Boxing logo shirts" is a business sentence. "palette
//     knife" is a tool. These are English words only: a line the model writes in another language is held by the value
//     check alone. "page template" stays a legitimate phrase. Pure.
import { hexOf } from './brand-hue.mjs'

const S = String.raw`(?:'s|’s)?`
const OF_TEMPLATE = String.raw`(?:templates?|themes?|demos?)${S}`
const COLOUR_NAMES =
  'red|blue|green|yellow|orange|purple|violet|pink|brown|black|white|gr[ae]y|teal|navy|gold|copper|crimson|maroon|beige|cream|turquoise|cyan|magenta'
const PALETTE = String.raw`palettes?(?!\s+kni(?:fe|ves)\b)`
const COLOUR_THINGS = String.raw`accents?|colou?rs?|${PALETTE}|look|${COLOUR_NAMES}`
const LOGO_THINGS = 'logos?'
const LOOK_WORDS = (things) =>
  new RegExp(
    String.raw`\b${OF_TEMPLATE}\s+(?:default\s+)?(?:${things})\b|\b(?:${things})\s+of\s+(?:the|this|that|your)\s+(?:template|theme|demo)\b`,
    'i'
  )
const COLOUR_WORDS = LOOK_WORDS(COLOUR_THINGS)
const LOGO_WORDS = LOOK_WORDS(LOGO_THINGS)
const DEFAULT_WORDS = new RegExp(String.raw`\bdefault\s+(?:accents?|colou?rs?|${PALETTE})\b`, 'i')
const CAME_WITH = /\b(?:came|comes|come|shipped|ships)\s+with\s+the\s+(?:template|theme|demo)\b/i
const COLOUR_WORD = new RegExp(String.raw`\b(?:${COLOUR_THINGS})\b`, 'i')
const LOGO_WORD = /\blogos?\b/i
const TEMPLATE_WORD = /\b(?:templates?|themes?|demos?)\b/i
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The clauses of a line: a short kit name counts only beside a template word in its own clause. */
const clausesOf = (line) => String(line).split(/[.;!?]+(?:\s|$)|,\s+/u)

/** The red, green and blue of an `hsl()` reading; null when it is not one. */
function rgbOfHsl(h, s, l) {
  const [H, S1, L] = [(((h % 360) + 360) % 360) / 360, s / 100, l / 100]
  if (!(S1 >= 0 && S1 <= 1 && L >= 0 && L <= 1)) return null
  const q = L < 0.5 ? L * (1 + S1) : L + S1 - L * S1
  const p = 2 * L - q
  const channel = (t) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    const v = u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p
    return Math.round(v * 255)
  }
  return [channel(H + 1 / 3), channel(H), channel(H - 1 / 3)]
}
const HSL = /\bhsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[\s,]\s*(\d+(?:\.\d+)?)%\s*[\s,]\s*(\d+(?:\.\d+)?)%/gi
/** How far an `hsl()` reading of whole numbers may land from the accent on each channel. */
const HSL_TOLERANCE = 3

/** The check of the template's accent value a line may carry, or null without an accent. */
function valueOf(accent) {
  const hex = hexOf(accent)
  if (!hex) return null
  const n = Number.parseInt(hex.slice(1), 16)
  const rgb = [n >> 16, (n >> 8) & 255, n & 255]
  const [r, g, b] = rgb
  const short = /^#(.)\1(.)\2(.)\3$/i.exec(hex)
  const written = new RegExp(
    [
      String.raw`(?:^|[^0-9a-z])#?${hex.slice(1)}(?![0-9a-z])`,
      String.raw`\brgba?\(\s*${r}\s*,\s*${g}\s*,\s*${b}\s*[,)]`,
      ...(short ? [String.raw`(?:^|[^0-9a-z&])#${short[1]}${short[2]}${short[3]}(?![0-9a-z])`] : [])
    ].join('|'),
    'i'
  )
  const hslNear = (line) =>
    [...String(line).matchAll(HSL)].some(([, h, s, l]) => {
      const got = rgbOfHsl(Number(h), Number(s), Number(l))
      return got !== null && got.every((c, i) => Math.abs(c - rgb[i]) <= HSL_TOLERANCE)
    })
  return (line) => written.test(line) || hslNear(line)
}

/** The kit's names as patterns: full ones (the slug's words, a name of several words) and short one word names. */
function namesOf(template) {
  const words = (text) =>
    text
      .trim()
      .split(/[\s_-]+/u)
      .filter(Boolean)
  const pattern = (parts) => parts.map(escape).join(String.raw`[\s-]+`)
  const all = [template?.name, template?.slug]
    .filter((n) => typeof n === 'string' && n.trim() !== '')
    .map(words)
  const full = all.filter((w) => w.length > 1).map(pattern)
  const short = all.filter((w) => w.length === 1).map(pattern)
  return { full, short }
}

const namedRegex = (names, things) =>
  names.length ? new RegExp(String.raw`\b(?:${names.join('|')})${S}\s+(?:${things})\b`, 'i') : null

/**
 * The checks of one template: `logo(line)` and `colour(line)` say whether a line names its logo or its colour.
 * @param {{name?: string, slug?: string, accent?: string}} template
 */
export function templateLookWordsOf(template) {
  const value = valueOf(template?.accent)
  const { full, short } = namesOf(template)
  const fullColour = namedRegex(full, COLOUR_THINGS)
  const fullLogo = namedRegex(full, LOGO_THINGS)
  const shortColour = namedRegex(short, COLOUR_THINGS)
  const shortLogo = namedRegex(short, LOGO_THINGS)
  /** Whether a clause names the template's look in words, by its colour or logo patterns. */
  const inClauses = (line, { words, fullName, shortName, thing }) =>
    clausesOf(line).some(
      (c) =>
        words.test(c) ||
        Boolean(fullName?.test(c)) ||
        (Boolean(shortName?.test(c)) && TEMPLATE_WORD.test(c)) ||
        (CAME_WITH.test(c) && thing.test(c))
    )
  return {
    /** Whether the line names the template's accent value. */
    value: (line) => Boolean(value?.(line)),
    /** Whether the line names the template's colours in words. */
    colour: (line) =>
      DEFAULT_WORDS.test(line) ||
      inClauses(line, {
        words: COLOUR_WORDS,
        fullName: fullColour,
        shortName: shortColour,
        thing: COLOUR_WORD
      }),
    /** Whether the line names the template's logo. */
    logo: (line) =>
      inClauses(line, { words: LOGO_WORDS, fullName: fullLogo, shortName: shortLogo, thing: LOGO_WORD })
  }
}
