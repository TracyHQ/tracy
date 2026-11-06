// Slots of a site copy that are not plain content slots of the contract door. A setting slot lives in a CMS row the
// page settings stage writes. An icon slot holds a network's name in the copy, while the site holds the icon class in
// the text slot the kit names as its `field`, so the name is turned into that class and written there.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])

/** Every icon of the kit by slot id, with the classes of its list's rows by network name. */
export function iconsOf(kit) {
  const icons = new Map()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists)) {
      const rowIcons = each(list?.rows).flatMap((row) => each(row?.slots).filter((s) => s?.type === 'icon'))
      const classes = new Map(
        rowIcons.filter((s) => s.network && s.fieldValue).map((s) => [s.network.toLowerCase(), s.fieldValue])
      )
      for (const icon of rowIcons) icons.set(icon.id, { field: icon.field ?? null, classes })
    }
  return icons
}

/**
 * Takes the mapping's changes apart: what stays goes to the contract door as it is, an icon moves to its field, and a
 * slot that cannot go through the door now is set aside with the reason.
 * @param {Record<string, string>} changes
 * @param {object} kit
 * @param {{ slot: string }[]} slots the copy's slots
 * @returns {{ changes: Record<string, string>, routed: Map<string, string>, deferred: Map<string, string> }}
 */
export function routeChanges(changes, kit, slots) {
  const out = { ...changes }
  const routed = new Map()
  const deferred = new Map()
  const settings = new Set(each(kit?.site?.settingSlots).map((s) => s?.id))
  const icons = iconsOf(kit)
  for (const { slot } of slots) {
    const key = contentMapKey(slot)
    if (settings.has(slot)) {
      delete out[key]
      deferred.set(key, 'a setting slot: the page settings stage writes it')
      continue
    }
    const icon = icons.get(slot)
    if (!icon) continue
    const name = String(changes[key] ?? '').trim()
    const value = icon.classes.get(name.toLowerCase())
    delete out[key]
    if (icon.field && value) {
      const target = contentMapKey(icon.field)
      out[target] = value
      routed.set(key, target)
    } else
      deferred.set(
        key,
        icon.field ? `this template has no icon for "${name}"` : 'this icon has no slot to write'
      )
  }
  return { changes: out, routed, deferred }
}
