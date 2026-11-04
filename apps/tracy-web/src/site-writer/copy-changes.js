// The site writer's answers and the corrected entries of its fix rounds (ADR 0042 sections 1 and 5, #329). Pure.
//
// A writing turn answers { slots, alts, seo, pages, notebook, returns }; code puts the site-copy/1 file together from
// it (assembleCopy): it adds `version` and `fingerprint` and fills every label slot of the plan (`owner:
// "plan-label"`, the plan's own words) that the writer left out, as the prompt tells it to. A label slot the writer
// wrote is recorded by what happened (plan-labels.js labelSlotEntry, 2026-11-04): the plan's words kept are
// `plan-label`, a text of its own is `writer` with `replacedPlanLabel`. No text the writer wrote is changed,
// reordered or dropped.
//
// A fix round answers only the corrected entries: { slots, alts, seo, pages }, each list holding only what changed
// (and `returns`, which withdraws the writer's own text for a slot or page).
// They are read as a change list for the shared run loop (asChangeList: one change per entry, { in: <list>, ...entry
// }) and applied onto the previous round's copy (applyValidChanges): an entry replaces the text of the entry with the
// same key (slot, frame, page) or adds it when the writer had left it out. A label slot entry is recorded the same
// way as in a whole answer. An entry that names nothing the plan has, a malformed text, or the same key twice is rejected on its own and sent back once; every valid entry
// is applied. Text the writer wrote is replaced only by the writer's own corrected entry, never by code.
import { invalidChangesMessage as invalidChangesMessageFor } from '../lib/bench-changes.js'
import { labelSlotEntry } from './plan-labels.js'

export const COPY_VERSION = 'site-copy/1'

/** The lists a fix round's answer may hold, and the key that names each entry. */
export const FIX_LISTS = Object.freeze({ slots: 'slot', alts: 'frame', seo: 'page', pages: 'page' })

/** What code writes into the file: a fix round answer that repeats them is still corrected entries. */
const CODE_KEYS = ['version', 'fingerprint']

/** In a fix round, `returns` entries withdraw the writer's own text (applyReturn); they are keyed by slot or page. */
const RETURNS = 'returns'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isText = (x) => typeof x === 'string' && x.trim() !== ''

/**
 * The site-copy/1 file of one whole answer. `index` is the copy check's index of the plan (lib/site-copy/inputs-index.js
 * indexInputs): its `expected` slots carry `label` (the plan's words) on label slots.
 * @param {object} answer the writer's answer as one JSON object
 * @param {{ fingerprint: object, index: { expected: Map<string, object> } }} context
 */
export function assembleCopy(answer, { fingerprint, index }) {
  const { version: _version, fingerprint: _fingerprint, slots, ...rest } = answer
  let all = slots
  if (slots === undefined || Array.isArray(slots)) {
    const written = new Set(arr(slots).map((s) => (isObject(s) ? s.slot : null)))
    const labelOf = (s) => (isObject(s) ? index.expected.get(s.slot) : null)
    const traced = arr(slots).map((s) => (labelOf(s)?.label != null ? labelSlotEntry(s, labelOf(s)) : s))
    const labels = [...index.expected.values()]
      .filter((e) => e.label !== null && !written.has(e.slot))
      .map((e) => ({ slot: e.slot, owner: 'plan-label', text: e.label, factIds: [...e.factIds] }))
    all = [...traced, ...labels]
  }
  return { version: COPY_VERSION, fingerprint, slots: all, ...rest }
}

/**
 * A fix round's answer as a change list, or null when it is a whole answer. Only a whole writing turn writes the
 * notebook, so in a fix round an answer without one is the writer's corrected entries, even when it repeats the
 * file's version and fingerprint (code's own, ignored) or names returns. Read so it can never replace the whole copy
 * with a few entries (first run on dev, #334). A key that is no list of a fix answer is one rejected change.
 */
