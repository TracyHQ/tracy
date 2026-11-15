// How the draft write makes a value safe at its place (ticket #597): read from the kit's own declaration of how every
// place prints (`mapping.escapes.places`, read with `escapeOf(mapping, placeOf(mapping, loc))` of
// `ai-quickstart-escapes.mjs`), never from a list of the write step. Each `escaped` value gives one kind of place
// (`draft-write-escape.mjs` writes and guards each kind):
//
//   false          printed as stored: `raw` (the words escaped as `htmlspecialchars` with ENT_QUOTES, the declared
//                  markers of a codes field kept), `html` for a whole HTML column, `piece` for an xpath piece (the DOM
//                  escapes it). Two measured exceptions are written `neutral`: a module title (stored as the
//                  character, never a reference: the administrator escapes the stored title, so `&amp;` would show
//                  there, measured "Module titles") and a contract slot the door counts raw (`countsRaw`: escaping would
//                  make it count more than the writer wrote)
//   true           every print escapes it: `plain`, the words as they are, quotes typographic when a quote is
//                  `unsafe`; the guard refuses every other mark of `unsafe` (and `doorRefuses`) and any text that reads
//                  as a character reference (`escapes.legacyReferences`). An xpath piece there is `neutral`
//   "mixed"        printed raw somewhere and escaped elsewhere: `neutral`, the strict guard (typographic quotes; no
//                  `<`, `>` or text that reads as a reference)
//   "not-printed"  no page prints it: `free` (written as it is; a piece stays a piece)
//   "not-text"     an id, a class, a position: `token` (written as it is, refused with `<`, `>` or a quote)
//   "not-written"  the build never writes it: `unwritten`, the guard refuses any value sent there
//   no entry       (no `escapes`, or no or two entries match): `neutral`, the strict guard, never a guess
// Pure.
import { escapeOf } from './ai-quickstart-escapes.mjs'
import { placeOf } from './ai-quickstart-escapes-places.mjs'
import { countsRaw } from './draft-write-door-length.mjs'

const HTML_COLUMNS = new Set(['introtext', 'fulltext', 'content', 'misc', 'description'])
const NO_MARKS = new Set()

/**
 * The place a value is written at, in the form `escapes` matches: a location of the mapping file through its entity,
 * or a column of a record the write creates (`op.fields`: its kind, the column; a contact's `title` is its `name`).
 */
export function placeOfValue(mapping, op, loc) {
  const created = String(op?.kind ?? '').endsWith('.create')
  if (mapping?.entities?.[loc?.entity] || loc?.entity === 'page')
    return placeOf(mapping, loc, created ? op.recordKind : 'page')
  const column = op?.recordKind === 'contact' && loc?.column === 'title' ? 'name' : loc?.column
  return {
    kind: op?.recordKind ?? null,
    column,
    ...(op?.fields?.menutype ? { menutype: op.fields.menutype } : {})
  }
}

/** The kit's escaping entry of a value's place, or null (no declaration, no entry, or two alike). */
export const escapeEntryAt = (mapping, op, loc) =>
  mapping?.escapes ? escapeOf(mapping, placeOfValue(mapping, op, loc)) : null

const isModuleTitle = (op, loc, place) =>
  place?.kind === 'module' && loc?.column === 'title' && !loc?.jsonPath?.length && !loc?.xpath

/**
 * How a value is written at its place: `{kind, marks}`, `kind` one of `raw`, `html`, `piece`, `neutral`, `plain`,
 * `free`, `token`, `unwritten`; `marks`: for `plain`, what the place does not show as written.
 */
export function safetyAt(op, loc, { slot = null, mapping = null } = {}) {
  const entry = escapeEntryAt(mapping, op, loc)
  const escaped = entry ? entry.escaped : undefined
  const piece = Boolean(loc?.xpath)
  if (escaped === false) {
    if (piece) return { kind: 'piece', marks: NO_MARKS }
    if (isModuleTitle(op, loc, placeOfValue(mapping, op, loc))) return { kind: 'neutral', marks: NO_MARKS }
    if (HTML_COLUMNS.has(loc?.column) && !loc?.jsonPath?.length) return { kind: 'html', marks: NO_MARKS }
    if (op?.kind === 'contract.apply' && slot && countsRaw(slot)) return { kind: 'neutral', marks: NO_MARKS }
    return { kind: 'raw', marks: NO_MARKS }
  }
  if (escaped === true && !piece)
    return { kind: 'plain', marks: new Set([...(entry.unsafe ?? []), ...(entry.doorRefuses ?? [])]) }
  if (escaped === 'not-printed') return { kind: piece ? 'piece' : 'free', marks: NO_MARKS }
  if (escaped === 'not-text') return { kind: piece ? 'piece' : 'token', marks: NO_MARKS }
  if (escaped === 'not-written') return { kind: 'unwritten', marks: NO_MARKS }
  return { kind: 'neutral', marks: NO_MARKS }
}
