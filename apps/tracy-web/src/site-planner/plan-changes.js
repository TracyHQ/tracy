// Reading the site planner's answer, and the change lists of fix rounds (ADR 0041, #301). Pure: text and plans in,
// a plan or a reason out.
//
// An answer is one JSON object, bare or in one markdown code fence around the whole answer. An answer with text
// around exactly one fenced block whose content is one JSON object is read as that block, and the dropped text is
// recorded. Two fenced blocks or none stay unread.
//
// In a fix round the planner may answer with only the parts it changes: { "changes": [ ... ] }. Each change replaces
// one whole part of the previous plan, named by exactly one kind key (see PART_KINDS), or one whole top-level section.
// Every other part stays as it was. A change list that names a part that is not there (or more than one), or whose
// replacement is malformed, is not applied: the server then asks once for the whole plan.

/** Appended after the failure list of a fix round. */
export const CHANGES_INSTRUCTION = [
  '',
  'Answer with only the parts of the plan you change, as one JSON object {"changes": [...]}, with nothing before or after it.',
  'Each change replaces one whole part, named by one key and its id:',
  '{"page": "<id>", "with": {...}}, and likewise "pageGroup" and "legalPage" (by id), "block", "form" (by block), "slot", "link", "frame" or "list";',
  'or {"section": "<top-level key of the plan, such as site, mainMenu, pageGroups, ownerTasks or kitGaps>", "with": <its whole value>}.',
  '"with" is the whole new part with the same id. To add or remove a part, replace the part or section that holds it.',
  'Every part you do not name stays as it was.',
  ''
].join('\n')

/** Sent once in a round whose change list could not be applied; its answer counts as the same round. */
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

/** The kinds a change may name, and the key that holds each kind's id. */
export const PART_KINDS = Object.freeze({
  page: 'id',
  pageGroup: 'id',
  legalPage: 'id',
  block: 'block',
  form: 'block',
  slot: 'slot',
  link: 'link',
  frame: 'frame',
  list: 'list'
})

const KIND_KEYS = [...Object.keys(PART_KINDS), 'section']

/** One change applied to a plan, in place. Returns null, or the reason it cannot be applied. */
function applyOne(plan, change, n) {
  const at = `change ${n}`
  if (!isObject(change)) return `${at} is not an object`
  const named = KIND_KEYS.filter((k) => Object.hasOwn(change, k))
  if (named.length !== 1) return `${at} must name exactly one of ${KIND_KEYS.join(', ')}`
  if (!Object.hasOwn(change, 'with')) return `${at} has no "with"`
  const extra = Object.keys(change).filter((k) => k !== named[0] && k !== 'with')
  if (extra.length) return `${at} has keys it should not: ${extra.join(', ')}`
  const kind = named[0]
  const id = change[kind]
  const replacement = change.with
  if (kind === 'section') {
    if (typeof id !== 'string' || !(PLAN_SECTIONS.includes(id) || Object.hasOwn(plan, id)))
      return `${at} names a section that does not exist: ${String(id).slice(0, 80)}`
    if (Object.hasOwn(plan, id) && Array.isArray(plan[id]) !== Array.isArray(replacement))
      return `${at} replaces section ${id} with a value of another type`
    if (replacement === undefined) return `${at} has no value for section ${id}`
    plan[id] = replacement
    return null
  }
  if (typeof id !== 'string' || !id) return `${at} names no ${kind} id`
  const idKey = PART_KINDS[kind]
  if (!isObject(replacement) || replacement[idKey] !== id)
    return `${at} must replace ${kind} ${id} with one object whose ${idKey} is ${id}`
  const found = []
  for (const [k, key, arr] of partArrays(plan)) {
    if (k !== kind || !Array.isArray(arr)) continue
    arr.forEach((part, i) => {
      if (isObject(part) && part[key] === id) found.push([arr, i])
    })
  }
  if (found.length === 0) return `${at} names a ${kind} that does not exist: ${id.slice(0, 80)}`
  if (found.length > 1)
    return `${at} names a ${kind} that is in the plan ${found.length} times: ${id.slice(0, 80)}`
  const [arr, i] = found[0]
  arr[i] = replacement
  return null
}

/**
 * The previous plan with a change list applied: `{ ok: true, plan }`, or `{ ok: false, reason }` when any change cannot
 * be applied (nothing is applied then). The previous plan is never modified.
 */
export function applyChanges(previous, changeList) {
  if (!isObject(previous)) return { ok: false, reason: 'there is no previous plan to apply changes to' }
  const changes = changeList?.changes
  if (!Array.isArray(changes) || !changes.length)
    return { ok: false, reason: '"changes" must be a list with at least one change' }
  const plan = structuredClone(previous)
  for (const [n, change] of changes.entries()) {
    const reason = applyOne(plan, change, n)
    if (reason) return { ok: false, reason }
  }
  return { ok: true, plan }
}
