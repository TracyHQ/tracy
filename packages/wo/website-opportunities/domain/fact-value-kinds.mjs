/**
 * The owner's value edit of one fact of the place profile (#537 R18, pure): what kind of value a fact takes, whether a
 * sent value is one, and the fact's value once the edit is laid on. One door edits every fact of the seven groups
 * (`PUT /:id/facts {factId, value}`), so a fact of a kind of business no screen knows yet is edited the same way.
 *
 * Kinds: `text`, `list` (a list of texts), `hours` (the opening hours, one line a day), `boolean`, `number`, `url` (an
 * http or https link), `flags` (names to true or false, such as Google's amenities). A fact whose value is a record
 * edits its one plain part: a person's or an offering's `name`, a quote's `text`, a link's `url`, a statistic's
 * `amount`. A fact of no kind (a map location, address components) is never edited: it is switched off instead.
 */

/** The kinds a fact value door takes. */
export const FACT_VALUE_KINDS = Object.freeze(['text', 'list', 'hours', 'boolean', 'number', 'url', 'flags'])
/** The most value edits an owner can hold; a profile states far fewer facts. */
export const FACT_EDITS_MAX = 200
const TEXT_MAX = 2000
const NAME_MAX = 200
const LIST_MAX = 50
const HOURS_MAX = 14
const HOURS_LINE_MAX = 200
const URL_MAX = 2048
const FLAGS_MAX = 60
const FLAG_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const flagsOf = (v) =>
  isObj(v) && Object.keys(v).length > 0 && Object.values(v).every((x) => typeof x === 'boolean')
/** The part of a record value an edit changes, by group: the rest of the record is kept. */
const RECORD_PART = { people: 'name', offerings: 'name', quotes: 'text', links: 'url', claims: 'amount' }

/** What the door answers in `next` for a value that is not of the fact's kind. */
export const FACT_VALUE_NEXT = Object.freeze({
  text: `Send "value" as a text of 1 to ${TEXT_MAX} characters.`,
  name: `Send "value" as a name of 1 to ${NAME_MAX} characters.`,
  list: `Send "value" as a list of 1 to ${LIST_MAX} texts, each 1 to ${TEXT_MAX} characters.`,
  hours: `Send "value" as the opening hours: a list of 1 to ${HOURS_MAX} lines such as "Monday: 9:00 AM to 5:00 PM".`,
  boolean: 'Send "value" as true or false.',
  number: 'Send "value" as a number.',
  url: 'Send "value" as an http or https link.',
  flags: `Send "value" as an object of up to ${FLAGS_MAX} names, each true or false, such as {"wheelchairAccessibleEntrance": true}.`,
  none: 'This fact cannot be edited: send "onSite": false to keep it off the site instead.'
})

/**
 * The kind of value one fact takes (`FACT_VALUE_KINDS`), or null when it cannot be edited.
 * @param {string[]} path where the fact sits in the profile, such as `['business', 'hours']` or `['links', '0']`
 * @param {{value: any}} fact
 */
export function factValueKindOf(path, fact) {
  const [group, key] = path ?? []
  const v = fact?.value
  if (group === 'business' && key === 'hours') return strings(v) ? 'hours' : null
  if (typeof v === 'string') return 'text'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number' && Number.isFinite(v)) return 'number'
  if (Array.isArray(v)) return strings(v) ? 'list' : null
  if (!isObj(v)) return null
  const part = RECORD_PART[group]
  if (part === 'url') return typeof v.url === 'string' ? 'url' : null
  if (part === 'amount') return typeof v.amount === 'number' ? 'number' : null
  if (part) return typeof v[part] === 'string' ? 'text' : null
  return flagsOf(v) ? 'flags' : null
}

/** Whether a text fact holds a name (a business, brand, person or offering name): those are kept to 200 characters. */
const isName = (path) =>
  ['people', 'offerings'].includes(path?.[0]) ||
  (['business', 'brand'].includes(path?.[0]) && path?.[1] === 'name')

const httpUrl = (text) => {
  if (text.length > URL_MAX || /\s/.test(text)) return false
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol)
  } catch {
    return false
  }
}

/**
 * A sent value read for one kind: `{value}` (texts trimmed) or `{error: 'INVALID_VALUE', next}`.
 * @param {string | null} kind @param {any} value @param {string[]} [path] the fact's path (a name's limit)
 */
export function readFactValue(kind, value, path = []) {
  const bad = (shape = kind) => ({
    error: 'INVALID_VALUE',
    next: FACT_VALUE_NEXT[shape] ?? FACT_VALUE_NEXT.none
  })
  if (!kind) return bad('none')
  if (kind === 'text') {
    if (typeof value !== 'string') return bad(isName(path) ? 'name' : 'text')
    const text = isName(path) ? value.replace(/\s+/g, ' ').trim() : value.trim()
    const max = isName(path) ? NAME_MAX : TEXT_MAX
    return text && text.length <= max ? { value: text } : bad(isName(path) ? 'name' : 'text')
  }
  if (kind === 'list' || kind === 'hours') {
    const max = kind === 'hours' ? HOURS_MAX : LIST_MAX
    const lineMax = kind === 'hours' ? HOURS_LINE_MAX : TEXT_MAX
    if (!Array.isArray(value) || !value.length || value.length > max) return bad()
    const lines = value.map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : ''))
    return lines.every((l) => l && l.length <= lineMax) ? { value: lines } : bad()
  }
  if (kind === 'boolean') return typeof value === 'boolean' ? { value } : bad()
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? { value } : bad()
  if (kind === 'url') {
    const text = typeof value === 'string' ? value.trim() : ''
    return httpUrl(text) ? { value: text } : bad()
  }
  if (kind === 'flags') {
    if (!flagsOf(value) || Object.keys(value).length > FLAGS_MAX) return bad()
    return Object.keys(value).every((k) => FLAG_NAME.test(k)) ? { value: { ...value } } : bad()
  }
  return bad('none')
}

/** The fact's value with an edit laid on (pure): a record keeps every part but the one the edit changes. */
export function editedFactValue(path, fact, edited) {
  const part = RECORD_PART[path?.[0]]
  return part && isObj(fact?.value) ? { ...fact.value, [part]: edited } : structuredClone(edited)
}

/**
 * The stored edits after one (pure): `value` null clears the fact's edit, every other fact's is kept. Throws an error
 * with `code: 'TOO_MANY_FACT_EDITS'` when a new edit would pass `FACT_EDITS_MAX` (the door answers 400).
 */
export function nextFactEdits(held, factId, value, at = new Date().toISOString()) {
  const out = isObj(held) ? { ...held } : {}
  if (value === null) delete out[factId]
  else {
    if (!(factId in out) && Object.keys(out).length >= FACT_EDITS_MAX)
      throw Object.assign(new Error('Too many fact edits'), { code: 'TOO_MANY_FACT_EDITS' })
    out[factId] = { value, at }
  }
  return out
}

/** `{[factId]: {value, at}}` of a stored map, without what is malformed. */
export function factEditsOf(held) {
  if (!isObj(held)) return {}
  return Object.fromEntries(
    Object.entries(held).filter(([, e]) => isObj(e) && 'value' in e && e.value !== null)
  )
}
