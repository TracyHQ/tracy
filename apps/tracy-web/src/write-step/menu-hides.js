// A plan can hide a menu item of any menu. Joomla needs a menu item's title, so emptying it is no way out: the item leaves by being
// unpublished, the way a main menu item does. The content map says where each item lives. Nothing here writes.
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
