// The data fixes of an AI quickstart mapping file (ticket #587): `dataFixes`, the changes the blank site step makes
// to the demo data beyond removing it, each declared with its reason so the blank site holds nothing undeclared. Pure.
//
// Two kinds exist, at most one of each per kit.
//
// `system-menu`:
//   {id: "system-menu", menu: {menutype, title}, templateStyle, items: [{page, title, alias, link, robots?}], why}
// A menu that no module shows, whose items give the system pages a menu item of their own. A system page with no menu
// item of its own is printed under the active page's template style (on a built JA Boxing site the home page's
// Landing style, whose layout has no main body), and shares the home page's title. With its own item on the
// default style (`templateStyle` 0, or a style id) it prints its main body and takes the item's title.
// `scripts/ai-quickstart/blank-site.mjs` adds the menu and its items when it makes the blank site
// (`packages/cms/tracy-joomla-quickstart/scripts/blank-site-data-fixes.mjs`). `robots`, when said, is written into the
// item's params (`{"robots": ...}`): the four system page views print it as `<meta name="robots">` of the page.
//
// `registration-off`:
//   {id: "registration-off", why}
// Visitor sign-up off: the blank site sets `allowUserRegistration` "0" in the params of com_users (its extensions
// row). The sign in page then prints no sign up link and the registration view sends the visitor to the sign in page.

/** The system pages a system menu may give an item, by the page type the release gate reads them as, and their route. */
export const SYSTEM_PAGE_LINKS = Object.freeze({
  'system-search': 'index.php?option=com_finder&view=search',
  'system-login': 'index.php?option=com_users&view=login',
  'system-reset': 'index.php?option=com_users&view=reset',
  'system-remind': 'index.php?option=com_users&view=remind'
})
export const DATA_FIX_KINDS = Object.freeze(['system-menu', 'registration-off'])
/** The robots values a menu item may carry: the ones the platform's menu item form offers. */
export const ROBOTS_VALUES = Object.freeze([
  'index, follow',
  'noindex, follow',
  'index, nofollow',
  'noindex, nofollow'
])

const FIX_KEYS = Object.freeze({
  'system-menu': ['id', 'menu', 'templateStyle', 'items', 'why'],
  'registration-off': ['id', 'why']
})
const MENU_KEYS = ['menutype', 'title']
const ITEM_KEYS = ['page', 'title', 'alias', 'link', 'robots']
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
    return report(
      at,
      'items lists the system pages the menu gives an item: {page, title, alias, link, robots?}'
    )
  const seen = { page: new Set(), alias: new Set(), title: new Set() }
  items.forEach((item, i) => {
    const here = `${at}[${i}]`
    if (!isObject(item)) return report(here, 'an item is {page, title, alias, link, robots?}')
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
    if (Object.hasOwn(item, 'robots') && !ROBOTS_VALUES.includes(item.robots))
      report(`${here}.robots`, `robots is one of ${ROBOTS_VALUES.join('; ')}`)
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
      return report(at, `a data fix is {id, ...} with id one of ${DATA_FIX_KINDS.join(', ')}`)
    if (!DATA_FIX_KINDS.includes(fix.id))
      return report(`${at}.id`, `id is one of ${DATA_FIX_KINDS.join(', ')}`)
    unknownKeys(fix, FIX_KEYS[fix.id], at, report)
    if (kinds.has(fix.id)) report(`${at}.id`, `${fix.id} is declared twice: one per kit`)
    kinds.add(fix.id)
    if (fix.id === 'system-menu') systemMenuProblems(fix, at, report)
    const problem = reasonProblem(fix.why)
    if (problem) report(`${at}.why`, problem)
  })
}

function systemMenuProblems(fix, at, report) {
  menuProblems(fix.menu, `${at}.menu`, report)
  if (!Number.isInteger(fix.templateStyle) || fix.templateStyle < 0)
    report(`${at}.templateStyle`, 'templateStyle is a template style id, 0 for the site default style')
  itemsProblems(fix.items, `${at}.items`, report)
}
