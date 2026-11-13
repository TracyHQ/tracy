// The length the Claude Cowork plugin's door compares a blank site contract slot's `maxCharacters` with (ticket #597),
// computed the way its PHP computes it (`SlotFit::slotLength` and `SlotFit::seenLength`), step for step:
//
//   1. tags and markers out: an inline tag or marker (`span`, `strong`, ... `code`) is nothing, any other one is a
//      space. The PHP patterns have no `/u` flag, so their `\s` is ASCII white space only: a tag with a no-break space
//      after its name is not a tag there, and stays as words.
//   2. `html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')`: a reference is read only with its semicolon; a name
//      only from the HTML5 list (`draft-write-entity-table.mjs`), case sensitive; a number only when HTML5 allows the
//      character (not NUL, CR, DEL, a C1 control, a surrogate or a noncharacter, nothing past U+10FFFF). Anything else
//      stays as it is written.
//   3. every run of white space and no-break space is one space: that pattern has `/u`, so its `\s` is Unicode's (an em
//      space, an ideographic space, a next line), plus U+180E, as PCRE reads it.
//   4. PHP's `trim` (space, tab, LF, CR, NUL, vertical tab only: a byte order mark stays), then `mb_strlen`: code points.
//
// A text slot stored in a fixed width column, a link or a picture path counts its raw string in code points. Checked
// against the plugin's PHP on a generated corpus (`test/fixtures/draft-write-door-length.json`). Pure.
import { NAMED_REFERENCES } from './draft-write-entity-table.mjs'

const INLINE = '(?:span|strong|em|b|i|u|s|small|mark|sup|sub|a|abbr|code)'
/** PCRE's `\s` without `/u`: ASCII white space, vertical tab included. */
const S = '[\\t\\n\\v\\f\\r ]'
const INLINE_TAG = new RegExp(
  `<${S}*/?${S}*${INLINE}(?:${S}[^<>]*)?/?${S}*>|\\(\\(/?${INLINE}(?:${S}[^()]*)?/?\\)\\)`,
  'gi'
)
const OTHER_TAG = new RegExp(
  `<${S}*/?${S}*[a-z][a-z0-9-]*(?:${S}[^<>]*)?/?${S}*>|\\(\\(/?[a-z][a-z0-9]*(?:${S}[^()]*)?/?\\)\\)`,
  'gi'
)
/** PCRE's `[\s\x{00A0}]` with `/u` (Unicode white space, as PCRE reads `\s`, `\h` and `\v`). */
const UNICODE_SPACES = /[\t\n\v\f\r \u0085\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g
/** PHP's `trim` without a character list. */
// oxlint-disable-next-line no-control-regex -- PHP's trim strips NUL and the vertical tab
const PHP_TRIM = /^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g

/** Whether PHP's HTML5 decoding turns a numeric reference into its character. */
function allowed(cp) {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0c) return true
  if (cp >= 0x20 && cp <= 0x7e) return true
  if (cp >= 0xa0 && cp <= 0xd7ff) return true
  return cp >= 0xe000 && cp <= 0x10ffff && (cp & 0xffff) < 0xfffe && (cp < 0xfdd0 || cp > 0xfdef)
}

/** `html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8')`. */
export function phpEntityDecode(text) {
  return String(text).replace(
    /&(?:#[xX]([0-9a-fA-F]+);|#([0-9]+);|([a-zA-Z0-9]+);)/g,
    (m, hex, dec, name) => {
      if (name !== undefined) return NAMED_REFERENCES.get(name) ?? m
      const digits = hex ?? dec
      // Past U+10FFFF whatever the leading zeros: refused as PHP refuses an overflow.
      const cp = Number.parseInt(digits, hex !== undefined ? 16 : 10)
      return Number.isSafeInteger(cp) && allowed(cp) ? String.fromCodePoint(cp) : m
    }
  )
}

/** What the plugin's `SlotFit::seenLength` counts of a value. */
export function seenLength(value) {
  const words = String(value ?? '')
    .replace(INLINE_TAG, '')
    .replace(OTHER_TAG, ' ')
  return [...phpEntityDecode(words).replace(UNICODE_SPACES, ' ').replace(PHP_TRIM, '')].length
}

/** Columns of a fixed width that store a text slot's raw string (the plugin's `FIXED_WIDTH_COLUMNS`). */
export const FIXED_WIDTH_COLUMNS = Object.freeze([
  'title',
  'name',
  'alias',
  'label',
  'con_position',
  'telephone',
  'mobile',
  'email_to'
])

/** The length the plugin compares a blank site contract slot's `maxCharacters` with (`SlotFit::slotLength`). */
export function doorLength(slot, value) {
  const raw = String(value ?? '')
  if (slot?.type !== 'text' || typeof slot.column !== 'string' || FIXED_WIDTH_COLUMNS.includes(slot.column))
    return [...raw].length
  return seenLength(raw)
}
