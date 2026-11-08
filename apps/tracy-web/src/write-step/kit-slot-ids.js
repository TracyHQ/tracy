// Every content slot id a template kit names, for the write step's check of a site copy. The copy check's own index
// holds only the text slots a block lists, while a plan also fills what a block's `demoOwned` list, a link's label and
// a page's h1 and the site's setting slots name. Whether a slot really exists is then settled by the site's own inspect.
import { listSlotIds } from '../lib/kit-list-slot-ids.js'

const each = (value) => (Array.isArray(value) ? value : [])

export function kitSlotIds(kit) {
  const ids = new Set()
  const add = (id) => typeof id === 'string' && id && ids.add(id)
  for (const block of each(kit?.blocks)) {
    for (const s of each(block?.slots)) add(s?.id)
    for (const s of each(block?.demoOwned)) add(s?.id)
    for (const l of each(block?.links)) add(l?.labelId)
    for (const list of each(block?.lists)) for (const id of listSlotIds(list)) add(id)
  }
  for (const page of each(kit?.pages)) add(page?.h1?.slot)
  for (const group of each(kit?.site?.navigationGroups)) add(group?.titleSlot)
  for (const setting of each(kit?.site?.settingSlots)) add(setting?.id)
  return ids
}
