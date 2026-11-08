// Plan labels (ADR 0042, decision of 2026-11-04): the short fixed texts the planner gives a slot in `copy[].text`
// (menu names, button texts, short headings). The planner's label is a suggestion, not the final text: the writer
// reads it beside what the kit says about the slot (its demo sample, role, limit and the block it prints in) and the
// planner's `says`, keeps it when it fits and rewrites it when the slot is something else (a heading that must stand
// alone). Code records what happened on the copy entry: `owner: "plan-label"` when the plan's words are kept,
// `owner: "writer"` with `replacedPlanLabel` when the writer's text replaced them. Pure: inputs in, new objects out.
import { planCopyEntries } from '../lib/site-copy/main-menu.js'
import { kitSlotsWithBlock } from '../lib/template-kit/kit-slots.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The copy entry field that records the plan label a writer text replaced. */
export const REPLACED_PLAN_LABEL = 'replacedPlanLabel'

// The copy entry of the plan for a slot, with its says and limit (planCopyEntries keeps only block, slot and text).
function planEntryOf(plan, slot) {
  const decisions = [
    ...arr(plan?.sharedBlocks),
    ...arr(plan?.pages)
      .filter((p) => isObject(p) && p.decision === 'keep')
      .flatMap((p) => arr(p.blocks))
  ].filter((d) => isObject(d) && d.decision !== 'hide')
  for (const d of decisions)
    for (const c of [
      ...arr(d.copy),
      ...arr(d.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.copy)))
    ])
      if (isObject(c) && c.slot === slot) return c
  return null
}

const smaller = (a, b) =>
  typeof a === 'number' && typeof b === 'number' ? Math.min(a, b) : typeof a === 'number' ? a : (b ?? null)

// Where the slot prints, from the kit and the content map: its block, and the menus and page titles it also changes.
function printsOf(kitEntry, contentMap, slot) {
  const block = kitEntry?.block
  const also = kitEntry?.slot?.alsoChanges
  const entityKey = arr(contentMap?.slots).find((s) => s?.key === slot)?.entity
  const entity = entityKey ? arr(contentMap?.entities).find((e) => e?.key === entityKey) : null
  return {
    block: block?.id ?? null,
    blockRole: block?.role ?? null,
    ...(arr(also?.menus).length ? { alsoInMenus: also.menus } : {}),
    ...(arr(also?.pageTitles).length ? { alsoPageTitleOf: also.pageTitles } : {}),
    ...(entity?.kind === 'menuItem' ? { menuItem: true } : {})
  }
}

/**
 * Every plan label slot the writer reads, in plan order, once each: the planner's label (a suggestion), its `says`,
 * and from the kit the demo `sample`, `role`, `maxCharacters` (the smaller of the kit's and the plan's) and where it
 * prints.
 * @param {{ plan: object, kit: object, contentMap?: object | null }} input
 */
export function planLabelSlots({ plan, kit, contentMap = null }) {
  const kitSlots = kitSlotsWithBlock(kit)
  const seen = new Set()
  const out = []
  for (const e of planCopyEntries(plan)) {
    if (e.text === null || seen.has(e.slot)) continue
    seen.add(e.slot)
    const planned = planEntryOf(plan, e.slot)
    const k = kitSlots.get(e.slot)
    out.push({
      slot: e.slot,
      planLabel: e.text,
      says: typeof planned?.says === 'string' ? planned.says : '',
      sample: k?.slot.sample ?? '',
      role: k?.slot.role ?? null,
      maxCharacters: smaller(k?.slot.maxCharacters, planned?.maxCharacters),
      prints: printsOf(k, contentMap, e.slot)
    })
  }
  return out
}

const joined = (text) =>
  (Array.isArray(text) ? text.join(' ') : String(text ?? '')).replace(/\s+/g, ' ').trim()

/**
 * The copy entry of a label slot the writer wrote: the plan's words as `plan-label` when the writer kept them (the
 * same text, spaces aside), else the writer's text as `writer` with the plan label it replaced.
 * @param {{ slot: string, text: unknown, factIds?: string[] }} written the writer's entry
 * @param {{ label: string, factIds: string[] }} planned the plan's label slot (copy check index entry)
 */
export function labelSlotEntry(written, planned) {
  // An emphasis rides along either way: a kept label may still mark its accent words (ADR 0042 section 11).
  const emphasis = typeof written.emphasis === 'string' ? { emphasis: written.emphasis } : {}
  if (joined(written.text) === joined(planned.label))
    return {
      slot: written.slot,
      owner: 'plan-label',
      text: planned.label,
      factIds: [...planned.factIds],
      ...emphasis
    }
  return {
    slot: written.slot,
    owner: 'writer',
    text: written.text,
    factIds: Array.isArray(written.factIds) ? written.factIds : [...planned.factIds],
    [REPLACED_PLAN_LABEL]: planned.label,
    ...emphasis
  }
}
