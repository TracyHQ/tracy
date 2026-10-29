// Tabs bound to offerings, and the labels of a fact the plan empties (spec TracyHQ/tracy#189, round 9): decided before any
// writer runs, the same on every CMS.
//
//   offering tabs  a step collection the content map declares `presentation: "offering-tabs"` shows the brief's offerings,
//                  one per tab, in the brief's order: the tab's title is the offering's name as given (a shorter form of
//                  its own words when the box is narrower), up to the template's capacity. A tab beyond the offerings,
//                  or one no form of the name fits, is taken off; offerings beyond the tabs are not in this block (the
//                  offering list and pages carry them: the overflow rule of every offering collection).
//   labels         a slot that declares `labelOf: "<slot key>"` is the label in front of that value ("Email:" before a
//                  mailbox): when the plan empties the value, its label goes with it, so no "or call" leans on a line
//                  that is gone.
//
// 🔒 THE ROLE AND THE DECLARATION DECIDE, never a template's name or module id. Measured 30/10/2026 on a brief build of a
// Joomla T4 template: the tab row read "First visit / Serve / Padel / Swimming" with a fourth offering missing, and a
// booking row read "or give us a call" under a mailbox line that had been emptied.
import { collectionOfGroupId } from './content-map-repeatable-lists.mjs'
import { shortOfferingName } from './offering-short-name.mjs'

const list = (v) => (Array.isArray(v) ? v : [])

/** The offering-tab groups of a map, by collection, each ordered by item: `{id, item, slots}`. */
function tabCollectionsOf(contentMap) {
  const demoOnly = new Set(
    list(contentMap?.entities)
      .filter((e) => e?.demoOnly === true)
      .map((e) => e.key)
  )
  /** @type {Map<string, Map<string, {id: string, item: number, slots: any[]}>>} */
  const collections = new Map()
  for (const slot of list(contentMap?.slots)) {
    const g = slot?.group
    if (g?.kind !== 'step' || g.presentation !== 'offering-tabs' || demoOnly.has(slot.entity)) continue
    const collection = collectionOfGroupId(g.id) ?? `${slot.entity}:tabs`
    const groups = collections.get(collection) ?? new Map()
    const group = groups.get(g.id) ?? { id: g.id, item: Number(g.item) || 0, slots: [] }
    group.slots.push(slot)
    groups.set(g.id, group)
    collections.set(collection, groups)
  }
  return [...collections].map(([collection, groups]) => ({
    collection,
    groups: [...groups.values()].sort((a, b) => a.item - b.item)
  }))
}

/**
 * @param {any} contentMap
 * @param {Array<{id: string, label: string}>} offerings - the brief's offerings in its order (`offeringsOfBrief`)
 * @param {{limitOf: (slot: any) => number, placeOf: (contentMap: any, group: any) => any}} how - the honesty plan's own
 *   character limit of a slot and place of a card
 * @returns {{records: any[], values: Record<string, {value: string, reason: string, evidence: string}>,
 *   cardNames: Record<string, string>}}
 */
export function planOfferingTabs(contentMap, offerings, { limitOf, placeOf }) {
  const records = []
  const values = {}
  const cardNames = {}
  for (const { collection, groups } of tabCollectionsOf(contentMap))
    groups.forEach((group, n) => {
      const record = { group: group.id, collection, kind: 'step', item: n }
      const assigned = offerings[n] ?? null
      const titles = group.slots.filter((s) => s.role === 'step.title' && s.type === 'text')
      if (!assigned) {
        records.push({ ...record, decision: 'hide', reason: 'no-brief-offering', place: placeOf(contentMap, group) })
        return
      }
      const limit = titles.length ? Math.min(...titles.map(limitOf)) : Number.POSITIVE_INFINITY
      const name = [...assigned.label].length <= limit ? assigned.label : shortOfferingName(assigned.label, limit)
      if (!name) {
        records.push({
          ...record,
          decision: 'hide',
          reason: 'offering-name-unavailable',
          assigned: { id: assigned.id, label: assigned.label },
          place: placeOf(contentMap, group)
        })
        return
      }
      records.push({
        ...record,
        decision: 'keep',
        reason: 'brief-offering',
        assigned: { id: assigned.id, label: assigned.label }
      })
      cardNames[group.id] = assigned.label
      for (const slot of titles)
        values[slot.key] = {
          value: name,
          reason: name === assigned.label ? 'brief-offering' : 'brief-offering-short',
          evidence: assigned.label
        }
    })
  return { records, values, cardNames }
}

/**
 * The label slots whose value the plan empties: every slot declaring `labelOf` a blanked key.
 * @param {any} contentMap
 * @param {Iterable<string>} blanked - the keys the plan empties
 * @returns {any[]} the label slots, not yet blanked themselves
 */
export function labelsOfBlanks(contentMap, blanked) {
  const gone = new Set(blanked)
  return list(contentMap?.slots).filter(
    (s) => typeof s?.labelOf === 'string' && gone.has(s.labelOf) && !gone.has(s.key)
  )
}
