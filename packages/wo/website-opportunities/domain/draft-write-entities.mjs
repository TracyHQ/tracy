// The words a value shows, read the way a browser reads them (ticket #597): every numeric character reference
// (decimal and hex, with or without its semicolon) and every HTML5 name (`draft-write-entity-table.mjs`), so a held
// name or a `javascript:` address cannot hide behind `&#39;`, `&euml;`, `&colon;` or `&Tab;`. A made up letter name
// with an accent (`&qacute;`) is read as that letter and accent too, so a held name matches in it whatever a browser
// shows. Any other unknown name stays as it is, as a browser shows it. Pure.
import { LEGACY_REFERENCES, NAMED_REFERENCES } from './draft-write-entity-table.mjs'

/** The combining mark of each accent name of HTML's letter entities (`eacute`, `Ouml`, `ccedil`, `scaron`). */
const ACCENTS = {
  acute: '\u0301',
  grave: '\u0300',
  circ: '\u0302',
  uml: '\u0308',
  tilde: '\u0303',
  ring: '\u030a',
  cedil: '\u0327',
  caron: '\u030c',
  macr: '\u0304',
  ogon: '\u0328',
  dot: '\u0307',
  breve: '\u0306',
  dblac: '\u030b'
}

function named(name) {
  if (NAMED_REFERENCES.has(name)) return NAMED_REFERENCES.get(name)
  const letter = /^([a-zA-Z])([a-z]+)$/.exec(name)
  if (letter && Object.hasOwn(ACCENTS, letter[2])) return (letter[1] + ACCENTS[letter[2]]).normalize('NFC')
  return null
}

function codePoint(n) {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\ufffd'
  return String.fromCodePoint(n)
}

/**
 * A text with every character reference read, as a browser reads it: every HTML5 name (`draft-write-entity-table.mjs`),
 * a legacy name or a number without its semicolon too. The plugin's own reading (semicolon only, PHP's rules) is
 * `phpEntityDecode` of `draft-write-door-length.mjs`.
 */
export function decodeEntities(text) {
  return String(text).replace(
    /&(?:#[xX]([0-9a-fA-F]+)(;?)|#(\d+)(;?)|([a-zA-Z][a-zA-Z0-9]*)(;?))/g,
    (m, hex, hexSemi, dec, decSemi, name, semi) => {
      if (hex !== undefined) return codePoint(Number.parseInt(hex, 16))
      if (dec !== undefined) return codePoint(Number(dec))
      if (
        !semi &&
        !LEGACY_REFERENCES.has(name) &&
        !/^[a-zA-Z](acute|grave|circ|uml|tilde|ring|cedil)$/.test(name)
      )
        return m
      return named(name) ?? m
    }
  )
}

const ZERO_WIDTH = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u180e]/g
const TAG = /<\/?[a-zA-Z][^>]*>/g
const MARKER = /\(\(\/?[a-zA-Z][a-zA-Z0-9]*[^)]*\)\)/g

/**
 * A text as a person reads it, for matching held names: tags and markers taken out (`joined: true`) or read as a
 * space, every reference read, accents and zero width characters taken out, white space as one space.
 */
export function plainOf(text, { joined = false } = {}) {
  const gap = joined ? '' : ' '
  return decodeEntities(String(text).replace(TAG, gap).replace(MARKER, gap))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim()
}
