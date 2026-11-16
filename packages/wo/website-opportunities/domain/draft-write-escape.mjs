// How each value of a draft write is made safe at its place (ticket #597, door measurements of plugin 0.24.85 in
// docs/references/ai-quickstart-contract.md, "Escaping of every place the build writes" and "JA ACM markers"). The kind
// of each place is read from the kit's `escapes` declaration (`draft-write-escape-place.mjs`); here each kind is
// written and guarded:
//
//   raw       printed as stored: the words escaped as `htmlspecialchars` with ENT_QUOTES does (`&amp;`, `&lt;`,
//             `&gt;`, `&quot;`, `&#039;`); the declared markers of a codes field are kept
//   html      a whole HTML column: the words escaped, the tags its field declares kept (`inline_html` of `textAt`)
//   piece     an xpath piece of a stored HTML value: the DOM escapes `&`, `<` and `>` but leaves a quote in a text
//             node, so plain words get typographic quotes
//   plain     every print escapes it: the words as they are (typographic quotes where a quote is unsafe); the guard
//             refuses each other mark the place does not show as written
//   neutral   printed raw somewhere, escaped elsewhere, or not declared: the value reads the same either way
//             (typographic quotes; a `<`, a `>` or a text that reads as a character reference is refused)
//   free      no page prints it: written as it is
//   token     no words (an id, a class): written as it is, refused with `<`, `>` or a quote
//   unwritten the kit says the build never writes it: refused
//
// A text that reads as a character reference (`&` then a letter or `#`, legacy names without their semicolon
// included, `escapes.legacyReferences`) is written only where the build escapes the `&` (raw, html). The JA ACM
// converter replaces every `((` and `))` of the whole `jatools-config` string blindly, so a double parenthesis is
// refused at every place (`doubleParenthesisProblems`); only the declared markers of a codes field are kept there.
// Pure.
import { safetyAt } from './draft-write-escape-place.mjs'
import { cleanedAt } from './draft-write-text-clean.mjs'
import { addressAt } from './draft-write-place-kinds.mjs'
import { readTags } from './draft-write-tags.mjs'
import { placesOfOrder } from './write-order-check.mjs'

