// Reading the site planner's answer, and the change lists of fix rounds (ADR 0041, #301). Pure: text and plans in,
// a plan or a reason out.
//
// An answer is one JSON object, bare or in one markdown code fence around the whole answer. An answer with text
// around exactly one fenced block whose content is one JSON object is read as that block, and the dropped text is
// recorded. Two fenced blocks or none stay unread.
//
// In a fix round the planner answers with edits: { "changes": [ ... ] }, applied in order, like an editor's edit
// command. A change names one part of the previous plan by exactly one kind key (see PART_KINDS) or one top-level
// section, then replaces one value at a path inside it ("field"), adds one entry to a list in it ("add"), removes one
// value at a path or the part itself ("remove"), or, with none of these, replaces the whole part (plan-change-edits.js).
// Every other part stays as it was. A change list that names a part that is not there (or more than one), or whose
// edit is malformed, is rejected on its own: every valid change is still applied (applyValidChanges) and the server
// sends back only the rejected ones, once, for corrected edits. Only when that does not work, or the answer is not a
// usable change list at all, does it ask for the whole plan. A list whose replacements resend much of the plan
// unchanged is refused once by the worker (plan-change-size.js).
import { applyEdit, PART_KINDS, pathSteps } from './plan-change-edits.js'

export { PART_KINDS } from './plan-change-edits.js'

/** Appended after the failure list of a fix round. */
export const CHANGES_INSTRUCTION = [
  '',
  'Answer with only the edits that fix these failures, as one JSON object {"changes": [...]}, with nothing before or after it.',
  'Edit like a text editor: name the exact place and give its new value. Never resend what stays the same.',
  'The changes are applied in order. Each change names one part by its id: "page", "pageGroup" or "legalPage" (by id), "block", "form" (by block), "slot", "link", "frame" or "list"; or one top-level "section" of the plan, such as site or mainMenu. Then it does one of:',
  '- "field": "<path>", "with": <new value>: replaces the value at that path inside the part. A path is keys and list positions joined by dots, such as says, hiddenSlots, story.2.step or footerMenu.1.heading.',
  '- "add": "<path of a list>", "with": <one entry>: adds that entry at the end of the list ("add": true when the section itself is the list, such as mainMenu).',
  '- "remove": "<path>": removes the value at that path inside the part. "remove": true removes the part itself (a slot, link, frame or list only).',
  '- "with" alone: replaces the whole part. Only for a part that must be rewritten as a whole; a large replacement that is mostly unchanged is sent back.',
  'Example: {"changes": [{"slot": "block-12.3", "field": "says", "with": "the opening hours"}, {"section": "site", "field": "footerMenu.1.heading", "with": "Visit"}, {"slot": "block-12.4", "remove": true}]}',
  'To move a slot from hiddenSlots to copy, remove it, then add it. Every part you do not name stays as it was.',
  ''
].join('\n')

/**
 * Sent once in a round whose change list could not be applied at all, or whose corrected edits (invalidChangesMessage)
 * still had invalid changes; its answer counts as the same round. Last resort, so a round cannot loop forever.
 */
export const WHOLE_PLAN_MESSAGE =
  'Your changes could not be applied. Answer with the whole plan as one JSON object, with nothing before or after it.\n'

/** The top-level sections of a plan (the prompt's output shape). */
export const PLAN_SECTIONS = Object.freeze([
  'version',
  'kit',
  'brief',
  'site',
  'pageGroups',
  'mainMenu',
  'sharedBlocks',
  'pages',
  'ownerTasks',
  'kitGaps'
])

const FENCE_WHOLE = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/i
const FENCE_ANY = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/gi

function parseObject(text) {
  let value
  try {
    value = JSON.parse(text.trim())
  } catch (error) {
    return {
      ok: false,
      error: `SITE_PLANNER_ANSWER_NOT_JSON: ${String(error?.message ?? error).slice(0, 200)}`
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, error: 'SITE_PLANNER_ANSWER_NOT_OBJECT: the answer is JSON but not one object' }
  return { ok: true, value }
}

/**
 * The JSON object in an answer: `{ ok, value, droppedText }`, or `{ ok: false, error }`. droppedText is true when
 * text around the one fenced block was dropped.
 */
export function objectOf(answer) {
  const text = String(answer).trim()
  const whole = parseObject(FENCE_WHOLE.exec(text)?.[1] ?? text)
  if (whole.ok) return { ...whole, droppedText: false }
  const blocks = [...text.matchAll(FENCE_ANY)]
  if (blocks.length !== 1) return whole
  const inner = parseObject(blocks[0][1])
  return inner.ok ? { ...inner, droppedText: true } : whole
}

/** True when the object is a change list rather than a plan. */
export const isChangeList = (value) => Object.keys(value).length === 1 && Object.hasOwn(value, 'changes')

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])

