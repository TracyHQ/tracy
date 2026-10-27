// typeset.mjs — the line breaks a page must not make, written into the text as no-break spaces.
//
// A design export writes copy as plain words with plain spaces, and at a width the canvas never
// drew the browser breaks wherever it likes: "October" at the end of one line and "2026." alone
// on the next, a service card ending in a line that reads "45 m.", a footer whose middle dot
// hangs at the end of a line ("OGRN 10440xxxxxxxx ·"), "SRO admission" with its "No. 214" on the
// line below, "2024–" / "2026" split at the dash. None of these is a CSS matter — `text-wrap:
// pretty` helps the last line of a paragraph and nothing else — so the seeder binds the pairs a
// typographer would bind, in every locale the site carries, before the content goes in:
//
//   day month year            28 Jul 2026 · 12 августа 2026 · October 2026
//   number + unit             45 m. · 1.2M m² · 500 tonnes · 110 kV · 1,2 млрд ₽ · 62 га
//   preposition + number      up to 45 · over 380 · до 45 · более 380
//   label No. number          SRO admission No. 214 · № 214
//   title + year              Capability statement 2026 · Презентация компетенций, 2026
//   digit groups              500 000 (a thousands space)
//   place + qualifier         Kaluga Region · Калужская область · Borovsk District
//   currency + amount         RUB 1.2bn · $ 4
//   the middle dot            a · b  (both sides: the dot never starts or ends a line)
//   a year range              2024–2026 (HTML mode: a no-wrap span — U+2011 would change the glyph)
//
// `typeset(markup)` walks block markup: it skips block comments (`<!-- wp:… -->`), every tag and
// attribute, and the inside of <script>, <style>, <pre>, <code>, <textarea> and <svg>; only text
// between tags is touched. `typeset(text, { mode: 'text' })` is for a plain field (an excerpt).
// Idempotent: every rule matches a plain space, and a bound pair has none; the range span is
// not re-wrapped. Whitespace-normalising comparisons (`\s+` → ' ', in JS `\s` takes U+00A0)
// read the result as the source — content parity does not move.
export const NBSP = '\u00A0'

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?' +
  '|янв(?:аря|арь)?|фев(?:раля|раль)?|мар(?:та|т)?|апр(?:еля|ель)?|ма[йя]|июн[ья]?|июл[ья]?|авг(?:уста|уст)?|сен(?:тября|тябрь|т)?|окт(?:ября|ябрь)?|ноя(?:бря|брь)?|дек(?:абря|абрь)?)'
const UNIT =
  '(?:mm|cm|m|km|m²|m³|ha|kg|t|tonnes?|kW|MW|GW|kV|MVA|kWh|MWh|h|hrs|min|s|bn|mn|%' +
  '|мм|см|м|км|м²|м³|га|кг|т|кВт|МВт|кВ|ч|мин|млн|млрд|тыс\\.?|руб\\.?|₽)'
const NUMBER = '\\d[\\d.,]*(?:[kKMB]|bn|mn)?'
const PREPOSITION = '(?:up to|to|from|over|under|about|around|nearly|almost|до|от|свыше|около|более|менее|почти)'
const QUALIFIER = '(?:Region|Oblast|District|Province|область|обл\\.|район|край)'
const CURRENCY = '(?:RUB|USD|EUR|GBP|₽|\\$|€|£)'

// A word boundary that knows Cyrillic: `\b` in JavaScript is ASCII-only, whatever the flags.
const L = '(?<!\\p{L})'
const R = '(?!\\p{L})'

