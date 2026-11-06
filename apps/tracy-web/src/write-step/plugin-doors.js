// The Claude Cowork for Joomla doors the write step needs beyond the contract write itself, declared once here and read by the
// stage that uses each one (hide-writes.js, page-create-stage.js, slot-corrections.js, page-route-stage.js). A stage asks the
// site whether a door is open (`opens`) and skips its work with a reason when it is not; the template readiness verdict
// (lib/template-readiness/write-doors-check.js) holds the plugin a new site is pinned to against this very list. So a new door
// is one entry here, used by its stage, and the readiness check sees it without being edited.
//
// A door is { id, what, evidence, info? }:
//   what      the door in a reader's words;
//   evidence  text the plugin's PHP source holds exactly when the plugin has the door, read from a release package's bytes
//             (scripts/cowork-plugin-doors.mjs writes what each released package holds into a manifest);
//   info      the path of the plugin's `info` answer that says the door is open, read from the site at run time. A door with
//             none is told by its answer only (the alias rename keeps the old alias on an older plugin).

/** `info` path → a door whose evidence is the line of the plugin's info block that writes `key` (the path's first by default). */
const infoDoor = (id, what, path, key = path[0]) => ({
  id,
  what,
  evidence: `'${key}' =>`,
  info: Object.freeze(path)
})

export const HIDE_ORDERS_DOOR = Object.freeze(
  infoDoor('hide-orders', 'hide orders: empty a slot, unpublish a block, source language overrides', [
    'hide_ops',
    'version'
  ])
)
export const ROWS_REMOVE_DOOR = Object.freeze(
  infoDoor(
    'rows-remove',
    "rows.remove: a hidden slot's row leaves the stored field",
    ['hide_ops', 'rows_remove'],
    'rows_remove'
  )
)
export const PAGE_CREATE_DOOR = Object.freeze(
  infoDoor('page-create', 'page creation that does not read as drift', ['page_create', 'version'])
)
export const SLOT_CORRECTIONS_DOOR = Object.freeze(
  infoDoor('slot-corrections', 'slot corrections: kept icons and empty gallery alts', ['slot_corrections'])
)
/** The first release whose `content.update` renames a menu item through `alias` (TracyHQ/claude-cowork#271). */
export const MENU_ITEM_ALIAS_DOOR = Object.freeze({
  id: 'menu-item-alias',
  what: 'content.update renames a menu item through alias',
  evidence: 'function urlSafeAlias(',
  since: '0.24.81'
})

/** Every door the write step needs, in the order its stages run. */
export const WRITE_STEP_DOORS = Object.freeze([
  HIDE_ORDERS_DOOR,
  ROWS_REMOVE_DOOR,
  PAGE_CREATE_DOOR,
  SLOT_CORRECTIONS_DOOR,
  MENU_ITEM_ALIAS_DOOR
])

/** The value at the door's `info` path of an `info` answer, or undefined. */
export const infoOf = (door, info) => door.info?.reduce((at, key) => at?.[key], info ?? undefined)

/** Whether the site's `info` answer says this door is open (a number of at least 1, or any object for a door it describes). */
export function opens(door, info) {
  const said = infoOf(door, info)
  if (said !== null && typeof said === 'object') return true
  return Number(said) >= 1
}
