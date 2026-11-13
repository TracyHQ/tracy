// The one unit of every text limit of the build (ticket #597): what a visitor reads, counted as the Claude Cowork
// plugin's door counts it (`SlotFit::seenLength`, `SlotFit::slotLength` of the plugin, `mb_strlen` over UTF-8):
//
//   visible text   an inline tag or marker that only styles words (`span`, `strong`, `em`, `b`, `i`, `u`, `s`,
//                  `small`, `mark`, `sup`, `sub`, `a`, `abbr`, `code`) is nothing, any other tag or marker (`br`, `p`)
//                  is one space, every entity is the one character it shows, every run of white space (no-break
//                  space included) is one space, no space at either end; then normalised to NFC, so a letter and its
//                  combining accent count once, as they show.
//   visibleLength  the visible text in code points: an emoji is one, a flag (two regional indicators) is two.
//   doorLength     what the plugin compares a slot's `maxCharacters` with, computed as its PHP computes it
//                  (`draft-write-door-length.mjs`): close to the visible length for a text slot, but with PHP's own
//                  tag patterns, entity table, white space and trim; the raw value in code points for a text slot
//                  stored in a fixed width column (title, name, alias, ...), a link or a picture path.
//
// Code points, not grapheme clusters: a family emoji or a flag shows as one glyph and would be one grapheme
// (`Intl.Segmenter`), but the door counts code points, and the kit's limits were measured in them; counting graphemes
// would let a value through that the door then refuses. The writer check, the order check, the plan limits and the
// write guard all count with `visibleLength` (`charCount` of `page-copy-check.mjs` is this function). Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const INLINE = '(?:span|strong|em|b|i|u|s|small|mark|sup|sub|a|abbr|code)'
const INLINE_TAG = new RegExp(
  `<\\s*/?\\s*${INLINE}(?:\\s[^<>]*)?/?\\s*>|\\(\\(/?${INLINE}(?:\\s[^()]*)?/?\\)\\)`,
  'gi'
)
const OTHER_TAG = /<\s*\/?\s*[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?\s*>|\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)/gi
/**
 * The white space a visitor reads as one space: the ASCII white space a browser folds, and the no-break space, as the
 * kit's limits were measured. The door folds more (Unicode white space): `doorLength` counts that apart.
 */
const SPACES = /[\t\n\v\f\r \u00a0]+/g

function seen(value) {
  const words = String(value ?? '')
    .replace(INLINE_TAG, '')
    .replace(OTHER_TAG, ' ')
  return decodeEntities(words).replace(SPACES, ' ').trim()
}
const codePoints = (text) => [...text].length

/** The text a visitor reads of a value (see the head of this file). */
export const visibleTextOf = (value) => seen(value).normalize('NFC')

/** How many characters a visitor reads: the unit of every text limit. */
export const visibleLength = (value) => codePoints(visibleTextOf(value))

export { doorLength, FIXED_WIDTH_COLUMNS } from './draft-write-door-length.mjs'

const nfc = (v) => (typeof v === 'string' ? v.normalize('NFC') : v)
/**
 * The operations of a write plan with every text they send in NFC (values, alt texts, record columns, HTML), so the
 * door counts a letter and its accent once, as the visitor and every check of the build count it.
 */
export function inNfc(ops) {
  for (const op of ops) {
    for (const v of Array.isArray(op.values) ? op.values : []) v.value = nfc(v.value)
    if (op.alt) op.alt = nfc(op.alt)
    if (typeof op.html === 'string') op.html = nfc(op.html)
    if (op.fields) for (const [k, v] of Object.entries(op.fields)) op.fields[k] = nfc(v)
  }
  return ops
}
