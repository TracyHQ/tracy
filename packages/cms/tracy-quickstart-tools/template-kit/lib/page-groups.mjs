// Page groups by the site's real structure: a listing page with its own items (the content items it lists, the
// detail pages its list links to one path level down, its further result pages, and the author or tag pages it
// leads to). One group stands for pages of one kind, so a planner
// can treat them alike; the menu tree is not the structure (a contact page sits under a listing in a menu, and is not
// one of its items).

export const LISTING = /^(category listing|featured articles|tag listing|author listing)/
const ITEM = /^article/
const LED = /^(tag listing|author listing)/

const parentPath = (path) => path.split('/').slice(0, -1).join('/') || '/'

/** The page one path level up whose repeated list links to `p`, or null. */
function listerOf(p, listedBy, byPath) {
  const up = parentPath(p.path)
  if (up === '/' || up === p.path || !listedBy.get(p.path)?.has(up)) return null
  return byPath.get(up) ?? null
}

/**
 * @param {{id: string, path: string, kind: string, from?: string[], inMainMenu?: boolean|null}[]} pages
 * @param {Map<string, string>} itemParent item page path -> its category page path (the content map's itemPages)
 * @param {{listedBy?: Map<string, Set<string>>}} [o] page path -> the pages whose repeated list links to it
 */
export function groupPages(pages, itemParent = new Map(), { listedBy = new Map() } = {}) {
  const byPath = new Map(pages.map((p) => [p.path, p]))
  const roots = pages
    .filter((p) => LISTING.test(p.kind) && !p.path.includes('?'))
    .sort((a, b) => b.path.length - a.path.length)
  const rootOf = (p) => {
    // A content item's detail page belongs to its category's page (the map's itemPages), whatever menu holds it.
    const parent = byPath.get(itemParent.get(p.path))
    if (parent && parent !== p) return parent
    if (p.path.includes('?')) return byPath.get(p.path.split('?')[0]) ?? null
    // A detail page (a person, an item) whose page one level up lists it is one of that page's items, even with a
    // menu item of its own.
    const up = listerOf(p, listedBy, byPath)
    if (up) return up
    const from = byPath.get(p.from?.find((f) => byPath.has(f)))
    const base = from?.path.includes('?') ? (byPath.get(from.path.split('?')[0]) ?? from) : from
    // An author or tag page joins the page that leads to it (they share one layout).
    if (LED.test(p.kind)) return base && base !== p ? base : null
    // Any other listing is its own group; so is every page with its own menu item that is not a listed item.
    if (!ITEM.test(p.kind) || p.inMainMenu) return null
    const prefix = roots.find((r) => r !== p && r.path !== '/' && p.path.startsWith(`${r.path}/`))
    if (prefix) return prefix
    // A content item joins the listing that leads to it.
    return base && base !== p && LISTING.test(base.kind) ? base : null
  }
  const groupOf = new Map(pages.map((p) => [p.path, rootOf(p) ?? p]))
  const groups = new Map()
  for (const p of pages) {
    let root = groupOf.get(p.path)
    for (let hop = 0; hop < 5 && groupOf.get(root.path) !== root; hop++) root = groupOf.get(root.path)
    const id = `group-${root.id.replace(/^page-/, '')}`
    if (!groups.has(id)) groups.set(id, { id, root: root.id, children: [] })
    if (p !== root) groups.get(id).children.push(p.id)
    p.group = id
  }
  return [...groups.values()]
}

/**
 * Self-check: every page of a group is its root or one of the root's own items: a further result page of it, a
 * content item it lists (its category page, or under its path without a menu item of its own), or an author or tag
 * page. A second listing or an unrelated page in a group is an error. Returns how many groups mix.
 */
export function mixedGroupChecks({
  pages,
  pageGroups,
  itemParent = new Map(),
  listedBy = new Map(),
  errors
}) {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const byPath = new Map(pages.map((p) => [p.path, p]))
  let mixed = 0
  for (const g of pageGroups) {
    const root = byId.get(g.root)
    if (!root) continue
    const strangers = g.children
      .map((id) => byId.get(id))
      .filter(Boolean)
      .filter((c) => {
        if (c.path.split('?')[0] === root.path && c.path.includes('?')) return false
        if (itemParent.get(c.path) === root.path) return false
        if (LED.test(c.kind)) return false
        if (listerOf(c, listedBy, byPath) === root) return false
        return !(ITEM.test(c.kind) && !c.inMainMenu)
      })
    if (!strangers.length) continue
    mixed++
    errors.push({
      kind: 'mixed-page-group',
      field: `pageGroups[${g.id}]`,
      reason: `the group of ${root.path} holds pages that are not its own items: ${strangers.map((c) => c.path).join(', ')}`
    })
  }
  return mixed
}

/**
 * Self-check: a detail page that the page one path level up lists (`listedBy`) is in that page's group. Returns how
 * many are not.
 */
export function detailPageChecks({ pages, pageGroups, listedBy = new Map(), errors }) {
  const byPath = new Map(pages.map((p) => [p.path, p]))
  const groupOf = new Map()
  for (const g of pageGroups) for (const id of [g.root, ...(g.children ?? [])]) groupOf.set(id, g)
  let wrong = 0
  for (const p of pages) {
    const lister = listerOf(p, listedBy, byPath)
    if (!lister || groupOf.get(p.id)?.root === lister.id) continue
    wrong++
    errors.push({
      kind: 'detail-page-outside-listing',
      field: `pageGroups[${groupOf.get(p.id)?.id ?? '?'}]`,
      reason: `${p.path} is a detail page listed by ${lister.path} but is not in its group`
    })
  }
  return wrong
}
