// The change lists of a bench's fix rounds (ADR 0041, #301; shared by every bench step since #327). Pure: a document
// and a change list in, the changed document or a reason out.
//
// In a fix round the agent may answer with edits: { "changes": [ ... ] }, applied in order, like an editor's edit
// command. A change names one part of the previous document by exactly one kind key or one top-level section, then
// replaces one value at a path inside it ("field"), adds one entry to a list in it ("add"), removes one value at a
// path or the part itself ("remove"), or, with none of these, replaces the whole part (bench-change-edits.js). Every
// other part stays as it was. A change that names a part that is not there (or more than one), or whose edit is
// malformed, is rejected on its own: every valid change is still applied (applyValidChanges) and the run loop sends
// back only the rejected ones, once, for corrected edits.
//
// What a part is belongs to the step (changeRules): the kinds a change may name and the key holding each kind's id
// (partKinds), the kinds a change may remove whole (removable), the document's top-level sections (sections), where
// the parts are (partArrays: a generator of [kind, id key, array] over a document) and what the document is called in
// the reasons sent back (noun).
import { applyEdit, pathSteps } from './bench-change-edits.js'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The edits a change may make to the part it names; with none of them, "with" replaces the whole part. */
const OPS = ['field', 'add', 'remove']

const NO_KEY = Symbol('no key')

