// The tags and content map markers of a written value, read by a small tokenizer the way a browser reads a start tag
// (ticket #597): a tag name runs to white space, `/` or `>`; an attribute name to white space, `/`, `=` or `>`; a value
// is double quoted, single quoted (a `>` or a `)` inside it is part of the value) or unquoted (to white space or the
// end of the tag); entities are read in values, never in names. A marker (`((span class="a"))`, which the template
// turns into the same tag) is read by the same attribute reader, ending at `))` outside quotes. A tag the value never
// closes (`<img src=x onerror=f() `) is still a tag: the page around the value closes it. Comments and other `<!`,
// `<?` or `</` forms are listed apart (`bogus`), and the tokenizer reads on inside them, so a tag a comment seems to
// hide is still found. The order check (`write-order-check-entries.mjs`) and the write guard (`draft-write-markup.mjs`)
// both read tags here, so they never disagree on what a value holds. Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r'
const isLetter = (c) => /^[a-zA-Z]$/.test(c ?? '')

/**
 * The attributes from `at` to the end of a tag (`>`) or a marker (`))`): `{attrs, end, closed}`, `end` the index
 * after the end, `closed` false when the value ends first. Each attribute is `{name, value, raw}`: the name in lower
 * case, the value with its entities read, the raw value as written.
 */
function readAttrs(text, at, form) {
  const attrs = []
  let i = at
  const ends = () => (form === 'tag' ? text[i] === '>' : text.startsWith('))', i))
  const stop = form === 'tag' ? 1 : 2
  while (i < text.length) {
    while (i < text.length && (isSpace(text[i]) || text[i] === '/')) i++
    if (i >= text.length) break
    if (ends()) return { attrs, end: i + stop, closed: true }
    let name = text[i++]
    while (i < text.length && !isSpace(text[i]) && text[i] !== '/' && text[i] !== '=' && !ends())
      name += text[i++]
    let j = i
    while (j < text.length && isSpace(text[j])) j++
    let raw = ''
    if (text[j] === '=') {
      i = j + 1
      while (i < text.length && isSpace(text[i])) i++
      const quote = text[i]
      if (quote === '"' || quote === "'") {
        const close = text.indexOf(quote, i + 1)
        raw = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close)
        i = close === -1 ? text.length : close + 1
      } else while (i < text.length && !isSpace(text[i]) && !ends()) raw += text[i++]
    }
    attrs.push({ name: name.toLowerCase(), value: decodeEntities(raw), raw })
  }
  return { attrs, end: text.length, closed: false }
}

/**
 * Every tag and marker of a value, in order: `{name, close, attrs, form: 'tag' | 'marker', closed, start, end}`;
 * `bogus`: the `<!`, `<?` and `</`-not-a-letter forms (a comment, a doctype); `strays`: how many `((` and `))` no
 * marker consumed (a marker the reader cannot read is never let through as words).
 * @returns {{tags: object[], bogus: number, strays: number}}
 */
export function readTags(value) {
  const text = String(value ?? '')
  const tags = []
  let bogus = 0
  let strays = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === '<') {
      const close = text[i + 1] === '/'
      const n = close ? i + 2 : i + 1
      if (isLetter(text[n])) {
        let j = n
        while (j < text.length && !isSpace(text[j]) && text[j] !== '/' && text[j] !== '>') j++
        const read = readAttrs(text, j, 'tag')
        tags.push({ name: text.slice(n, j).toLowerCase(), close, form: 'tag', start: i, ...read })
        i = read.end
        continue
      }
      if (text[i + 1] === '!' || text[i + 1] === '?' || close) bogus += 1
      i += 1
      continue
    }
    if (text.startsWith('((', i)) {
      const close = text[i + 2] === '/'
      const n = close ? i + 3 : i + 2
      let j = n
      while (/^[a-zA-Z0-9]$/.test(text[j] ?? '')) j++
      // A marker name is letters and digits; what follows is white space, `/` or `))`.
      if (isLetter(text[n]) && (isSpace(text[j]) || text[j] === '/' || text.startsWith('))', j))) {
        const read = readAttrs(text, j, 'marker')
        tags.push({ name: text.slice(n, j).toLowerCase(), close, form: 'marker', start: i, ...read })
        if (!read.closed) strays += 1
        i = read.end
        continue
      }
      strays += 1
      i += 2
      continue
    }
    if (text.startsWith('))', i)) {
      strays += 1
      i += 2
      continue
    }
    i += 1
  }
  return { tags, bogus, strays }
}

/** The attributes of an attribute text (`class="a" title='b'`), read as a tag's: `[[name, value]]`. */
export function attrsOf(text) {
  return readAttrs(`${String(text ?? '')}>`, 0, 'tag').attrs.map((a) => [a.name, a.value])
}
