// The entries a module keeps per menu item (JA's masthead, mod_jamasthead, in JA Diner, JA Boxing, JA Vega...): its params hold
// parallel lists `menuitem_config.title[i]`, `menuitem_config.description[i]`, `menuitem_config.background[i]`, one entry per
// menu item, beside a default (`default-title`, `default-description`) printed only on a page with no entry of its own. A page
// with an entry prints that entry, never the default.
//
// The kit says which entry a page prints only through its title (`pages[].titleSlot` is `menuitem_config.title[i]`), so the plan
// and the writer write the titles of the kept pages, the default description, and whichever background frames the plan chose,
// while each kept page kept the demo's description and picture of its own entry. Before (dev lat28, 22/11/2026), JA Diner's
// About, Bookings and Contact pages printed "Responsive joomla template for restaurant" over the template's banner photos, the
// final check counted the default and two pictures as written and printed nowhere.
//
// Here the entry a kept page prints, of every other list of the same module, takes what was written for that list: the default
// of the list (a description), else what another entry of the list was given (a background picture). An entry a file speaks for
// keeps its own value. Nothing here writes: it returns twins as the button twins do (kit-buttons.js), one claim each.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])
const ENTRY = 'menuitem_config'
const slotIdOf = (key) => String(key).replace(/^module-/, 'block-')

/** The entry of a content-map slot: `{ list, index }` for `menuitem_config.<list>[index]`, else null. */
function entryOf(slot) {
  const path = each(slot?.jsonPath)
  if (path.length !== 3 || path[0] !== ENTRY) return null
  const list = path[1]
  const index = String(path[2])
  return typeof list === 'string' && /^\d+$/.test(index) ? { list, index } : null
}

/**
 * The twins of the kept pages' own entries.
 * @param {{ plan: object, kit: object, contentMap: { slots?: object[] } | null, claims: object[] }} input `claims` what the
 *   files say, by slot id
 * @returns {{ claims: object[], twins: Map<string, string> }} `twins` entry slot -> the slot whose value it takes
 */
export function menuItemEntryTwins({ plan, kit, contentMap, claims }) {
  const slots = each(contentMap?.slots)
  const byKey = new Map(slots.map((s) => [s?.key, s]))
  const filed = new Map()
  for (const c of each(claims)) if (!filed.has(c?.slot)) filed.set(c.slot, c)
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  // Each module's entries by list, and the index each kept page prints.
  const lists = new Map()
  for (const s of slots) {
    const at = entryOf(s)
    if (!at || typeof s.entity !== 'string') continue
    const of = lists.get(s.entity) ?? new Map()
    const entries = of.get(at.list) ?? new Map()
    entries.set(at.index, s)
    of.set(at.list, entries)
    lists.set(s.entity, of)
  }
  const printed = new Map()
  for (const page of each(kit?.pages)) {
    if (!kept.has(page?.id) || typeof page.titleSlot !== 'string') continue
    const title = byKey.get(contentMapKey(page.titleSlot))
    const at = entryOf(title)
    if (!at || at.list !== 'title') continue
    const indexes = printed.get(title.entity) ?? new Set()
    indexes.add(at.index)
    printed.set(title.entity, indexes)
  }
  const out = []
  const twins = new Map()
  // The claim on a slot, and the one that gives it a value: text or a picture, never a hide.
  const claimOf = (slot) => filed.get(slotIdOf(slot.key)) ?? filed.get(slot.key) ?? null
  const spoken = (slot) => {
    const c = claimOf(slot)
    return c && c.kind !== 'hide' && c.kind !== 'link' ? c : null
  }
  for (const [entity, indexes] of printed) {
    const of = lists.get(entity)
    for (const [list, entries] of of ?? []) {
      if (list === 'title') continue
      const fallback = slots.find(
        (s) =>
          s?.entity === entity &&
          each(s.jsonPath).length === 1 &&
          s.jsonPath[0] === `default-${list}` &&
          spoken(s)
      )
      // The source: the list's default when written, else the first entry a file gave a value, a page's own entry first.
      const given = [...entries.values()].filter((s) => spoken(s))
      const source =
        fallback ??
        given.find((s) => indexes.has(entryOf(s).index)) ??
        given.find((s) => !indexes.has(entryOf(s).index)) ??
        null
      if (!source) continue
      const from = spoken(source)
      for (const index of indexes) {
        const entry = entries.get(index)
        // An entry a file speaks for, a hide included, keeps what the file says.
        if (!entry || entry === source || entry.type !== source.type || claimOf(entry)) continue
        const slot = slotIdOf(entry.key)
        twins.set(slot, from.slot)
        out.push({ ...from, slot })
      }
    }
  }
  return { claims: out, twins }
}