// The arrays of one block (a shared block, a page block) that hold parts with an id of their own.
function* blockParts(block) {
  yield ['slot', 'slot', block.copy]
  yield ['slot', 'slot', block.hiddenSlots]
  yield ['link', 'link', block.links]
  yield ['frame', 'frame', block.pictures]
  yield ['list', 'list', block.lists]
  for (const l of list(block.lists))
    for (const item of list(l?.items)) {
      if (!isObject(item)) continue
      yield ['slot', 'slot', item.copy]
      yield ['frame', 'frame', item.pictures]
    }
}

// Every array in the plan that holds parts with an id: [kind, id key, array].
function* partArrays(plan) {
  yield ['page', 'id', plan.pages]
  yield ['pageGroup', 'id', plan.pageGroups]
  if (isObject(plan.site)) {
    yield ['legalPage', 'id', plan.site.legalPages]
    yield ['form', 'block', plan.site.forms]
  }
  const blocks = [
    ...list(plan.sharedBlocks),
    ...list(plan.pages).flatMap((p) => (isObject(p) ? list(p.blocks) : []))
  ]
  yield ['block', 'block', plan.sharedBlocks]
  for (const p of list(plan.pages)) if (isObject(p)) yield ['block', 'block', p.blocks]
  for (const b of blocks) if (isObject(b)) yield* blockParts(b)
}

const KIND_KEYS = [...Object.keys(PART_KINDS), 'section']

/** The edits a change may make to the part it names; with none of them, "with" replaces the whole part. */
const OPS = ['field', 'add', 'remove']

/** Where the parts of one kind with one id are: [array, index] pairs. */
function locate(plan, kind, id) {
  const found = []
  for (const [k, key, arr] of partArrays(plan)) {
    if (k !== kind || !Array.isArray(arr)) continue
    arr.forEach((part, i) => {
      if (isObject(part) && part[key] === id) found.push([arr, i])
    })
  }
  return found
}

/** The one part of a kind with an id, or the reason there is not exactly one. */
function onlyOne(plan, kind, id, at) {
  const found = locate(plan, kind, id)
  if (found.length === 0) return { reason: `${at} names a ${kind} that does not exist: ${id.slice(0, 80)}` }
  if (found.length > 1)
    return { reason: `${at} names a ${kind} that is in the plan ${found.length} times: ${id.slice(0, 80)}` }
  return { at: found[0] }
}

// The part or section a change names: its kind, id and label, and how to read, replace or remove it.
function targetOf(plan, kind, id, at) {
  if (kind === 'section') {
    if (typeof id !== 'string' || !(PLAN_SECTIONS.includes(id) || Object.hasOwn(plan, id)))
      return { reason: `${at} names a section that does not exist: ${String(id).slice(0, 80)}` }
    return { kind, id, label: `section ${id}`, get: () => plan[id], set: (v) => (plan[id] = v) }
  }
  if (typeof id !== 'string' || !id) return { reason: `${at} names no ${kind} id` }
  const one = onlyOne(plan, kind, id, at)
  if (one.reason) return one
  const [arr, i] = one.at
  const remove = () => arr.splice(i, 1)
  return { kind, id, label: `${kind} ${id}`, get: () => arr[i], set: (v) => (arr[i] = v), remove }
}

/** One change applied to a plan, in place. Returns null, or the reason it cannot be applied. */
function applyOne(plan, change, n, replacements) {
  const at = `change ${n}`
  if (!isObject(change)) return `${at} is not an object`
  const ops = OPS.filter((k) => Object.hasOwn(change, k))
  if (ops.length > 1)
    return `${at} must name exactly one of field, add or remove, or none to replace the whole part`
  const named = KIND_KEYS.filter((k) => Object.hasOwn(change, k))
  if (named.length !== 1) return `${at} must name exactly one of ${KIND_KEYS.join(', ')}`
  const op = ops[0] ?? 'replace'
  if (op !== 'remove' && !Object.hasOwn(change, 'with')) return `${at} has no "with"`
  const allowed = [named[0], ...ops, ...(op === 'remove' ? [] : ['with'])]
  const extra = Object.keys(change).filter((k) => !allowed.includes(k))
  if (extra.length) return `${at} has keys it should not: ${extra.join(', ')}`
  const target = targetOf(plan, named[0], change[named[0]], at)
  if (target.reason) return target.reason
  return applyEdit(target, change, op, { n, at, replacements })
}