const overlaps = (a, b) =>
  a === null || b === null || a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`)

/** The path a change edits inside its part, or null when it edits the whole part (or does not name one). */
function pathKeyOf(change) {
  for (const op of OPS) {
    const v = change[op]
    if (typeof v === 'string') return (pathSteps(v) ?? [v]).join('.')
  }
  return null
}

/**
 * The change appliers of one step.
 * @param {{ partKinds: Record<string, string>, removable: string[], sections: readonly string[],
 *   partArrays: (doc: object) => Iterable<[string, string, unknown]>, noun: string }} rules
 * @returns {{ applyChanges: Function, applyValidChanges: Function }} both answer `{ ok: true, doc, ... }` or
 *   `{ ok: false, reason }`, and never modify the previous document.
 */
export function changeRules(rules) {
  const { partKinds, sections, partArrays, noun } = rules
  const kindKeys = [...Object.keys(partKinds), 'section']

  /** Where the parts of one kind with one id are: [array, index] pairs. */
  function locate(doc, kind, id) {
    const found = []
    for (const [k, key, arr] of partArrays(doc)) {
      if (k !== kind || !Array.isArray(arr)) continue
      arr.forEach((part, i) => {
        if (isObject(part) && part[key] === id) found.push([arr, i])
      })
    }
    return found
  }

  // The part or section a change names: its kind, id and label, and how to read, replace or remove it.
  function targetOf(doc, kind, id, at) {
    if (kind === 'section') {
      if (typeof id !== 'string' || !(sections.includes(id) || Object.hasOwn(doc, id)))
        return { reason: `${at} names a section that does not exist: ${String(id).slice(0, 80)}` }
      return { kind, id, label: `section ${id}`, get: () => doc[id], set: (v) => (doc[id] = v) }
    }
    if (typeof id !== 'string' || !id) return { reason: `${at} names no ${kind} id` }
    const found = locate(doc, kind, id)
    if (found.length === 0) return { reason: `${at} names a ${kind} that does not exist: ${id.slice(0, 80)}` }
    if (found.length > 1)
      return {
        reason: `${at} names a ${kind} that is in the ${noun} ${found.length} times: ${id.slice(0, 80)}`
      }
    const [arr, i] = found[0]
    const remove = () => arr.splice(i, 1)
    return { kind, id, label: `${kind} ${id}`, get: () => arr[i], set: (v) => (arr[i] = v), remove }
  }

  /** One change applied to a document, in place. Returns null, or the reason it cannot be applied. */
  function applyOne(doc, change, n, replacements) {
    const at = `change ${n}`
    if (!isObject(change)) return `${at} is not an object`
    const ops = OPS.filter((k) => Object.hasOwn(change, k))
    if (ops.length > 1)
      return `${at} must name exactly one of field, add or remove, or none to replace the whole part`
    const named = kindKeys.filter((k) => Object.hasOwn(change, k))
    if (named.length !== 1) return `${at} must name exactly one of ${kindKeys.join(', ')}`
    const op = ops[0] ?? 'replace'
    if (op !== 'remove' && !Object.hasOwn(change, 'with')) return `${at} has no "with"`
    const allowed = [named[0], ...ops, ...(op === 'remove' ? [] : ['with'])]
    const extra = Object.keys(change).filter((k) => !allowed.includes(k))
    if (extra.length) return `${at} has keys it should not: ${extra.join(', ')}`
    const target = targetOf(doc, named[0], change[named[0]], at)
    if (target.reason) return target.reason
    return applyEdit(target, change, op, { n, at, replacements, rules })
  }

  /** The part a change names, as one string key, or NO_KEY when it names none or several. */
  function partKeyOf(change) {
    if (!isObject(change)) return NO_KEY
    const named = kindKeys.filter((k) => Object.hasOwn(change, k))
    if (named.length !== 1 || typeof change[named[0]] !== 'string') return NO_KEY
    return `${named[0]}:${change[named[0]]}`
  }

  const usable = (previous, changeList) => {
    if (!isObject(previous)) return `there is no previous ${noun} to apply changes to`
    const changes = changeList?.changes
    if (!Array.isArray(changes) || !changes.length) return '"changes" must be a list with at least one change'
    return null
  }

  /**
   * The previous document with a change list applied: `{ ok: true, doc, replacements }`, or `{ ok: false, reason }`
   * when any change cannot be applied (nothing is applied then). replacements measures every value a change replaced
   * (a whole part, a section or a field) for the size guard (bench-change-size.js).
   */
  function applyChanges(previous, changeList) {
    const unusable = usable(previous, changeList)
    if (unusable) return { ok: false, reason: unusable }
    const doc = structuredClone(previous)
    const replacements = []
    for (const [n, change] of changeList.changes.entries()) {
      const reason = applyOne(doc, change, n, replacements)
      if (reason) return { ok: false, reason }
    }
    return { ok: true, doc, replacements }
  }

  /**
   * The previous document with every valid change of a list applied, in order, and the invalid ones set aside:
   * `{ ok: true, doc, replacements, applied, rejected, validChanges }`, where rejected is `[{ index, reason, change }]`
   * and validChanges the changes that were applied. `{ ok: false, reason }` only when there is no usable list (no
   * previous document, "changes" empty or not a list).
   *
   * Order dependence: a later change that edits the same part as a rejected earlier change, at the same path or one
   * above or below it (or anywhere in the part when either change replaces the whole part), is not applied either and
   * is rejected as depending on that change. Applying it alone could leave the part in a state the agent never
   * intended (a remove that was rejected, then an add on the same slot). It is sent back with the others, so the
   * corrected edits restate both. Changes on other parts, or other paths of the same part, are unaffected.
   */
  function applyValidChanges(previous, changeList) {
    const unusable = usable(previous, changeList)
    if (unusable) return { ok: false, reason: unusable }
    const doc = structuredClone(previous)
    const replacements = []
    const rejected = []
    const validChanges = []
    const blocked = [] // [part key, path or null, index of the rejected change]
    for (const [n, change] of changeList.changes.entries()) {
      const key = partKeyOf(change)
      const path = isObject(change) ? pathKeyOf(change) : null
      const dependsOn = key === NO_KEY ? undefined : blocked.find(([k, p]) => k === key && overlaps(p, path))
      const reason = dependsOn
        ? `change ${n} depends on change ${dependsOn[2]}, which was rejected (it edits the same part)`
        : applyOne(doc, change, n, replacements)
      if (!reason) {
        validChanges.push(change)
        continue
      }
      rejected.push({ index: n, reason, change })
      if (key !== NO_KEY) blocked.push([key, path, n])
    }
    return { ok: true, doc, replacements, applied: validChanges.length, rejected, validChanges }
  }

  return { applyChanges, applyValidChanges }
}

const MAX_LISTED = 40
const CHANGE_TEXT_CHARS = 300
const REASON_CHARS = 300

const clip = (text, n) => (text.length > n ? `${text.slice(0, n)}...` : text)

/**
 * Sent once in a round when some changes were applied and some were not: only the invalid ones come back. `noun`
 * names the step's document ("plan").
 */
export function invalidChangesMessage(rejected, applied, { noun }) {
  const shown = rejected.slice(0, MAX_LISTED)
  const more = rejected.slice(MAX_LISTED).map((r) => r.index)
  return [
    `${applied} of your changes were applied. ${rejected.length} could not be applied and were left out:`,
    ...shown.map(
      (r) =>
        `- change ${r.index}: ${clip(r.reason, REASON_CHARS)}\n  ${clip(JSON.stringify(r.change) ?? 'undefined', CHANGE_TEXT_CHARS)}`
    ),
    ...(more.length ? [`- and ${more.length} more rejected changes: ${more.join(', ')}`] : []),
    `Answer with only the corrected edits for these changes, as one JSON object {"changes": [...]} in the same format, with nothing before or after it. Do not resend the changes that were applied, and do not send the whole ${noun}.`,
    ''
  ].join('\n')
}
