// The menu items of a menu block (`placements.<id>.menu.items` of the mapping file, ticket #597): which pages it lists,
// in which order and as which menu item, as data the write step applies without reading prose. Pure.
//
//   {from: "main-menu", why}                     the block draws the main menu: its items are the page items
//   {from: "pages", pageTypes?, level?, except?, plus?, order, max, link, default?, why}
//
// `menuItemPagesOf` is the rule, in this order: the plan's pages (`order: "plan"`: the plan's order; `"main-menu"`:
// the main menu's order, a parent page before its children, depth first); keep those of `pageTypes`; keep those of
// `level` (1: a page with a main menu item of its own and no parent page in the plan); drop those of `except`; then add the pages
// of `plus` not already listed, in the same order; then the first `max`. A page reached under its list page has no
// main menu item, so it is never of level 1 (with no list page in the plan it takes an item of its own, `ownItem`). `link: "page-address"`: each item is a `url` menu item (component 0)
// linking the page's own address: `index.php?Itemid=<the page's main menu item>`, or for a page reached under its list
// page its `under.address`. Measured on the blank JA Boxing site (door-measures K3): both print in the block and open
// the page (the under address prints the item page's detail layout).

export const MENU_ITEMS_FROM = Object.freeze(['main-menu', 'pages'])
export const MENU_ITEMS_ORDER = Object.freeze(['main-menu', 'plan'])
export const MENU_ITEMS_LINK = Object.freeze(['page-address'])
export const MENU_ITEMS_LEVEL = Object.freeze([1])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])

/** The problems of one `menu.items` declaration; `ctx.types` are the page types of the recipes. */
export function menuItemsProblems(items, at, { report, types }) {
  if (!isObject(items) || !MENU_ITEMS_FROM.includes(items.from) || !isName(items.why))
    return report(at, `items is {from: ${MENU_ITEMS_FROM.join(' | ')}, ..., why}: which pages it lists`)
  if (items.from === 'main-menu') return
  if (!MENU_ITEMS_ORDER.includes(items.order) || !Number.isInteger(items.max) || items.max < 1)
    report(at, `a list of pages names its order (${MENU_ITEMS_ORDER.join(' | ')}) and max`)
  if (!MENU_ITEMS_LINK.includes(items.link))
    report(`${at}.link`, `link is ${MENU_ITEMS_LINK.join(' | ')}: the menu item each listed page takes`)
  if (items.level !== undefined && !MENU_ITEMS_LEVEL.includes(items.level))
    report(`${at}.level`, `level is ${MENU_ITEMS_LEVEL.join(' | ')}: a page at the top of the main menu`)
  for (const key of ['pageTypes', 'except', 'plus']) {
    if (items[key] === undefined) continue
    if (!Array.isArray(items[key]) || !items[key].every((t) => types.has(t)))
      report(`${at}.${key}`, `${key} is a list of page types of the recipes`)
  }
}

/**
 * The pages a `from: "pages"` menu block lists, in its order.
 * @param {object} items the `menu.items` declaration
 * @param {{id: string, pageType: string}[]} pages the plan's pages, in the plan's order
 * @param {object} mapping the mapping file (`pages.<type>`: `menuItem.parent`, `under`)
 * @returns {object[]} the listed pages, at most `items.max`
 */
export function menuItemPagesOf(items, pages, mapping) {
  if (items?.from !== 'pages') return []
  const decl = (p) => mapping?.pages?.[p.pageType] ?? {}
  // Reached under its list page only when the plan has that list page; else it takes a menu item of its own.
  const under = (p) => Boolean(decl(p).under) && pages.some((q) => q.pageType === decl(p).under.page)
  const parentOf = (p) => {
    const parent = decl(p).menuItem?.parent
    return parent ? (pages.find((q) => q.pageType === parent) ?? null) : null
  }
  const ordered =
    items.order === 'main-menu'
      ? (() => {
          const out = []
          const visit = (parent) => {
            for (const p of pages)
              if (!under(p) && parentOf(p) === parent && !out.includes(p)) {
                out.push(p)
                visit(p)
              }
          }
          visit(null)
          return [...out, ...pages.filter((p) => !out.includes(p))]
        })()
      : [...pages]
  // A parent page type the plan has no page of leaves the page at the top of the main menu (`pageItemOf`).
  const level = (p) => !under(p) && !parentOf(p)
  const listed = ordered
    .filter((p) => items.pageTypes === undefined || items.pageTypes.includes(p.pageType))
    .filter((p) => items.level === undefined || level(p))
    .filter((p) => !each(items.except).includes(p.pageType))
  for (const p of ordered) if (each(items.plus).includes(p.pageType) && !listed.includes(p)) listed.push(p)
  return listed.slice(0, items.max)
}
