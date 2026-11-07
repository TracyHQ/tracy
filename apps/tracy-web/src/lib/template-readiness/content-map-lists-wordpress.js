/**
 * The content map lists check on WordPress (ticket #457): the same intent as on Joomla (content-map-lists-check.js), the
 * flow must not be blind to the lists, article pages and menus a site has, read from what a WordPress contract carries.
 *
 * A Joomla content map holds three dictionaries (`itemLists`, `itemPages`, `menuBlocks`). A WordPress one holds none of
 * them: it has `entities` (a page, an option, a post...) and `slots` (one per editable value, `entity` naming its owner).
 * Menus are not in the map at all: they are `wp_navigation` posts, captured raw in `navigation-source.json`. So the three
 * keys keep their names, and each is read from where WordPress keeps the same thing:
 *
 *   key          the site has it when (inventory.json, the record of the demo database)   the contract carries it when
 *   itemPages    a published post of any type but `page`, or the kit pictures none       the map has an entity of a post type
 *                                                                                         other than `page`, with a slot
 *   itemLists    two or more such posts, or the kit pictures a list of items (rowKind     the map has two or more such entities
 *                `items`)                                                                  with a slot (a list is refilled by its
 *                                                                                         entries)
 *   menuBlocks   a navigation holding link blocks (an automatic `page-list` menu has      navigation-source.json holds that
 *                none to edit), or the kit pictures a menu (`mainMenuFrom`, a menu role)   navigation with its link blocks
 *
 * A numbered run of slots inside a page (`front-page.menu.dish-description.1..10`) is a repeated row of the page, not a
 * list of articles: the template kit lists those (blocks[].lists), and its own checks judge them. It is not read here.
 *
 *   null   every kind the site has is carried (a site without posts or menus is not flagged for them)
 *   todo   one or more not carried (`content-map-missing-lists`, `{ missing, fix }`)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const array = (value) => (Array.isArray(value) ? value : [])
const LINK_BLOCK = /<!--\s*wp:navigation-(?:link|submenu)\b/

/** The post type of a map entity that is not a page, or null. */
const postTypeOf = (entity) => {
  const type = entity?.identity?.postType
  return typeof type === 'string' && type !== '' && type !== 'page' ? type : null
}

/** The posts of other types than `page` the demo holds that a visitor can open. */
const publishedPosts = (inventory) =>
  array(inventory?.posts).filter(
    (p) => p?.status === 'publish' && p.type !== 'page' && p.type !== 'wp_navigation'
  )

/** The navigations of the inventory that hold link blocks (an automatic page list has nothing to rebuild). */
const editableMenus = (inventory) =>
  array(inventory?.navigations).filter((n) => !n?.pageList && array(n?.links).length)

/**
 * @param {{ map: any, inventory: any, navigation: any, kit: any }} input `kit` is the template kit document or null
 * @returns {string[]} the keys the contract is missing, in the Joomla order
 */
export function missingListsOfWordpress({ map, inventory, navigation, kit }) {
  const blocks = array(kit?.blocks)
  const kitLists = blocks.some((b) => array(b?.lists).some((l) => l?.rowKind === 'items'))
  const kitMenu = Boolean(kit?.mainMenuFrom) || blocks.some((b) => /menu/.test(String(b?.role ?? '')))
  const withSlot = new Set(array(map?.slots).map((s) => s?.entity))
  const carried = array(map?.entities).filter((e) => postTypeOf(e) && withSlot.has(e.key)).length
  const posts = publishedPosts(inventory).length
  const missing = []
  if ((posts >= 2 || kitLists) && carried < 2) missing.push('itemLists')
  if (posts >= 1 && carried < 1) missing.push('itemPages')
  const menus = editableMenus(inventory)
  if (menus.length || kitMenu) {
    const held = new Set(
      array(navigation?.navigations)
        .filter((n) => LINK_BLOCK.test(String(n?.content ?? '')))
        .map((n) => n.id)
    )
    if (menus.some((m) => !held.has(m.id)) || (!menus.length && held.size === 0)) missing.push('menuBlocks')
  }
  return missing
}

/**
 * Reads what the check needs from the contract folder; each can be handed in through `world` (tests, the command line).
 * @returns {{ map: any, inventory: any, navigation: any } | null} null when the folder holds no readable content map
 */
export function contractFilesOf(dir, world = {}) {
  const at = (file) => (dir ? readJson(path.join(dir, file)) : null)
  const map = world.contentMap === undefined ? at('content-map.json') : world.contentMap
  if (!map || typeof map !== 'object') return null
  return {
    map,
    inventory: world.inventory === undefined ? at('inventory.json') : world.inventory,
    navigation: world.navigationSource === undefined ? at('navigation-source.json') : world.navigationSource
  }
}
