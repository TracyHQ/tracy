// 🔒 THE BRIEF DECIDES WHAT THE SITE HAS, THE TEMPLATE ONLY GIVES THE LAYOUT (COO principle 30/10/2026, criteria 1.4 and
// 4.1, spec TracyHQ/tracy#189, R12 group C). The honesty plan's rules for the fact-bearing items a template repeats beyond
// its offering and people cards:
//   - a RECORD LIST (an entity that declares `lists: <kind>`, such as a "more classes" list of articles) shows as many records
//     as the brief holds of that kind, never the template's count; with none the list is taken off whole. Its current page's
//     own item is hidden by the CMS's current-item marker (`outside-map.mjs` `currentItems`), so a related list shows the
//     real siblings only;
//   - a VIDEO TILE (an item that carries a `business.video` slot) the brief has no playable video for is taken off, never
//     kept as a still with a written title;
//   - a SOCIAL ITEM on a kept person's own record is taken off whole (its icon with its link): the brief holds no person's
//     profile, and an icon left with an emptied link points at the page it sits on. The business's own networks never stand
//     in for a person's (`personSocials`: the lists the business's social row leaves alone).
// Each item goes with the template's own hide mechanism (`hidePlaceOf`: an item of a list, or an entity of its own); an item
// the site cannot take off is left to the rules that already empty it. Pure: no template, trade or business is named.
import { planVideos } from './outside-map.mjs'

/** The group kinds whose records a list may show, and the brief's records of each. */
const OFFERING_KINDS = new Set(['service', 'product', 'room', 'package'])
const SOCIAL_ROLE = /^(contact|person)\.social_/

/** Every reason code these decisions carry, with the sentence a report shows for it. */
export const BRIEF_ITEM_REASONS = Object.freeze({
  'brief-record-count': 'the list shows as many records as the brief holds',
  'no-brief-records': 'the brief holds no record this list could show',
  'no-brief-video': 'the brief holds no video this tile could play',
  'no-brief-person-social': 'the brief holds no social profile of this person'
})

/**
 * The planned count of every record list: the brief's records of the kind it lists.
 * @param {{entities?: any[]} | null} contentMap
 * @param {{offerings: any[], people: any[]}} brief - the brief's showable offerings and people
 * @returns {Array<{entity: string, kind: string, count: number, decision: 'keep' | 'hide', reason: string}>}
 */
export function planRecordLists(contentMap, { offerings, people }) {
  return (contentMap?.entities ?? [])
    .filter((e) => typeof e?.lists === 'string' && e.demoOnly !== true)
    .map((e) => {
      const count = e.lists === 'person' ? people.length : OFFERING_KINDS.has(e.lists) ? offerings.length : 0
      return {
        entity: e.key,
        kind: e.lists,
        count,
        decision: count > 0 ? 'keep' : 'hide',
        reason: count > 0 ? 'brief-record-count' : 'no-brief-records'
      }
    })
}

/**
 * The items the brief holds nothing for, as honesty records to hide, with the slots no writer must word.
 * @param {object} input
 * @param {any} input.contentMap
 * @param {any} input.brief
 * @param {any[]} input.groups - the content map's groups (`{id, kind, slots}`)
 * @param {Set<string>} input.personEntities - the entities of the kept people's own records
 * @param {(contentMap: any, groupId: string) => any} input.placeOf - the template's own place to take a group off
 * @returns {{records: any[], personSocials: string[]}}
 */
export function briefItemHides({ contentMap, brief, groups, personEntities, placeOf }) {
  const records = []
  const still = new Set(
    planVideos({ contentMap, brief })
      .filter((v) => v.decision === 'still')
      .map((v) => v.key)
  )
  const hide = (group, reason) => {
    const place = placeOf(contentMap, group.id)
    if (place.how === 'none') return false
    records.push({ group: group.id, kind: group.kind, decision: 'hide', reason, place })
    return true
  }
  for (const group of groups) {
    const videos = group.slots.filter((s) => s.role === 'business.video')
    if (videos.length > 0 && videos.every((s) => still.has(s.key))) hide(group, 'no-brief-video')
  }
  const personSocials = new Set()
  for (const group of groups) {
    const entity = group.slots[0]?.entity
    if (!personEntities.has(entity) || group.kind === 'person') continue
    if (!group.slots.some((s) => SOCIAL_ROLE.test(s.role ?? ''))) continue
    personSocials.add(entity)
    hide(group, 'no-brief-person-social')
  }
  return { records, personSocials: [...personSocials] }
}
