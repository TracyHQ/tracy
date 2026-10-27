/**
 * The Joomla half of REL-2: a release's main menu, read from its SQL dump as a tree and handed to
 * the page rule.
 *
 * The main menu is `mainmenu`, else the menu of the default home item (English first on a
 * multilingual site: Tracy Business keeps one `tb-main-<lang>` per language). A page is a published
 * entry a guest sees on that menu, at any depth, and its id is the entry's PATH
 * (`product/features`; a level-1 entry's path is its alias), unique in a menu where an alias is
 * not. The home entry's id stays its alias (JA Essence keeps "Home 3" under a "Home" heading:
 * `home-3`). Headings, separators, URL items, hidden entries and what sits under them are not pages.
 *
 * Ported from `tracy-dev site-pages` (`lib/site-pages-sql.mjs`, `joomlaIndex`).
 */
import { readTables, tableEndingWith } from '../readers/sql-dump.js'
import { pagesFromMenu, plainText, utilityName } from './page-rule.js'

/** Access levels a guest sees: Public, Guest. */
const GUEST_LEVELS = new Set([1, 5])
/** Joomla links that open a system page, never a business page. */
export const UTILITY_LINK =
  /option=com_(users|finder|search|tags|privacy|config|wrapper|newsfeeds)\b|option=com_content&view=(archive|author|form)\b/

/**
 * One article or one contact is one page, however many entries open it; a list view is not, since
 * its entries differ by their own layout parameters.
 * @param {Record<string, any>} r a menu row
 */
const pageKey = (r) => {
  const m = /option=com_(content|contact)&view=(article|contact)&id=(\d+)/.exec(String(r.link))
  return m ? `${m[2]}:${m[3]}` : String(r.id)
}
const paramsOf = (/** @type {Record<string, any>} */ r) => {
  try {
    return JSON.parse(r.params || '{}') ?? {}
  } catch {
    return {}
  }
}

/**
 * @param {string} sql the demo database dump
 */
export function joomlaMenu(sql) {
  const tables = readTables(sql, (n) => n.endsWith('_menu'))
  const byId = new Map()
  // A later insert of the same id wins, as it would in the database.
  for (const r of tableEndingWith(tables, 'menu')?.rows ?? [])
    if (Number(r.client_id) === 0 && Number(r.id) !== 1) byId.set(Number(r.id), r)
  const live = [...byId.values()].filter((r) => Number(r.published) === 1)
  const homes = live.filter((r) => Number(r.home) === 1)
  const inMenu = (/** @type {string} */ menutype) => live.filter((r) => r.menutype === menutype)
  const fallback =
    homes.find((r) => r.language === 'en-GB') ?? homes.find((r) => r.language === '*') ?? homes[0]
  const menutype = inMenu('mainmenu').some((r) => Number(r.level) === 1) ? 'mainmenu' : fallback?.menutype
  const homeItem = homes.find((r) => r.menutype === menutype)
  const pathOf = (/** @type {Record<string, any>} */ r) => String(r.path || r.alias)

  const index = {
    what: `published entry (by path) of menu "${menutype}"`,
    home: homeItem?.alias ?? null,
    /** How many entries of the main menu an id names; the home id counts by its alias. */
    count: (/** @type {string} */ id) =>
      inMenu(menutype).filter((r) => pathOf(r) === id).length +
      (homeItem && pathOf(homeItem) !== homeItem.alias && homeItem.alias === id ? 1 : 0)
  }

  /** @param {(message: string) => void} warn */
  function build(warn) {
    if (!menutype) throw new Error('no "mainmenu" and no published home item')
    if (menutype !== 'mainmenu')
      warn(`no published "mainmenu": used "${menutype}", the menu of the ${fallback.language} home item`)
    if (!homeItem) throw new Error(`menu "${menutype}" has no published home item`)
    const childrenOf = (/** @type {unknown} */ id) =>
      inMenu(menutype)
        .filter((c) => Number(c.parent_id) === Number(id))
        .sort((a, b) => Number(a.lft) - Number(b.lft))
    /** @returns {import('./page-rule.js').MenuNode[]} */
    const node = (/** @type {Record<string, any>} */ r) => {
      const label = plainText(r.title)
      if (!GUEST_LEVELS.has(Number(r.access))) {
        warn(
          `"${label}" (${pathOf(r)}) is not visible to guests (access ${r.access}): skipped with what is under it`
        )
        return []
      }
      if (Number(paramsOf(r).menu_show) === 0) {
        warn(
          `"${label}" (${pathOf(r)}) is hidden from the menu (Display in Menu: No): skipped with what is under it`
        )
        return []
      }
      const children = childrenOf(r.id).flatMap(node)
      if (Number(r.id) === Number(homeItem.id)) return [{ label, id: homeItem.alias, home: true, children }]
      if (r.type === 'alias') {
        const to = byId.get(Number(paramsOf(r).aliasoptions))
        // An alias of the home entry IS the menu's Home (JA Essence "Home" -> "Home 3").
        if (to && Number(to.id) === Number(homeItem.id))
          return [{ label, id: homeItem.alias, home: true, children }]
        if (
          !to ||
          Number(to.published) !== 1 ||
          !GUEST_LEVELS.has(Number(to.access)) ||
          to.type !== 'component'
        ) {
          if (!children.length) warn(`"${label}" (${pathOf(r)}) is an alias of no published page: skipped`)
          return [{ label, id: null, children }]
        }
        const utility = UTILITY_LINK.test(String(to.link)) ? 'link' : utilityName(label, r.alias, to.alias)
        return [{ label, id: pathOf(r), key: pageKey(to), alias: true, utility, children }]
      }
      if (r.type !== 'component') return [{ label, id: null, children }]
      const utility = UTILITY_LINK.test(String(r.link)) ? 'link' : utilityName(label, r.alias)
      return [{ label, id: pathOf(r), key: pageKey(r), utility, children }]
    }
    return pagesFromMenu(
      childrenOf(1).flatMap(node),
      { homeId: homeItem.alias, homeTitle: () => plainText(homeItem.title) },
      warn
    )
  }
  return { index, build }
}
