// How each value of a draft write is made safe as raw HTML at its place (ticket #597, door measurements of plugin
// 0.24.85 in docs/references/ai-quickstart-contract.md, "Escaping of field values" and "JA ACM markers"). The template
// escapes almost nothing, so the write step is the only barrier: every value it sends must already be safe where it
// prints. Each place is one of four kinds:
//
//   piece    an xpath piece of a stored HTML value: the piece functions set it through the DOM, which escapes `&`,
//            `<` and `>` but leaves a quote in a text node as it is, so plain words get typographic quotes (where the
//            template prints a piece of a JSON key, an article's `attribs`, is not measured: text or attribute)
//   raw      measured printed as stored, in text and in attributes (a JA ACM block's data, a module title, a module's
//            chrome settings, a site language string): the words are escaped as `htmlspecialchars` with ENT_QUOTES
//            does (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`); the declared markers of a codes field are kept
//   neutral  not measured, or measured escaped by the template (block 177's `info-*` keys, `moduleclass_sfx`): a value
//            is written so that it reads the same escaped or not (straight quotes as typographic ones; a `<`, a `>` or
//            a character reference is refused by the guard), so it is never escaped twice and never left open
//   html     a whole HTML column (an article body, a mod_custom content): the words are escaped, the tags its field
//            declares kept (`inline_html` of `textAt` already does it)
//
// The JA ACM converter replaces every `((` and `))` of the whole `jatools-config` string blindly, so a double
// parenthesis is refused at every place (`doubleParenthesisProblems`); only the declared markers of a codes field are
// kept there. Pure.
import { countsRaw } from './draft-write-door-length.mjs'
import { addressAt } from './draft-write-place-kinds.mjs'
import { readTags } from './draft-write-tags.mjs'
import { placesOfOrder } from './write-order-check.mjs'

/** Keys measured escaped by the template: a value there is written escape neutral, never escaped twice. */
export const TEMPLATE_ESCAPED_KEYS = new Set([
  'info-email-label',
  'info-email',
  'info-phone-label',
  'info-phone',
  'info-note',
  'moduleclass_sfx'
])
const HTML_COLUMNS = new Set(['introtext', 'fulltext', 'content', 'misc', 'description'])
const RAW_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
/** `htmlspecialchars($text, ENT_QUOTES)`. */
export const escapeRaw = (text) => String(text).replace(/[&<>"']/g, (c) => RAW_ESCAPES[c])

const leafOf = (loc) => String(loc?.jsonPath?.at(-1) ?? '')
const isModule = (op, loc) =>
  String(loc?.entity ?? '').startsWith('module-') ||
  op?.kind === 'library.create' ||
  op?.recordKind === 'module'

/**
 * The kind of a place: `piece`, `raw`, `neutral` or `html`. A place printed raw whose contract slot the door counts
 * raw (a module title through the contract) is written neutral: escaping would make the door count more characters
 * than the writer wrote, and refuse it.
 */
export function safetyAt(op, loc, slot = null) {
  const kind = kindAt(op, loc)
  return kind === 'raw' && op?.kind === 'contract.apply' && slot && countsRaw(slot) ? 'neutral' : kind
}
function kindAt(op, loc) {
  if (loc?.xpath) return 'piece'
  if (TEMPLATE_ESCAPED_KEYS.has(leafOf(loc))) return 'neutral'
  if (loc?.nestedJson) return 'raw'
  if (isModule(op, loc)) {
    if (loc?.column === 'content' && !loc.jsonPath?.length) return 'html'
    return loc?.column === 'title' || loc?.column === 'params' ? 'raw' : 'neutral'
  }
  if (String(loc?.entity ?? '').startsWith('languageString-')) return 'raw'
  if (HTML_COLUMNS.has(loc?.column) && !loc?.jsonPath?.length) return 'html'
  return 'neutral'
}

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

/**
 * The value written at a place, made safe there.
 * @param {string} value the value as the planner made it (`textAt`)
 * @param {{kind: string, markers?: Set<string>, address?: boolean, escaped?: boolean}} how `escaped`: `textAt` already
 *   escaped the words (`inline_html`)
 */
export function safeValue(value, { kind, markers = new Set(), address = false, escaped = false }) {
  const text = String(value)
  if (kind === 'raw')
    return partsOf(text, markers)
      .map((p) => p.marker ?? escapeRaw(p.words))
      .join('')
  if (kind === 'neutral') return address ? text : typographic(text)
  if (kind === 'piece') return address || /</.test(text) ? text : typographic(text)
  if (kind === 'html' && !escaped && !/</.test(text)) return escapeRaw(text)
  return text
}

const REFERENCE = /&(#|[A-Za-z][A-Za-z0-9]*;)/
const ESCAPED_ONLY = /&(?!(amp|lt|gt|quot|#0*39|#x0*27);)/

/** Why a value is not safe as raw HTML at its kind of place (`not_escaped`, `not_escape_neutral`), or null. */
export function unsafeAt(value, { kind, markers = new Set() }) {
  const text = String(value)
  if (kind === 'raw') {
    const words = partsOf(text, markers)
      .map((p) => p.words ?? '')
      .join('')
    return /[<>"']/.test(words) || ESCAPED_ONLY.test(words) ? 'not_escaped' : null
  }
  if (kind === 'neutral') return /[<>"']/.test(text) || REFERENCE.test(text) ? 'not_escape_neutral' : null
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

/**
 * Every value and created record column of the operations, made safe at its place (`safeValue`); an address at a
 * neutral place is written as it is (no typographic quotes in an address: the guard refuses a quote there).
 */
export function safeOps(ops, { order, kit }) {
  const entries = entriesByPlace(order)
  for (const op of ops) {
    for (const v of op.values ?? []) {
      if (typeof v.value !== 'string') continue
      const entry = v.entry ? entries.get(v.entry) : null
      const slot = v.loc?.slot ? kit.slots.get(v.loc.slot) : null
      v.value = safeValue(v.value, {
        kind: safetyAt(op, v.loc, slot),
        markers: v.loc?.nestedJson ? declaredMarkersOf(entry) : new Set(),
        address: addressAt(v.loc, entry, slot),
        escaped: String(v.rule ?? '').includes('inline_html')
      })
    }
    if (op.kind.endsWith('.create') && op.fields)
      for (const [column, text] of Object.entries(op.fields))
        if (typeof text === 'string' && column !== 'link')
          op.fields[column] = safeValue(text, { kind: safetyAt(op, { column, entity: op.recordKind }) })
  }
  return ops
}
