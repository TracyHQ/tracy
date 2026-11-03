// The site writer's answers and the corrected entries of its fix rounds (ADR 0042 sections 1 and 5, #329). Pure.
//
// A writing turn answers { slots, alts, seo, pages, notebook, returns }; code puts the site-copy/1 file together from
// it (assembleCopy): it adds `version` and `fingerprint` and fills every label slot of the plan (`owner:
// "plan-label"`, the plan's own words) that the writer left out, as the prompt tells it to. Nothing the writer wrote
// is changed, reordered or dropped.
//
// A fix round answers only the corrected entries: { slots, alts, seo, pages }, each list holding only what changed.
// They are read as a change list for the shared run loop (asChangeList: one change per entry, { in: <list>, ...entry
// }) and applied onto the previous round's copy (applyValidChanges): an entry replaces the text of the entry with the
// same key (slot, frame, page) or adds it when the writer had left it out. An entry that names nothing the plan has,
// a label slot, a malformed text, or the same key twice is rejected on its own and sent back once; every valid entry
// is applied. Text the writer wrote is replaced only by the writer's own corrected entry, never by code.
import { invalidChangesMessage as invalidChangesMessageFor } from '../lib/bench-changes.js'

export const COPY_VERSION = 'site-copy/1'

/** The lists a fix round's answer may hold, and the key that names each entry. */
export const FIX_LISTS = Object.freeze({ slots: 'slot', alts: 'frame', seo: 'page', pages: 'page' })

/** What only a whole turn's answer holds: an answer with any of these is read as a whole copy. */
const WHOLE_KEYS = ['version', 'fingerprint', 'notebook', 'returns']

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isText = (x) => typeof x === 'string' && x.trim() !== ''

/**
 * The site-copy/1 file of one whole answer. `index` is the copy check's index of the plan (copy-check/inputs-index.js
 * indexInputs): its `expected` slots carry `label` (the plan's words) on label slots.
 * @param {object} answer the writer's answer as one JSON object
 * @param {{ fingerprint: object, index: { expected: Map<string, object> } }} context
 */
export function assembleCopy(answer, { fingerprint, index }) {
  const { version: _version, fingerprint: _fingerprint, slots, ...rest } = answer
  let all = slots
  if (slots === undefined || Array.isArray(slots)) {
    const written = new Set(arr(slots).map((s) => (isObject(s) ? s.slot : null)))
    const labels = [...index.expected.values()]
      .filter((e) => e.label !== null && !written.has(e.slot))
      .map((e) => ({ slot: e.slot, owner: 'plan-label', text: e.label, factIds: [...e.factIds] }))
    all = [...arr(slots), ...labels]
  }
  return { version: COPY_VERSION, fingerprint, slots: all, ...rest }
}

/**
 * A fix round's answer as a change list, or null when it is a whole answer. Read so only in a fix round: an object
 * whose keys are among the fix lists, at least one, and none of what only a whole answer holds.
 */
export function asChangeList(value, { round }) {
  if (round === 0 || !isObject(value)) return null
  const keys = Object.keys(value)
  if (!keys.length || keys.some((k) => WHOLE_KEYS.includes(k) || !Object.hasOwn(FIX_LISTS, k))) return null
  const changes = []
  for (const list of Object.keys(FIX_LISTS))
    for (const entry of arr(value[list]))
      changes.push(isObject(entry) ? { in: list, ...entry } : { in: list, entry })
  // A list that is not a list is one change of its own, so it is sent back rather than silently dropped.
  for (const list of keys) if (!Array.isArray(value[list])) changes.push({ in: list, entry: value[list] })
  return { changes }
}

const textProblem = (text) => {
  if (isText(text)) return null
  if (Array.isArray(text) && text.length && text.every(isText)) return null
  return 'its text must be a non-empty string or a non-empty list of non-empty strings'
}

