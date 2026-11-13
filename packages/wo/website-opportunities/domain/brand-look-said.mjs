// Whether a line of a plan names the template's look (ticket #616, review 13/11). Two checks:
//   - the template's accent VALUE, in any form it is written: `#rrggbb` or `rrggbb` in any case, `rgb()` or `rgba()`.
//     This holds in every language a line is written in;
//   - the template's WORDS: its (or the demo's) accent, colours, palette or logo, "default colours / palette / accent",
//     and the template's own name followed by "logo" or "colours". These are English words only: a line the model
//     writes in another language is held by the value check alone. "page template" stays a legitimate phrase. Pure.
import { hexOf } from './brand-hue.mjs'

const OF_TEMPLATE = String.raw`(?:templates?|demo)(?:'s|’s)?`
const LOOK_WORDS = (things) =>
  new RegExp(
    String.raw`\b${OF_TEMPLATE}\s+(?:default\s+)?(?:${things})\b|\b(?:${things})\s+of\s+the\s+(?:template|demo)\b`,
    'i'
  )
const COLOUR_WORDS = LOOK_WORDS('accent|colou?rs?|palette')
const DEFAULT_WORDS = /\bdefault\s+(?:accent|colou?rs?|palette)\b/i
const LOGO_WORDS = LOOK_WORDS('logos?')
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The forms of the template's accent value a line may carry: hex with or without `#`, `rgb()` and `rgba()`. */
function valueOf(accent) {
  const hex = hexOf(accent)
  if (!hex) return null
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
  return new RegExp(
    String.raw`(?:^|[^0-9a-z])#?${hex.slice(1)}(?![0-9a-z])|\brgba?\(\s*${r}\s*,\s*${g}\s*,\s*${b}\s*[,)]`,
    'i'
  )
}

/**
 * The checks of one template: `logo(line)` and `colour(line)` say whether a line names its logo or its colour.
 * @param {{name?: string, slug?: string, accent?: string}} template
 */
export function templateLookWordsOf(template) {
  const value = valueOf(template?.accent)
  const names = [template?.name, template?.slug].filter((n) => typeof n === 'string' && n.trim() !== '')
  const named = (things) =>
    names.length
      ? new RegExp(String.raw`\b(?:${names.map((n) => escape(n.trim())).join('|')})\s+(?:${things})\b`, 'i')
      : null
  const nameLogo = named('logos?')
  const nameColour = named('colou?rs?|palette|accent')
  return {
    /** Whether the line names the template's accent value. */
    value: (line) => Boolean(value?.test(line)),
    /** Whether the line names the template's colours in words. */
    colour: (line) => COLOUR_WORDS.test(line) || DEFAULT_WORDS.test(line) || Boolean(nameColour?.test(line)),
    /** Whether the line names the template's logo. */
    logo: (line) => LOGO_WORDS.test(line) || Boolean(nameLogo?.test(line))
  }
}
