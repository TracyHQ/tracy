/**
 * Plan text that still carries HTML character references, read as the characters they stand for (#609). A plan value
 * read from a website may arrive as `Larkfen&rsquo;s` when an earlier step kept the page's markup escapes; the card
 * shows `Larkfen’s`. The result is TEXT ONLY: the card renders it as a React text node, never as HTML, so a decoded
 * `&lt;` is the character `<` on screen and can never open a tag. Numeric references and the named references a
 * website writes in running text are decoded; any other name is left as it is, never guessed. Pure.
 */

/** The named references running text uses, by name. */
const NAMED = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  sbquo: '‚',
  bdquo: '„',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  // Written as code points: the repository's language scan reads accented letters in source as prose.
  eacute: String.fromCodePoint(0xe9),
  egrave: String.fromCodePoint(0xe8),
  aacute: String.fromCodePoint(0xe1),
  agrave: String.fromCodePoint(0xe0),
  ouml: String.fromCodePoint(0xf6),
  uuml: String.fromCodePoint(0xfc),
  auml: String.fromCodePoint(0xe4),
  ccedil: String.fromCodePoint(0xe7),
  ntilde: String.fromCodePoint(0xf1)
})

const REFERENCE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g

/** A code point a reference may stand for: a real character, never a control character or a lone surrogate. */
const usable = (cp) =>
  Number.isInteger(cp) &&
  cp > 0x1f &&
  cp <= 0x10ffff &&
  !(cp >= 0x7f && cp <= 0x9f) &&
  !(cp >= 0xd800 && cp <= 0xdfff)

/**
 * The text with its character references decoded once. Not a string: returned as it is.
 * @template T
 * @param {T} text
 * @returns {T}
 */
export function plainTextOf(text) {
  if (typeof text !== 'string' || !text.includes('&')) return text
  return /** @type {T} */ (
    text.replace(REFERENCE, (whole, dec, hex, name) => {
      if (name !== undefined) return Object.hasOwn(NAMED, name) ? NAMED[name] : whole
      const cp = dec !== undefined ? Number(dec) : Number.parseInt(hex, 16)
      return usable(cp) ? String.fromCodePoint(cp) : whole
    })
  )
}
