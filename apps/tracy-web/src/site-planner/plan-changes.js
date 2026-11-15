// The site planner's answers and the change lists of its fix rounds (ADR 0041, #301): the planner's part of the shared
// change machinery (lib/bench-answer.js, lib/bench-changes.js, lib/bench-change-edits.js; #327). Pure.
//
// A change names one part of the previous plan by exactly one kind key (see PART_KINDS) or one top-level section of
// the plan (PLAN_SECTIONS). Every valid change is applied, and only the rejected ones are sent back, once, for
// corrected edits. Only when that does not work, or the answer is not a usable change list at all, does the bench ask
// for the whole plan. A list whose replacements resend much of the plan unchanged is refused once by the run loop
// (plan-change-size.js).
import { objectOf as objectOfAnswer } from '../lib/bench-answer.js'
import { changeRules, invalidChangesMessage as invalidChangesMessageFor } from '../lib/bench-changes.js'

export { isChangeList } from '../lib/bench-answer.js'

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

/** The kinds a change may remove whole: entries inside a block, never a page, group or block (those carry decisions). */
const REMOVABLE = Object.freeze(['slot', 'link', 'frame', 'list'])

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

/** Every string of `value` that is exactly a key of `renames`, replaced by its new id. Pure. */
function renamed(value, renames) {
  if (typeof value === 'string') return renames.get(value) ?? value
  if (Array.isArray(value)) return value.map((v) => renamed(v, renames))
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renamed(v, renames)]))
  return value
}

/**
 * A page given another id by a fix round: the shared edits never change a part's id (the id names the part), so neither
 * `{"page": X, "field": "id", "with": Y}` nor a whole page replaced under a new id could be applied, and the round fell
 * back to the whole plan (15/11/2026, local stand: a planner renaming four invented pages back to the kit's ids was
 * refused both ways and rewrote its whole plan, 3.5 minutes). Here such a change renames the page first, and every place
 * the plan names the page (menus, groups, links, end actions) follows; a whole page given under the new id then replaces
 * it. Only to an id no page of the plan has; the plan check judges the new id like any other.
 * @returns {{ previous: object, changeList: object, renames: object[] }} `renames`: the changes it applied as renames
 */
function withPageRenames(previous, changeList) {
  const changes = list(changeList?.changes)
  const taken = new Set(list(previous?.pages).map((p) => p?.id))
  const renames = new Map()
  const rest = []
  const done = []
  for (const change of changes) {
    const from = isObject(change) && typeof change.page === 'string' ? change.page : null
    const whole = isObject(change) && !('field' in change) && !('add' in change) && !('remove' in change)
    const to =
      change?.field === 'id' && typeof change.with === 'string'
        ? change.with
        : // A whole page under a new id is a rename only when it is a page, with its decision; anything else is refused.
          whole &&
            isObject(change.with) &&
            typeof change.with.id === 'string' &&
            change.with.id !== from &&
            typeof change.with.decision === 'string'
          ? change.with.id
          : null
    if (from && to && taken.has(from) && !taken.has(to) && !renames.has(from)) {
      renames.set(from, to)
      taken.delete(from)
      taken.add(to)
      if (change.field !== 'id') rest.push({ ...change, page: to })
      else done.push(change)
      continue
    }
    rest.push(change)
  }
  if (!renames.size) return { previous, changeList, renames: [] }
  return {
    previous: renamed(previous, renames),
    changeList: { ...changeList, changes: rest },
    renames: done
  }
}

const sharedRules = changeRules({
  partKinds: PART_KINDS,
  removable: REMOVABLE,
  sections: PLAN_SECTIONS,
  partArrays,
  noun: 'plan'
})

/** The planner's change rules, for the shared run loop (bench-worker.js): the shared rules, with page renames first. */
export const PLAN_CHANGE_RULES = Object.freeze({
  ...sharedRules,
  applyChanges(previous, changeList) {
    const at = withPageRenames(previous, changeList)
    // A list of renames only leaves nothing for the shared rules, which refuse an empty list.
    if (at.renames.length && !at.changeList.changes.length)
      return { ok: true, doc: structuredClone(at.previous), replacements: [] }
    return sharedRules.applyChanges(at.previous, at.changeList)
  },
  applyValidChanges(previous, changeList) {
    const at = withPageRenames(previous, changeList)
    if (!at.renames.length && at.changeList === changeList)
      return sharedRules.applyValidChanges(previous, changeList)
    const out = at.changeList.changes.length
      ? sharedRules.applyValidChanges(at.previous, at.changeList)
      : {
          ok: true,
          doc: structuredClone(at.previous),
          replacements: [],
          applied: 0,
          rejected: [],
          validChanges: []
        }
    if (!out.ok) return out
    // A rejected change keeps its index in the list the planner sent: the renames taken out shift the rest.
    const sent = list(changeList?.changes)
    const index = (i) => {
      const c = at.changeList.changes[i]
      const at0 = sent.indexOf(c)
      return at0 >= 0 ? at0 : sent.findIndex((x) => isObject(x) && isObject(c) && x.with === c.with)
    }
    return {
      ...out,
      applied: out.applied + at.renames.length,
      validChanges: [...at.renames, ...out.validChanges],
      rejected: out.rejected.map((r) => ({ ...r, index: index(r.index) }))
    }
  }
})

/** The planner's answer read as one JSON object (lib/bench-answer.js), with SITE_PLANNER error codes. */
export const objectOf = (answer) => objectOfAnswer(answer, { codePrefix: 'SITE_PLANNER' })

const asPlan = ({ doc, ...rest }) => (rest.ok ? { ok: true, plan: doc, ...rest } : rest)

/**
 * The previous plan with a change list applied: `{ ok: true, plan, replacements }`, or `{ ok: false, reason }` when any
 * change cannot be applied (nothing is applied then). The previous plan is never modified.
 */
export const applyChanges = (previous, changeList) =>
  asPlan(PLAN_CHANGE_RULES.applyChanges(previous, changeList))

/**
 * The previous plan with every valid change of a list applied and the invalid ones set aside:
 * `{ ok: true, plan, replacements, applied, rejected, validChanges }`, or `{ ok: false, reason }` when there is no
 * usable list (lib/bench-changes.js applyValidChanges).
 */
export const applyValidChanges = (previous, changeList) =>
  asPlan(PLAN_CHANGE_RULES.applyValidChanges(previous, changeList))

/** Sent once in a round when some changes were applied and some were not: only the invalid ones come back. */
export const invalidChangesMessage = (rejected, applied) =>
  invalidChangesMessageFor(rejected, applied, { noun: 'plan' })