const RULES = [
  // 28 Jul 2026 · 12 августа 2026 (the day to the month, the month to the year)
  [new RegExp(`${L}(\\d{1,2}) (${MONTH}\\.?)${R}`, 'gu'), `$1${NBSP}$2`],
  [new RegExp(`${L}(${MONTH}\\.?) (\\d{4})(?!\\d)`, 'gu'), `$1${NBSP}$2`],
  // 500 000 (a thousands space, as Russian prints numbers)
  [/(?<![\d.,])(\d{1,3}) (\d{3})(?![\d])/g, `$1${NBSP}$2`],
  // 45 m. · 1.2M m² · 62 га (the number to its unit)
  [new RegExp(`(?<![\\p{L}\\d.,])(${NUMBER}) (${UNIT})(?![\\p{L}\\d])`, 'gu'), `$1${NBSP}$2`],
  // up to 45 · до 45 (the preposition to its number)
  [new RegExp(`${L}(${PREPOSITION}) (\\d)`, 'giu'), (m, p, d) => `${p.replace(/ /g, NBSP)}${NBSP}${d}`],
  // SRO admission No. 214 · № 214 (the number to its "No.", and "No." to its label)
  [/(?<![\p{L}\d])(No\.|№) (\d)/gu, `$1${NBSP}$2`],
  [new RegExp(`(\\p{L}+) (No\\.|№)(?=${NBSP}\\d)`, 'gu'), `$1${NBSP}$2`],
  // 1,2 млрд ₽ (a multiplier word to the currency after it)
  [new RegExp(`(млн|млрд|тыс\\.?) (₽|руб\\.?)${R}`, 'gu'), `$1${NBSP}$2`],
  // RUB 1.2bn · $ 4
  [new RegExp(`${L}(${CURRENCY}) (\\d)`, 'gu'), `$1${NBSP}$2`],
  // Capability statement 2026 · Презентация компетенций, 2026 (a year at the end of a title, or
  // after a comma, stays with the word before it; a year is never a line of its own)
  [/(\p{L}{2,},?) (\d{4})(?![\d\p{L}])/gu, `$1${NBSP}$2`],
  // Kaluga Region · Калужская область
  [new RegExp(`(\\p{L}+) (${QUALIFIER})${R}`, 'gu'), `$1${NBSP}$2`],
  // a · b — the dot stays with both neighbours; a line never begins or ends with it
  [/(\S) · (\S)/g, `$1${NBSP}·${NBSP}$2`]
]

const RANGE = /(?<!\d)(\d{4})([–-])(\d{4})(?!\d)/g
const NOWRAP_OPEN = '<span style="white-space:nowrap">'

function typesetText(text, { ranges = false } = {}) {
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to)
  if (ranges) out = out.replace(RANGE, `${NOWRAP_OPEN}$1$2$3</span>`)
  return out
}

// Tags whose text is not prose.
const VERBATIM = /^<(script|style|pre|code|textarea|svg)\b/i
const TOKEN = /<!--[\s\S]*?-->|<[^>]+>/g

/**
 * Bind the pairs a line must not break between. `mode: 'html'` (default) walks markup and
 * touches text between tags only; `mode: 'text'` treats the whole string as one text run (no
 * range span — a plain field cannot carry a tag).
 */
export function typeset(markup, { mode = 'html' } = {}) {
  const s = String(markup ?? '')
  if (!s) return s
  if (mode === 'text') return typesetText(s)
  let out = ''
  let last = 0
  let verbatim = null // the tag name whose closing tag ends a verbatim run
  let prev = '' // the previous tag, to leave an already wrapped range alone
  for (const m of s.matchAll(TOKEN)) {
    const text = s.slice(last, m.index)
    if (text) out += verbatim ? text : typesetText(text, { ranges: prev !== NOWRAP_OPEN })
    const tag = m[0]
    if (!tag.startsWith('<!--')) {
      if (verbatim) {
        if (new RegExp(`^</${verbatim}\\s*>`, 'i').test(tag)) verbatim = null
      } else {
        const v = VERBATIM.exec(tag)
        if (v && !tag.endsWith('/>')) verbatim = v[1].toLowerCase()
      }
      prev = tag
    }
    out += tag
    last = m.index + tag.length
  }
  const tail = s.slice(last)
  if (tail) out += verbatim ? tail : typesetText(tail, { ranges: prev !== NOWRAP_OPEN })
  return out
}
