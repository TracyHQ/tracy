// Shared: main-menu.js reads it for an EmDash kit, so it lives in lib/ (module-graph.test.mjs).
// The main menu of an EmDash kit. An EmDash content map holds no menu item slot: a menu label is not a field of any
// entry (sites/brief-engines/emdash-menus.js), and the site's menus are listed in the content map's `menus`, each
// `{ name, label, items: [{ type, label, url, children? }] }`. The main menu is the one named `primary` (every EmDash
// theme here names it so), else the first.
//
// Its links become a menu tree matched with the plan's mainMenu by main-menu-tree.js, as the WordPress navigation is.
// The slot ids are `menu.<name>.<n>[.<n>].label` by position in the menu, captured with the release's content map; the
// write step finds the site's menu item at that position through the site's own menu API. Pure: inputs in, a new object
// out.
import { menuFromTree, pathOfUrl, unreadMenu } from './main-menu-tree.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The menu every EmDash theme here prints in its header. */
export const EMDASH_MAIN_MENU = 'primary'

/** The menu's links as a flat tree in menu order: { item, slot, path, parent, demo }. */
function treeOf(menu) {
  const out = []
  const walk = (nodes, parent, prefix) => {
    let n = 0
    for (const node of arr(nodes).filter(isObject)) {
      n += 1
      const item = `${prefix}.${n}`
      out.push({
        item,
        slot: `${item}.label`,
        path: pathOfUrl(node.url),
        parent,
        demo: String(node.label ?? '').trim()
      })
      walk(node.children, item, item)
    }
  }
  walk(menu.items, null, `menu.${menu.name}`)
  return out
}

/**
 * @param {{ plan: object, kit: object, menus: object[] }} input `menus`: the content map's
 * @returns {{ menutype: string | null, items: object[], slots: object[], hidden: object[], problems: object[] }}
 */
export function emdashMainMenuOf({ plan, kit, menus }) {
  const named = arr(menus).filter((m) => isObject(m) && typeof m.name === 'string' && m.name)
  const menu = named.find((m) => m.name === EMDASH_MAIN_MENU) ?? named[0]
  if (!menu) return unreadMenu('the content map lists no menu')
  return menuFromTree({ plan, kit, tree: treeOf(menu), menutype: menu.name })
}
