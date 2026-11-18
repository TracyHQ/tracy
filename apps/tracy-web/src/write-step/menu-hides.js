// A plan can hide a menu item of any menu. Joomla needs a menu item's title, so emptying it is no way out: the item leaves by being
// unpublished, the way a main menu item does. The content map says where each item lives. Nothing here writes.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const MENU_LABEL = /^(menuItem-\d+)\.0$/
const each = (value) => (Array.isArray(value) ? value : [])

/** The item whose title this slot is, or null. */
export const menuItemOfLabel = (slot) => MENU_LABEL.exec(String(slot))?.[1] ?? null

/**
 * The extras with every hidden menu label's item among the menu items to unpublish, whichever menu it is in. An item the content
 * map does not know stays out: nothing can say what depends on it, so its line fails by name.
 * @param {{ extras: object, owners: Map<string, object>, contentMap?: object | null }} input
 * @returns {object} the extras, new when something joined
 */
export function withEveryMenuHide({ extras, owners, contentMap }) {
  if (!extras?.mainMenu) return extras
  const entities = new Map(
    each(contentMap?.entities)
      .filter((e) => e?.kind === 'menuItem')
      .map((e) => [e.key, e])
  )
  const taken = new Set(each(extras.mainMenu.hide).map((h) => h.item))
  const joined = []
  for (const claim of owners.values()) {
    const item = claim.kind === 'hide' ? menuItemOfLabel(claim.slot) : null
    if (!item || taken.has(item) || !entities.has(item)) continue
    const { path, menutype } = entities.get(item).identity ?? {}
    const trimmed = String(path ?? '').replace(/^\/+|\/+$/g, '')
    joined.push({
      item,
      slot: claim.slot,
      path: `/${trimmed}`,
      why: `the plan hides this item of the menu ${menutype}`
    })
  }
  if (!joined.length) return extras
  return { ...extras, mainMenu: { ...extras.mainMenu, hide: [...each(extras.mainMenu.hide), ...joined] } }
}

/**
 * The menu items the link stage found stranded (a plan label over a target that cannot move, link-stage.js): each joins the items
 * to unpublish, so the page that is the item's own goes with it, and its label is not written. Mutates `changes`.
 * @param {{ stranded?: { item: string, id: number, label: string, reason: string }[], extras: object,
 *   changes: Record<string, string>, contentMap?: object | null }} input
 * @returns {{ extras: object, labels: Map<string, object> }} `labels`: the label lines, hidden on the item's row
 */
export function strandMenuItems({ stranded, extras, changes, contentMap }) {
  const labels = new Map()
  if (!each(stranded).length) return { extras, labels }
  const paths = new Map(
    each(contentMap?.entities)
      .filter((e) => e?.kind === 'menuItem')
      .map((e) => [e.key, String(e.identity?.path ?? '').replace(/^\/+|\/+$/g, '')])
  )
  const menu = extras?.mainMenu ?? { menutype: null, hide: [] }
  const taken = new Set(each(menu.hide).map((h) => h.item))
  const joined = []
  for (const s of stranded) {
    delete changes[contentMapKey(s.label)]
    labels.set(s.label, {
      status: 'hidden',
      reason: `the label is not written: ${s.reason}`,
      ordered: '0',
      readFrom: { action: 'content.get', params: { kind: 'menuItem', id: s.id }, path: ['item', 'published'] }
    })
    if (taken.has(s.item)) continue
    taken.add(s.item)
    joined.push({ item: s.item, slot: s.label, path: `/${paths.get(s.item) ?? ''}`, why: s.reason })
  }
  return { extras: { ...extras, mainMenu: { ...menu, hide: [...each(menu.hide), ...joined] } }, labels }
}
