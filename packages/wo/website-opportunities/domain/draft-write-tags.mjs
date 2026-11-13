// The tags and content map markers of a written value, read by a small tokenizer the way a browser reads a start tag
// (ticket #597): a tag name runs to white space, `/` or `>`; an attribute name to white space, `/`, `=` or `>`; a value
// is double quoted, single quoted (a `>` inside it is part of the value) or unquoted (to white space or the end of the
// tag); entities are read in values, never in names. A marker is read where the template's converter reads one
// (`((`, an optional `/`, a letter, then no parenthesis up to the first `))`: `fromMarkers` of the quickstart scripts
// and of the memory site), its attributes by the same attribute reader.
//
// What the reader does not try to read, it reports, and every caller refuses it: a comment and every other `<!`, `<?`
// or `</`-not-a-letter form (`bogus`); a `((` and a letter no marker closes (`strays`); a tag or a marker the value
// leaves open, a quote left open (`unclosed`). A bare `((` or `))` that is no marker (`Open (weekdays (9 to 5))`,
// `((:`) is words: the converter leaves it as it is. The order check (`write-order-check-entries.mjs`) and the write
// guard (`draft-write-markup.mjs`) both read tags here, so they never disagree on what a value holds. Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r'
const isLetter = (c) => /^[a-zA-Z]$/.test(c ?? '')
/** The start of a marker the converter reads: `((`, an optional `/`, a letter. */
export const MARKER_START = /\(\(\/?[a-zA-Z]/
/** A whole marker as the converter reads it. */
const MARKER = /\(\((\/?)([a-zA-Z][^\s/()]*)([^()]*?)\)\)/y

/**
 * The attributes of `text` from `at` to its end or to the first `>` outside quotes (`form: 'tag'`):
 * `{attrs, end, closed, quoteOpen}`. Each attribute is `{name, value, raw}`: the name in lower case, the
 * value with its entities read, the raw value as written.
 */
function readAttrs(text, at, form) {
  const attrs = []
  let i = at
  const ends = () => form === 'tag' && text[i] === '>'
  while (i < text.length) {
    while (i < text.length && (isSpace(text[i]) || text[i] === '/')) i++
    if (i >= text.length) break
    if (ends()) return { attrs, end: i + 1, closed: true, quoteOpen: false }
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
        if (close === -1) {
          attrs.push({
            name: name.toLowerCase(),
            value: decodeEntities(text.slice(i + 1)),
            raw: text.slice(i + 1)
          })
          return { attrs, end: text.length, closed: false, quoteOpen: true }
        }
        raw = text.slice(i + 1, close)
        i = close + 1
      } else while (i < text.length && !isSpace(text[i]) && !ends()) raw += text[i++]
    }
    attrs.push({ name: name.toLowerCase(), value: decodeEntities(raw), raw })
  }
  return { attrs, end: text.length, closed: form === 'marker', quoteOpen: false }
}

/** A tag at `i` (`<` then a letter, or `</` then a letter), or null. */
function tagAt(text, i) {
  const close = text[i + 1] === '/'
  const n = close ? i + 2 : i + 1
  if (!isLetter(text[n])) return null
  let j = n
  while (j < text.length && !isSpace(text[j]) && text[j] !== '/' && text[j] !== '>') j++
  const read = readAttrs(text, j, 'tag')
  return { name: text.slice(n, j).toLowerCase(), close, form: 'tag', start: i, ...read }
}

/** A marker at `i` as the converter reads it, or null. */
function markerAt(text, i) {
  MARKER.lastIndex = i
  const m = MARKER.exec(text)
  if (!m) return null
  const read = readAttrs(m[3], 0, 'marker')
  return {
    name: m[2].toLowerCase(),
    close: m[1] === '/',
    form: 'marker',
    start: i,
    ...read,
    end: i + m[0].length,
    closed: !read.quoteOpen
  }
}

/**
 * Every tag and marker of a value, in order: `{name, close, attrs, form: 'tag' | 'marker', closed, quoteOpen, start,
 * end}`; `bogus`: the `<!`, `<?` and `</`-not-a-letter forms (a comment, a doctype); `strays`: the
 * `((` and a letter no marker reads; `unclosed`: the tags and markers left open or with a quote left open.
 * @returns {{tags: object[], bogus: number, strays: number, unclosed: number}}
 */
export function readTags(value) {
  const text = String(value ?? '')
  const tags = []
  let bogus = 0
  let strays = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === '<') {
      const tag = tagAt(text, i)
      if (tag) {
        tags.push(tag)
        i = tag.end
        continue
      }
      if (text[i + 1] === '!' || text[i + 1] === '?' || text[i + 1] === '/') bogus += 1
      i += 1
      continue
    }
    if (text.startsWith('((', i)) {
      const marker = markerAt(text, i)
      if (marker) {
        tags.push(marker)
        i = marker.end
        continue
      }
      if (MARKER_START.test(text.slice(i, i + 4))) strays += 1
      i += 1
      continue
    }
    i += 1
  }
  const unclosed = tags.filter((t) => !t.closed || t.quoteOpen).length
  return { tags, bogus, strays, unclosed }
}

/** Elements that hold nothing: never closed. */
const VOID = new Set([
  'br',
  'hr',
  'img',
  'wbr',
  'input',
  'area',
  'col',
  'embed',
  'link',
  'meta',
  'source',
  'track',
  'param',
  'base'
])

/**
 * Whether the tags of a value nest and close: every element opened is closed in order, every closing tag closes the
 * element last opened, in each form apart (tags, markers), every tag and quote closed. A void element (`br`, `((br/))`)
 * opens nothing; a `/` before the end of any other (`<span/>`) does not close it, as a browser reads it.
 */
export function balanced(read) {
  if (read.unclosed > 0) return false
  for (const form of ['tag', 'marker']) {
    const open = []
    for (const t of read.tags.filter((x) => x.form === form)) {
      if (VOID.has(t.name)) continue
      if (!t.close) open.push(t.name)
      else if (open.pop() !== t.name) return false
    }
    if (open.length) return false
  }
  return true
}

/** The attributes of an attribute text (`class="a" title='b'`), read as a tag's: `[[name, value]]`. */
export function attrsOf(text) {
  return readAttrs(`${String(text ?? '')}>`, 0, 'tag').attrs.map((a) => [a.name, a.value])
}
