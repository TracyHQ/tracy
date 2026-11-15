// The data fixes of an AI quickstart mapping file (ticket #587): `dataFixes`, the changes the blank site step makes
// to the demo data beyond removing it, each declared with its reason so the blank site holds nothing undeclared. Pure.
//
// One kind exists, `system-menu`:
//   {id: "system-menu", menu: {menutype, title}, templateStyle, items: [{page, title, alias, link}], why}
// A menu that no module shows, whose items give the system pages a menu item of their own. A system page with no menu
// item of its own is printed under the active page's template style (on a built JA Boxing site the home page's
// Landing style, whose layout has no main body), and shares the home page's title. With its own item on the
// default style (`templateStyle` 0, or a style id) it prints its main body and takes the item's title.
// `scripts/ai-quickstart/blank-site.mjs` adds the menu and its items when it makes the blank site
// (`packages/cms/tracy-joomla-quickstart/scripts/blank-site-data-fixes.mjs`).

/** The system pages a system menu may give an item, by the page type the release gate reads them as, and their route. */
export const SYSTEM_PAGE_LINKS = Object.freeze({
  'system-search': 'index.php?option=com_finder&view=search',
  'system-login': 'index.php?option=com_users&view=login',
  'system-reset': 'index.php?option=com_users&view=reset',
  'system-remind': 'index.php?option=com_users&view=remind'
})
export const DATA_FIX_KINDS = Object.freeze(['system-menu'])

const FIX_KEYS = ['id', 'menu', 'templateStyle', 'items', 'why']
const MENU_KEYS = ['menutype', 'title']
const ITEM_KEYS = ['page', 'title', 'alias', 'link']
const NOT_SAID = /^\s*$/
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && !NOT_SAID.test(value)

const unknownKeys = (entry, keys, at, report) => {
  for (const k of Object.keys(entry))
    if (!keys.includes(k)) report(`${at}.${k}`, `"${k}" is no key here: ${keys.join(', ')}`)
}

function menuProblems(menu, at, report) {
  if (!isObject(menu)) return report(at, 'menu is {menutype, title}')
  unknownKeys(menu, MENU_KEYS, at, report)
  if (typeof menu.menutype !== 'string' || !/^[a-z0-9-]{1,24}$/.test(menu.menutype))
    report(`${at}.menutype`, 'menutype is lower case letters, digits and dashes, at most 24 characters')
  if (!isName(menu.title) || menu.title.length > 48)
    report(`${at}.title`, 'title is the menu title, at most 48 characters')
}

function itemsProblems(items, at, report) {
  if (!Array.isArray(items) || !items.length)
    return report(at, 'items lists the system pages the menu gives an item: {page, title, alias, link}')
  const seen = { page: new Set(), alias: new Set(), title: new Set() }
  items.forEach((item, i) => {
    const here = `${at}[${i}]`
    if (!isObject(item)) return report(here, 'an item is {page, title, alias, link}')
    unknownKeys(item, ITEM_KEYS, here, report)
    if (!Object.hasOwn(SYSTEM_PAGE_LINKS, String(item.page)))
      report(`${here}.page`, `page is one of ${Object.keys(SYSTEM_PAGE_LINKS).join(', ')}`)
    else {
      if (seen.page.has(item.page)) report(`${here}.page`, `${item.page} has two items`)
      seen.page.add(item.page)
      if (item.link !== SYSTEM_PAGE_LINKS[item.page])
        report(`${here}.link`, `the route of ${item.page} is ${SYSTEM_PAGE_LINKS[item.page]}`)
    }
    if (typeof item.alias !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.alias))
      report(`${here}.alias`, 'alias is lower case letters, digits and dashes')
    else if (seen.alias.has(item.alias))
      report(`${here}.alias`, `alias "${item.alias}" is used twice: one page, one address`)
    seen.alias.add(item.alias)
    if (!isName(item.title)) report(`${here}.title`, 'title is the page title the item gives the page')
    else if (seen.title.has(item.title))
      report(`${here}.title`, `title "${item.title}" is used twice: each system page has its own title`)
    seen.title.add(item.title)
  })
}

/**
 * Every problem of `mapping.dataFixes`.
 * @param {any} list the parsed `dataFixes`
 * @param {(at: string, message: string) => void} report
 * @param {(why: any) => string | null} reasonProblem the kit's rule for a reason (said, and true)
 */
export function dataFixProblems(list, report, reasonProblem) {
  if (list === undefined) return
  if (!Array.isArray(list)) return report('dataFixes', 'dataFixes is a list of data fixes')
  const kinds = new Set()
  list.forEach((fix, i) => {
    const at = `dataFixes[${i}]`
    if (!isObject(fix))
      return report(at, 'a data fix is {id: "system-menu", menu, templateStyle, items, why}')
    unknownKeys(fix, FIX_KEYS, at, report)
    if (!DATA_FIX_KINDS.includes(fix.id))
      return report(`${at}.id`, `id is one of ${DATA_FIX_KINDS.join(', ')}`)
    if (kinds.has(fix.id)) report(`${at}.id`, `${fix.id} is declared twice: one per kit`)
    kinds.add(fix.id)
    menuProblems(fix.menu, `${at}.menu`, report)
    if (!Number.isInteger(fix.templateStyle) || fix.templateStyle < 0)
      report(`${at}.templateStyle`, 'templateStyle is a template style id, 0 for the site default style')
    itemsProblems(fix.items, `${at}.items`, report)
    const problem = reasonProblem(fix.why)
    if (problem) report(`${at}.why`, problem)
  })
}