// Why one entry cannot be applied, or null.
function entryProblem(change, index) {
  const list = change.in
  const keyName = FIX_LISTS[list]
  if (!keyName) return `it is in "${list}", which is not one of ${Object.keys(FIX_LISTS).join(', ')}`
  if (Object.hasOwn(change, 'entry')) return `an entry of "${list}" must be an object`
  const key = change[keyName]
  if (!isText(key)) return `an entry of "${list}" must name its ${keyName}`
  if (list === 'slots') {
    const planned = index.expected.get(key)
    if (!planned) return `slot ${key} is not a slot the plan keeps`
    if (planned.label !== null)
      return `slot ${key} is a label: code fills it with the plan's words, leave it out`
    if (change.factIds !== undefined && !(Array.isArray(change.factIds) && change.factIds.every(isText)))
      return `slot ${key}: factIds must be a list of fact ids`
    return textProblem(change.text) && `slot ${key}: ${textProblem(change.text)}`
  }
  if (list === 'alts') {
    if (!index.frames.has(key)) return `frame ${key} is not a picture frame the plan keeps`
    return isText(change.text) ? null : `frame ${key}: its text must be a non-empty string`
  }
  if (list === 'seo') {
    if (!index.pages.includes(key)) return `page ${key} is not a page the plan keeps`
    const fields = ['title', 'description'].filter((f) => change[f] !== undefined)
    if (!fields.length) return `seo of ${key} names neither title nor description`
    const bad = fields.find((f) => !isText(change[f]))
    return bad ? `seo of ${key}: ${bad} must be a non-empty string` : null
  }
  if (!index.textPages.includes(key)) return `page ${key} is not a page without kit slots in the plan`
  if (change.title === undefined && change.body === undefined)
    return `page ${key} names neither title nor body`
  if (change.title !== undefined && !isText(change.title))
    return `page ${key}: title must be a non-empty string`
  if (
    change.body !== undefined &&
    !(Array.isArray(change.body) && change.body.length && change.body.every(isText))
  )
    return `page ${key}: body must be a non-empty list of non-empty strings`
  return null
}

// Apply one valid entry to the copy, in place.
function applyEntry(doc, change) {
  const { in: list, ...entry } = change
  const keyName = FIX_LISTS[list]
  if (!Array.isArray(doc[list])) doc[list] = []
  const at = doc[list].filter((e) => isObject(e) && e[keyName] === entry[keyName])
  if (list === 'slots') {
    if (!at.length)
      doc.slots.push({ slot: entry.slot, owner: 'writer', text: entry.text, factIds: entry.factIds ?? [] })
    for (const e of at) {
      e.text = entry.text
      if (entry.factIds !== undefined) e.factIds = entry.factIds
    }
    return
  }
  if (!at.length) doc[list].push(entry)
  for (const e of at) Object.assign(e, entry)
}

/**
 * The previous copy with every valid corrected entry applied: `{ ok: true, doc, replacements: [], applied,
 * rejected: [{ index, reason, change }], validChanges }`, or `{ ok: false, reason }` when there is no usable list.
 * `context.ready.index` is the copy check's index of the plan.
 */
export function applyValidChanges(previous, changeList, { ready }) {
  if (!isObject(previous))
    return { ok: false, reason: 'there is no previous copy to apply corrected entries to' }
  const changes = changeList?.changes
  if (!Array.isArray(changes) || !changes.length)
    return { ok: false, reason: 'the answer holds no corrected entry' }
  const doc = structuredClone(previous)
  const rejected = []
  const validChanges = []
  const seen = new Set()
  for (const [n, change] of changes.entries()) {
    const key = isObject(change) ? `${change.in}:${change[FIX_LISTS[change.in]]}` : null
    const problem = !isObject(change)
      ? 'it is not an object'
      : (entryProblem(change, ready.index) ?? (seen.has(key) ? `${key} is named twice in this answer` : null))
    if (problem) {
      rejected.push({ index: n, reason: problem, change })
      continue
    }
    seen.add(key)
    applyEntry(doc, change)
    validChanges.push(change)
  }
  return { ok: true, doc, replacements: [], applied: validChanges.length, rejected, validChanges }
}

/** Sent once in a round when some corrected entries could not be applied: only those come back. */
export const invalidChangesMessage = (rejected, applied) =>
  invalidChangesMessageFor(rejected, applied, { noun: 'copy' }).replace(
    /Answer with only the corrected edits[^\n]*/,
    `Answer with only these entries, corrected, as one JSON object { "slots": [], "alts": [], "seo": [], "pages": [] } with nothing before or after it. Do not resend the entries that were applied, and do not send the whole copy.`
  )

/** Appended after the failure list of a fix round. */
export const CHANGES_INSTRUCTION = [
  '',
  'Rewrite only the entries named above, keep their meaning, and answer with them only, as one JSON object with nothing before or after it:',
  '{ "slots": [ { "slot": "", "text": "", "factIds": [] } ], "alts": [ { "frame": "", "text": "" } ], "seo": [ { "page": "", "title": "", "description": "" } ], "pages": [ { "page": "", "title": "", "body": [""] } ] }',
  'Each list holds only corrected entries; leave out a list with nothing to correct. Everything else stays as you wrote it.',
  ''
].join('\n')

/** Sent once when corrected entries could not be applied at all, or still had invalid entries after one ask. */
export const WHOLE_COPY_MESSAGE =
  'Your corrected entries could not be applied. Answer with the whole copy as one JSON object { "slots", "alts", "seo", "pages", "notebook", "returns" }, with nothing before or after it.\n'

/** What a round whose answer is not one JSON object sends back, as its failure list. */
export const NOT_A_COPY_MESSAGE =
  'Your answer is not a copy file. Answer with one JSON object { "slots", "alts", "seo", "pages", "notebook", "returns" }, with nothing before or after it.\n'