const RAW_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
/** `htmlspecialchars($text, ENT_QUOTES)`. */
export const escapeRaw = (text) => String(text).replace(/[&<>"']/g, (c) => RAW_ESCAPES[c])

export { safetyAt }

/** The marker names a codes field declares (its wrapper and emphasis parts), or none. */
export function declaredMarkersOf(entry) {
  const inline = entry?.declared?.inline
  if (inline?.write !== 'codes') return new Set()
  return new Set([...(inline.wrapper ?? []), ...(inline.emphasis ?? []).map((p) => p.tag)])
}

/** The value cut into its declared markers (kept) and the words between them. */
function partsOf(value, markers) {
  const parts = []
  let at = 0
  for (const tag of readTags(value).tags) {
    if (tag.form !== 'marker' || !markers.has(tag.name)) continue
    parts.push({ words: value.slice(at, tag.start) }, { marker: value.slice(tag.start, tag.end) })
    at = tag.end
  }
  parts.push({ words: value.slice(at) })
  return parts
}

/** Straight quotes as typographic ones: double quotes open and close in turn, a single quote is an apostrophe. */
export function typographic(text) {
  let open = true
  return String(text)
    .replace(/"/g, () => {
      const mark = open ? '“' : '”'
      open = !open
      return mark
    })
    .replace(/(^|[\s([{])'/g, '$1‘')
    .replace(/'/g, '’')
}

const QUOTES = ['"', "'"]
/**
 * The value written at a place, made safe there.
 * @param {string} value the value as the planner made it (`textAt`)
 * @param {{kind: string, marks?: Set<string>, markers?: Set<string>, address?: boolean, escaped?: boolean}} how
 *   `marks`: what a `plain` place does not show as written; `escaped`: `textAt` already escaped the words
 */
export function safeValue(
  value,
  { kind, marks = new Set(), markers = new Set(), address = false, escaped = false }
) {
  const text = String(value)
  if (kind === 'raw')
    return partsOf(text, markers)
      .map((p) => p.marker ?? escapeRaw(p.words))
      .join('')
  if (kind === 'neutral') return address ? text : typographic(text)
  if (kind === 'plain') return !address && QUOTES.some((q) => marks.has(q)) ? typographic(text) : text
  if (kind === 'piece') return address || /</.test(text) ? text : typographic(text)
  if (kind === 'html' && !escaped && !/</.test(text)) return escapeRaw(text)
  return text
}

/** Text that reads as a character reference: `&` then `#` or a letter (a legacy name needs no semicolon). */
const REFERENCE = /&[#A-Za-z]/
const ESCAPED_ONLY = /&(?!(amp|lt|gt|quot|#0*39|#x0*27);)/
const MARK_TESTS = { '<': /</, '>': />/, '&': /&/, '"': /"/, "'": /'/, reference: REFERENCE }

/**
 * Why a value is not safe at its kind of place, or null: `not_escaped` (raw), `not_escape_neutral` (neutral),
 * `unsafe_mark` (plain: a mark the place does not show as written, or a reference), `not_a_token` (token),
 * `place_not_written` (unwritten).
 */
export function unsafeAt(value, { kind, marks = new Set(), markers = new Set() }) {
  const text = String(value)
  if (kind === 'raw') {
    const words = partsOf(text, markers)
      .map((p) => p.words ?? '')
      .join('')
    return /[<>"']/.test(words) || ESCAPED_ONLY.test(words) ? 'not_escaped' : null
  }
  if (kind === 'neutral') return /[<>"']/.test(text) || REFERENCE.test(text) ? 'not_escape_neutral' : null
  if (kind === 'plain')
    return REFERENCE.test(text) || [...marks].some((m) => MARK_TESTS[m]?.test(text)) ? 'unsafe_mark' : null
  if (kind === 'token') return /[<>"']/.test(text) ? 'not_a_token' : null
  if (kind === 'unwritten') return 'place_not_written'
  return null
}

/**
 * Why a value holds a double parenthesis the converter would turn into a tag, or null: any `((` or `))` outside the
 * declared markers of a codes field (`double_parenthesis`), a declared marker left open or closed out of order
 * (`markers_unbalanced`), or markers whose converted form `runsCodeIn` refuses (`markers_run_code`).
 * @param {string} value
 * @param {Set<string>} markers the marker names the place's field declares (none outside a codes field)
 * @param {(html: string) => string[]} runsCodeIn the guard's reader
 */
export function doubleParenthesisProblem(value, markers, runsCodeIn) {
  const text = String(value)
  if (!/\(\(|\)\)/.test(text)) return null
  const words = partsOf(text, markers)
    .map((p) => p.words ?? '')
    .join(' ')
  if (/\(\(|\)\)/.test(words)) return 'double_parenthesis'
  const converted = text.replaceAll('((', '<').replaceAll('))', '>')
  const rules = runsCodeIn(converted)
  if (rules.includes('markup_unbalanced')) return 'markers_unbalanced'
  return rules.length ? 'markers_run_code' : null
}

/** The order entries by place id: their inline declaration names the markers a codes field keeps. */
export const entriesByPlace = (order) =>
  new Map(placesOfOrder(order).flatMap(({ place }) => (place.fields ?? []).map((e) => [e.place, e])))

/** The created record columns that hold the plan's words (a contact's `title` is its name): cleaned like values. */
const WORDED_COLUMNS = new Set(['title'])

/**
 * Every value and created record column of the operations, made safe at its place (`safeValue`); an address at a
 * neutral place is written as it is (no typographic quotes in an address: the guard refuses a quote there). Before
 * that, every value with an order entry and every worded column of a created record is cleaned (control characters
 * out, plugin codes neutralised: `draft-write-text-clean.mjs`), each change listed in `cleaned`.
 */
export function safeOps(ops, { order, kit, cleaned = [] }) {
  const mapping = kit.mapping
  const entries = entriesByPlace(order)
  for (const op of ops) {
    for (const v of op.values ?? []) {
      if (typeof v.value !== 'string') continue
      const entry = v.entry ? entries.get(v.entry) : null
      const slot = v.loc?.slot ? kit.slots.get(v.loc.slot) : null
      const safety = safetyAt(op, v.loc, { slot, mapping })
      const address = addressAt(v.loc, entry, slot)
      if (v.entry)
        v.value = cleanedAt(
          v.value,
          { op: op.key, entry: v.entry, multiline: safety.kind === 'html', address },
          cleaned
        )
      v.value = safeValue(v.value, {
        ...safety,
        markers: v.loc?.nestedJson ? declaredMarkersOf(entry) : new Set(),
        address,
        escaped: String(v.rule ?? '').includes('inline_html')
      })
    }
    if (op.kind.endsWith('.create') && op.fields)
      for (const [column, text] of Object.entries(op.fields)) {
        if (typeof text !== 'string' || column === 'link') continue
        const words = WORDED_COLUMNS.has(column) ? cleanedAt(text, { op: op.key, column }, cleaned) : text
        op.fields[column] = safeValue(words, safetyAt(op, { column, entity: op.recordKind }, { mapping }))
      }
  }
  return ops
}
