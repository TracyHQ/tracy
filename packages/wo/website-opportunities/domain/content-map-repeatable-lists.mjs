// Repeatable lists of a quickstart content map (ADR 0040, `place-content-roles/3` maps only).
//
// A repeated block (a menu's dishes, a club's packages, a gallery) is a collection of role groups whose ids share a
// stem and end in their item number (`module-503.item.0`, `module-503.item.1`, the collection `module-503.item`, as
// `fitGroups` of ADR 0039 names it). The demo shows a fixed number of items; a repeatable list says the build may grow
// or shrink it to the business's real data, copying one item as the template for every item it adds:
//
//   "repeatableLists": {
//     "module-503.item": { "itemTemplate": "module-503.item.0", "min": 1, "max": null }
//   }
//            itemTemplate  the id of a group of the collection: its slots are copied for each item added
//            min           the fewest items the layout holds (a whole number from 0)
//            max           the most items the layout holds (a whole number from 1, at least min), null for no limit
import { ROLE_VOCABULARY_V3 } from './place-content-roles.mjs'

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** The collection a group id belongs to: the id without its trailing item number, or null when it has none. */
export function collectionOfGroupId(id) {
  const match = typeof id === 'string' ? /^(.+)\.\d+$/.exec(id) : null
  return match ? match[1] : null
}

/**
 * What is wrong with a map's repeatable lists (empty: nothing, or it declares none).
 * @param {any} contentMap
 * @param {Map<string, {kind: string}>} groups the map's groups by id, as the role check read them
 * @returns {string[]}
 */
export function repeatableListProblems(contentMap, groups) {
  if (!contentMap || !Object.hasOwn(contentMap, 'repeatableLists')) return []
  const lists = contentMap.repeatableLists
  if (contentMap.roleVocabularyVersion !== ROLE_VOCABULARY_V3)
    return [`repeatableLists needs roleVocabularyVersion "${ROLE_VOCABULARY_V3}"`]
  if (!isObject(lists)) return ['repeatableLists must be an object keyed by collection']
  const out = []
  for (const [collection, list] of Object.entries(lists)) {
    const named = `repeatableLists "${collection}"`
    if (!isObject(list)) {
      out.push(`${named} must be an object {itemTemplate, min, max}`)
      continue
    }
    const template = groups.get(list.itemTemplate)
    if (!template)
      out.push(`${named} itemTemplate ${JSON.stringify(list.itemTemplate)} is not a group of the map`)
    else if (collectionOfGroupId(list.itemTemplate) !== collection)
      out.push(`${named} itemTemplate "${list.itemTemplate}" is not an item of this collection`)
    else
      for (const [id, group] of groups)
        if (collectionOfGroupId(id) === collection && group.kind !== template.kind)
          out.push(`${named} mixes kinds: "${id}" is ${group.kind}, its item template ${template.kind}`)
    const minOk = Number.isInteger(list.min) && list.min >= 0
    if (!minOk) out.push(`${named} min must be a whole number from 0`)
    if (
      list.max !== null &&
      !(Number.isInteger(list.max) && list.max >= 1 && (!minOk || list.max >= list.min))
    )
      out.push(`${named} max must be null or a whole number from 1, at least min`)
  }
  return out
}