/**
 * The previous plan with a change list applied: `{ ok: true, plan, replacements }`, or `{ ok: false, reason }` when any
 * change cannot be applied (nothing is applied then). The previous plan is never modified. replacements measures every
 * value a change replaced (a whole part, a section or a field) for the size guard (plan-change-size.js).
 */
export function applyChanges(previous, changeList) {
  if (!isObject(previous)) return { ok: false, reason: 'there is no previous plan to apply changes to' }
  const changes = changeList?.changes
  if (!Array.isArray(changes) || !changes.length)
    return { ok: false, reason: '"changes" must be a list with at least one change' }
  const plan = structuredClone(previous)
  const replacements = []
  for (const [n, change] of changes.entries()) {
    const reason = applyOne(plan, change, n, replacements)
    if (reason) return { ok: false, reason }
  }
  return { ok: true, plan, replacements }
}

const NO_KEY = Symbol('no key')

/** The part a change names, as one string key, or NO_KEY when it names none or several. */
function partKeyOf(change) {
  if (!isObject(change)) return NO_KEY
  const named = KIND_KEYS.filter((k) => Object.hasOwn(change, k))
  if (named.length !== 1 || typeof change[named[0]] !== 'string') return NO_KEY
  return `${named[0]}:${change[named[0]]}`
}

/** The path a change edits inside its part, or null when it edits the whole part (or does not name one). */
function pathKeyOf(change) {
  for (const op of OPS) {
    const v = change[op]
    if (typeof v === 'string') return (pathSteps(v) ?? [v]).join('.')
  }
  return null
}

const overlaps = (a, b) =>
  a === null || b === null || a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`)

/**
 * The previous plan with every valid change of a list applied, in order, and the invalid ones set aside:
 * `{ ok: true, plan, replacements, applied, rejected, validChanges }`, where rejected is `[{ index, reason, change }]`
 * and validChanges the changes that were applied. `{ ok: false, reason }` only when there is no usable list (no
 * previous plan, "changes" empty or not a list). The previous plan is never modified.
 *
 * Order dependence: a later change that edits the same part as a rejected earlier change, at the same path or one
 * above or below it (or anywhere in the part when either change replaces the whole part), is not applied either and
 * is rejected as depending on that change. Applying it alone could leave the part in a state the planner never
 * intended (a remove that was rejected, then an add on the same slot). It is sent back with the others, so the
 * corrected edits restate both. Changes on other parts, or other paths of the same part, are unaffected.
 */
export function applyValidChanges(previous, changeList) {
  if (!isObject(previous)) return { ok: false, reason: 'there is no previous plan to apply changes to' }
  const changes = changeList?.changes
  if (!Array.isArray(changes) || !changes.length)
    return { ok: false, reason: '"changes" must be a list with at least one change' }
  const plan = structuredClone(previous)
  const replacements = []
  const rejected = []
  const validChanges = []
  const blocked = [] // [part key, path or null, index of the rejected change]
  for (const [n, change] of changes.entries()) {
    const key = partKeyOf(change)
    const path = isObject(change) ? pathKeyOf(change) : null
    const dependsOn = key === NO_KEY ? undefined : blocked.find(([k, p]) => k === key && overlaps(p, path))
    const reason = dependsOn
      ? `change ${n} depends on change ${dependsOn[2]}, which was rejected (it edits the same part)`
      : applyOne(plan, change, n, replacements)
    if (!reason) {
      validChanges.push(change)
      continue
    }
    rejected.push({ index: n, reason, change })
    if (key !== NO_KEY) blocked.push([key, path, n])
  }
  return { ok: true, plan, replacements, applied: validChanges.length, rejected, validChanges }
}

const MAX_LISTED = 40
const CHANGE_TEXT_CHARS = 300
const REASON_CHARS = 300

const clip = (text, n) => (text.length > n ? `${text.slice(0, n)}...` : text)

/** Sent once in a round when some changes were applied and some were not: only the invalid ones come back. */
export function invalidChangesMessage(rejected, applied) {
  const shown = rejected.slice(0, MAX_LISTED)
  const more = rejected.slice(MAX_LISTED).map((r) => r.index)
  return [
    `${applied} of your changes were applied. ${rejected.length} could not be applied and were left out:`,
    ...shown.map(
      (r) =>
        `- change ${r.index}: ${clip(r.reason, REASON_CHARS)}\n  ${clip(JSON.stringify(r.change) ?? 'undefined', CHANGE_TEXT_CHARS)}`
    ),
    ...(more.length ? [`- and ${more.length} more rejected changes: ${more.join(', ')}`] : []),
    'Answer with only the corrected edits for these changes, as one JSON object {"changes": [...]} in the same format, with nothing before or after it. Do not resend the changes that were applied, and do not send the whole plan.',
    ''
  ].join('\n')
}
