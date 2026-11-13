// Every stored place of the content map is accounted for (ticket #583): anything a visitor can see that is not
// declared is invisible to the system (the blank site step does not empty it, the build does not overwrite it), so a
// demo word would stay on a customer's site. Pure. Each content map slot is exactly one of:
//   - a field place: the `slot` of a field, a `slots` place of an item field or of a child field (nested lists too);
//   - a report entry: `derived`, `unlisted` with a class, `omitted`, `sparse` (draft-blocks.mjs);
//   - outside the store, with a class (`decisions.outsideStore`, by content map key or by entity): a value of a
//     record no store block draws from that survives in the blank site (a trashed module, a template string);
//   - removed with its page: a record of an entity kind the blank site step deletes (`decisions.removedWithPage`,
//     `{<entity kind>: {why, except?: [entity keys the step keeps]}}`).
// A slot that is none of these is unaccounted, and draft.mjs refuses to write the declarations.
import { UNLISTED_CLASSES } from './draft-design-fields.mjs'
import { childPlacesOf } from './draft-child-lists.mjs'
import { mapKeyOf } from './draft-fields.mjs'

/** Every stored place the blocks declare as a field. */
export function fieldPlacesOf(blocks) {
  const places = new Set()
  for (const b of blocks) {
    for (const f of [...(b.fields ?? []), ...(b.itemFields ?? [])]) {
      if (f.slot) places.add(f.slot)
      for (const s of f.slots ?? []) places.add(s)
    }
    // A place inside a stored HTML value (`<key>@<xpath>`) accounts for that value.
    for (const s of [...childPlacesOf(b.lists), ...childPlacesOf(b.itemLists)]) places.add(s.split('@')[0])
  }
  return places
}

const REPORT_CLASSES = ['derived', 'unlisted', 'omitted', 'sparse']

/** The report class of each stored place a report entry names (the first class wins). */
function reportPlacesOf(report) {
  const byPlace = new Map()
  const put = (key, cls) => {
    if (key && !byPlace.has(mapKeyOf(key))) byPlace.set(mapKeyOf(key), cls)
  }
  for (const e of report.derived ?? []) put(e.slot, 'derived')
  for (const e of report.unlisted ?? []) if (UNLISTED_CLASSES.includes(e.as)) put(e.slot, 'unlisted')
  for (const e of report.omitted ?? []) put(e.slot, 'omitted')
  for (const e of report.sparse ?? []) for (const s of e.slots ?? []) put(s, 'sparse')
  return byPlace
}

/**
 * Accounts for every slot of the content map, and lists in `report.outsideStore` the classed values of records no
 * store block draws from.
 * @param {{contentMap: object, blocks: object[], report: object, decisions: object}} input
 * @returns {{total: number, fields: number, report: Record<string, number>, outsideStore: number, removedWithPage: Record<string, number>, unaccounted: string[]}}
 */
export function accountForPlaces({ contentMap, blocks, report, decisions = {} }) {
  const kindOf = new Map((contentMap.entities ?? []).map((e) => [e.key, e.kind]))
  const fields = fieldPlacesOf(blocks)
  const reported = reportPlacesOf(report)
  const removed = decisions.removedWithPage ?? {}
  const outside = decisions.outsideStore ?? {}
  const coverage = {
    total: 0,
    fields: 0,
    report: Object.fromEntries(REPORT_CLASSES.map((c) => [c, 0])),
    outsideStore: 0,
    removedWithPage: {},
    unaccounted: []
  }
  report.outsideStore = []
  for (const slot of contentMap.slots ?? []) {
    coverage.total++
    if (fields.has(slot.key)) {
      coverage.fields++
      continue
    }
    const cls = reported.get(slot.key)
    if (cls) {
      coverage.report[cls]++
      continue
    }
    const decided = outside[slot.key] ?? outside[slot.entity]
    if (decided) {
      if (!UNLISTED_CLASSES.includes(decided.as) || !decided.why) {
        coverage.unaccounted.push(slot.key)
        continue
      }
      coverage.outsideStore++
      report.outsideStore.push({ slot: slot.key, entity: slot.entity, as: decided.as, why: decided.why })
      continue
    }
    const kind = kindOf.get(slot.entity) ?? String(slot.entity).split('-')[0]
    const rule = removed[kind]
    if (rule?.why && !(rule.except ?? []).includes(slot.entity)) {
      coverage.removedWithPage[kind] = (coverage.removedWithPage[kind] ?? 0) + 1
      continue
    }
    coverage.unaccounted.push(slot.key)
  }
  return coverage
}
