// The words a value shows, read the way a browser reads them (ticket #597): every numeric character reference
// (decimal and hex, with or without its semicolon) and the named ones a value may plausibly carry, so a held name or a
// `javascript:` address cannot hide behind `&#39;`, `&euml;`, `&colon;` or `&Tab;`. A letter with an accent is
// decoded from its name (`euml` is `e` with a diaeresis), the rest from a table. A name the table does not know stays
// as it is, as a browser shows an unknown one. Pure.

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200c',
  zwj: '\u200d',
  lrm: '\u200e',
  rlm: '\u200f',
  shy: '\u00ad',
  Tab: '\t',
  NewLine: '\n',
  colon: ':',
  semi: ';',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  lsqb: '[',
  rsqb: ']',
  lbrack: '[',
  rbrack: ']',
  lcub: '{',
  rcub: '}',
  lbrace: '{',
  rbrace: '}',
  period: '.',
  comma: ',',
  excl: '!',
  quest: '?',
  num: '#',
  dollar: '$',
  percnt: '%',
  ast: '*',
  plus: '+',
  equals: '=',
  lowbar: '_',
  grave: '`',
  verbar: '|',
  vert: '|',
  commat: '@',
  Hat: '^',
  hyphen: '\u2010',
  dash: '\u2010',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201a',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bdquo: '\u201e',
  laquo: '\u00ab',
  raquo: '\u00bb',
  lsaquo: '\u2039',
  rsaquo: '\u203a',
  hellip: '\u2026',
  middot: '\u00b7',
  bull: '\u2022',
  prime: '\u2032',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  deg: '\u00b0',
  times: '\u00d7',
  divide: '\u00f7',
  szlig: '\u00df',
  aelig: '\u00e6',
  AElig: '\u00c6',
  oelig: '\u0153',
  OElig: '\u0152',
  oslash: '\u00f8',
  Oslash: '\u00d8',
  eth: '\u00f0',
  ETH: '\u00d0',
  thorn: '\u00fe',
  THORN: '\u00de',
  dstrok: '\u0111',
  Dstrok: '\u0110',
  lstrok: '\u0142',
  Lstrok: '\u0141',
  iexcl: '\u00a1',
  iquest: '\u00bf'
}
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
/** The names a browser also reads without their semicolon (the legacy ones). */
const LEGACY = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg'])

function named(name) {
  if (Object.hasOwn(NAMED, name)) return NAMED[name]
  const letter = /^([a-zA-Z])([a-z]+)$/.exec(name)
  if (letter && Object.hasOwn(ACCENTS, letter[2])) return (letter[1] + ACCENTS[letter[2]]).normalize('NFC')
  return null
}

function codePoint(n) {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\ufffd'
  return String.fromCodePoint(n)
}

/**
 * A text with every character reference read, as a browser reads it (a legacy name or a number without its
 * semicolon too). `strict`: only references closed by their semicolon, as the plugin's `html_entity_decode` reads
 * them (`draft-write-length.mjs doorLength`).
 */
export function decodeEntities(text, { strict = false } = {}) {
  return String(text).replace(
    /&(?:#[xX]([0-9a-fA-F]+)(;?)|#(\d+)(;?)|([a-zA-Z][a-zA-Z0-9]*)(;?))/g,
    (m, hex, hexSemi, dec, decSemi, name, semi) => {
      if (strict && !(hexSemi || decSemi || semi)) return m
      if (hex !== undefined) return codePoint(Number.parseInt(hex, 16))
      if (dec !== undefined) return codePoint(Number(dec))
      if (!semi && !LEGACY.has(name) && !/^[a-zA-Z](acute|grave|circ|uml|tilde|ring|cedil)$/.test(name))
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