export function asChangeList(value, { round }) {
  if (round === 0 || !isObject(value) || Object.hasOwn(value, 'notebook')) return null
  const keys = Object.keys(value).filter((k) => !CODE_KEYS.includes(k))
  const changes = []
  for (const list of [...Object.keys(FIX_LISTS), RETURNS])
    for (const entry of arr(value[list]))
      changes.push(isObject(entry) ? { in: list, ...entry } : { in: list, entry })
  // A list that is not a list, or a key no fix answer has, is one change of its own, so it is sent back rather than
  // silently dropped.
  const known = (k) => Object.hasOwn(FIX_LISTS, k) || k === RETURNS
  for (const list of keys)
    if (!known(list) || !Array.isArray(value[list])) changes.push({ in: list, entry: value[list] })
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
  if (list === RETURNS) return returnProblem(change, index)
  const keyName = FIX_LISTS[list]
  if (!keyName) return `it is in "${list}", which is not one of ${Object.keys(FIX_LISTS).join(', ')}`
  if (Object.hasOwn(change, 'entry')) return `an entry of "${list}" must be an object`
  const key = change[keyName]
  if (!isText(key)) return `an entry of "${list}" must name its ${keyName}`
  if (list === 'slots') {
    const planned = index.expected.get(key)
    if (!planned) return `slot ${key} is not a slot the plan keeps`
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

const returnKey = (entry) => (isText(entry.slot) ? `slot ${entry.slot}` : `page ${entry.page}`)

// Why one returns entry of a fix round cannot be applied, or null. A label slot is code's to write, never returned.
function returnProblem(change, index) {
  if (Object.hasOwn(change, 'entry')) return 'an entry of "returns" must be an object'
  if (!isText(change.reason)) return 'a returns entry must give its reason'
  if (isText(change.slot)) {
    const planned = index.expected.get(change.slot)
    if (planned && planned.label !== null)
      return `slot ${change.slot} is a label: write the plan's words as its text to keep them, never return it`
    return null
  }
  if (!isText(change.page)) return 'a returns entry must name its slot or its page'
  if (!index.pages.includes(change.page) && !index.textPages.includes(change.page))
    return `page ${change.page} is not a page the plan keeps`
  return null
}

// A fix round return: the writer withdraws its own text for that slot (or pages entry). A slot the plan keeps is
// listed as returned for the owner; a slot the plan does not keep (written by mistake) only leaves the copy.
function applyReturn(doc, entry, index) {
  if (isText(entry.slot)) {
    doc.slots = arr(doc.slots).filter(
      (s) => !(isObject(s) && s.slot === entry.slot && s.owner !== 'plan-label')
    )
    if (!index.expected.has(entry.slot)) return
  } else doc.pages = arr(doc.pages).filter((p) => !(isObject(p) && p.page === entry.page))
  if (!Array.isArray(doc.returns)) doc.returns = []
  if (!doc.returns.some((r) => isObject(r) && returnKey(r) === returnKey(entry))) doc.returns.push(entry)
}

// Apply one valid entry to the copy, in place.
function applyEntry(doc, change, index) {
  const { in: list, ...entry } = change
  if (list === RETURNS) return applyReturn(doc, entry, index)
  const keyName = FIX_LISTS[list]
  if (!Array.isArray(doc[list])) doc[list] = []
  const at = doc[list].filter((e) => isObject(e) && e[keyName] === entry[keyName])
  if (list === 'slots') {
    const planned = index.expected.get(entry.slot)
    if (planned?.label != null) {
      // Replaced in its place, so the copy keeps its order; a label the copy did not hold yet is added.
      const traced = labelSlotEntry(entry, planned)
      let placed = false
      doc.slots = doc.slots.flatMap((e) => {
        if (!(isObject(e) && e.slot === entry.slot)) return [e]
        if (placed) return []
        placed = true
        return [traced]
      })
      if (!placed) doc.slots.push(traced)
      return
    }
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
    const key = !isObject(change)
      ? null
      : change.in === RETURNS
        ? `returns:${returnKey(change)}`
        : `${change.in}:${change[FIX_LISTS[change.in]]}`
    const problem = !isObject(change)
      ? 'it is not an object'
      : (entryProblem(change, ready.index) ?? (seen.has(key) ? `${key} is named twice in this answer` : null))
    if (problem) {
      rejected.push({ index: n, reason: problem, change })
      continue
    }
    seen.add(key)
    applyEntry(doc, change, ready.index)
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
