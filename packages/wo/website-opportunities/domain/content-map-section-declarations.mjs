// The section declarations of a content map (spec TracyHQ/tracy#189, round 9), checked with its slot roles:
//
//   entity "lists": "<group kind>"          what a section that lists records it does not hold shows (an article list)
//   group "presentation": "<presentation>"  how a step collection is written: a process, tabs bound to offerings, or the
//                                           outline of one session of the page's offering
//   slot "labelOf": "<slot key>"            the label in front of that value: it goes when the value is emptied
import { isGroupKind } from './place-content-roles.mjs'

/** The presentations a step group may declare. */
export const STEP_PRESENTATIONS = Object.freeze(['process', 'offering-tabs', 'session-outline'])

const list = (v) => (Array.isArray(v) ? v : [])

/**
 * What is wrong with a map's section declarations (empty: nothing, or it declares none).
 * @param {any} contentMap
 * @returns {string[]}
 */
export function sectionDeclarationProblems(contentMap) {
  const out = []
  const version = contentMap?.roleVocabularyVersion
  for (const entity of list(contentMap?.entities))
    if (entity && Object.hasOwn(entity, 'lists') && !isGroupKind(entity.lists, version))
      out.push(`entity "${entity.key}" lists ${JSON.stringify(entity.lists)}, which is not a group kind`)
  const slots = list(contentMap?.slots)
  const byKey = new Map(slots.map((s) => [s?.key, s]))
  for (const slot of slots) {
    const presentation = slot?.group?.presentation
    if (presentation !== undefined) {
      if (slot.group.kind !== 'step')
        out.push(`slot "${slot.key}" declares presentation on a ${slot.group.kind} group; only a step group has one`)
      else if (!STEP_PRESENTATIONS.includes(presentation))
        out.push(`slot "${slot.key}" presentation ${JSON.stringify(presentation)} is not one of ${STEP_PRESENTATIONS.join(', ')}`)
    }
    if (slot && Object.hasOwn(slot, 'labelOf')) {
      const target = byKey.get(slot.labelOf)
      if (!target || target === slot) out.push(`slot "${slot.key}" labelOf ${JSON.stringify(slot.labelOf)} is not another slot of the map`)
      else if (target.group?.id !== slot.group?.id)
        out.push(`slot "${slot.key}" labelOf "${slot.labelOf}" is not in its group`)
    }
  }
  return out
}
