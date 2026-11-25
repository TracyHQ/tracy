// Shared: the WordPress and EmDash main menus (main-menu-wordpress.js, main-menu-emdash.js) read it, so it lives in lib/
// (module-graph.test.mjs).
// The main menu of a CMS whose content map holds no menu item slot: the menu is a tree read from the theme (a
// WordPress navigation, an EmDash menu), each link `{ item, slot, path, parent, demo }` in menu order, its label slot
// named by position (`<item>.label`). Matched with the plan's mainMenu into the shape of the Joomla main menu
// (main-menu.js), so the writer input, the copy check and the export read every CMS the same way.
//
// The header names no menu label on these CMS, so the plan cannot label a top-level item: every item the plan's mainMenu
// keeps (top-level and dropdown child) is a writer slot. The label slots are not content map slots; the export hands
// them to step 9 with the menu, never to the content contract door. Pure: inputs in, a new object out.

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** A menu label limit when the kit names none: twice the demo label, at least 20 characters. */
const limitOf = (demo) => Math.max(20, 2 * String(demo ?? '').length)
const trimSlashes = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '')

/** A link's path, without its scheme, host, query or anchor, and without its slashes at either end. */
export const pathOfUrl = (url) =>
  trimSlashes(
    String(url ?? '')
      .replace(/^[a-z]+:\/\/[^/]+/i, '')
      .replace(/[?#].*$/, '')
  )

/** A main menu that could not be read, with the reason as its one problem. */
export const unreadMenu = (detail) => ({
  menutype: null,
  items: [],
  slots: [],
  hidden: [],
  problems: [{ page: null, parent: null, detail }]
})

/**
 * @param {{ plan: object, kit: object, tree: { item: string, slot: string, path: string, parent: string | null,
 *   demo: string }[], menutype: string }} input
 * @returns {{ menutype: string, items: object[], slots: object[], hidden: object[], problems: object[] }}
 */
export function menuFromTree({ plan, kit, tree, menutype }) {
  const byItem = new Map(tree.map((n) => [n.item, n]))
  const kitPages = arr(kit?.pages).filter((p) => isObject(p) && typeof p.id === 'string')
  const pathOfPage = (page) => {
    const p = kitPages.find((k) => k.id === page)
    return p ? trimSlashes(p.path) : null
  }
  const pageOfPath = (path) => kitPages.find((p) => trimSlashes(p.path) === path)?.id ?? null

  // The items the plan keeps, with the plan's intent: top-level entries by their page, children under their own.
  const kept = new Map()
  const problems = []
  const miss = (page, parent, detail) => problems.push({ page: page ?? null, parent, detail })
  for (const m of arr(plan?.mainMenu).filter(isObject)) {
    const path = pathOfPage(m.page)
    const top = path === null ? null : tree.find((n) => !n.parent && n.path === path)
    if (!top) {
      miss(
        m.page,
        null,
        `${m.page}: ${path === null ? 'the kit has no such page' : `no main menu item opens /${path}`}`
      )
      for (const c of arr(m.children))
        miss(c?.page, m.page, `${c?.page}: its parent ${m.page} opens no top-level main menu item`)
      continue
    }
    kept.set(top.item, typeof m.intent === 'string' ? m.intent : '')
    for (const c of arr(m.children)) {
      const cPath = pathOfPage(c?.page)
      const child = cPath === null ? null : tree.find((n) => n.parent === top.item && n.path === cPath)
      if (!child) {
        miss(c?.page, m.page, `${c?.page}: no main menu item under /${top.path} opens this page`)
        continue
      }
      kept.set(child.item, typeof c.intent === 'string' ? c.intent : '')
    }
  }

  const items = []
  const slots = []
  const hidden = []
  for (const n of tree) {
    const view = { item: n.item, slot: n.slot, path: `/${n.path}`, parent: n.parent, demo: n.demo }
    const parentHidden = n.parent && !kept.has(n.parent)
    if (!kept.has(n.item) || parentHidden) {
      const why = parentHidden
        ? `under the hidden item /${byItem.get(n.parent).path}`
        : n.parent
          ? `the plan's main menu does not keep /${n.path} under /${byItem.get(n.parent).path}`
          : `the plan's main menu does not keep /${n.path}`
      items.push({ ...view, state: 'hidden', why })
      hidden.push({ item: n.item, slot: n.slot, path: `/${n.path}`, why })
      continue
    }
    const intent = kept.get(n.item)
    const maxCharacters = limitOf(n.demo)
    slots.push({
      slot: n.slot,
      item: n.item,
      parentSlot: n.parent ? byItem.get(n.parent).slot : null,
      page: pageOfPath(n.path),
      intent,
      maxCharacters,
      sample: n.demo
    })
    items.push({
      ...view,
      state: n.parent ? 'shown' : 'top',
      intent,
      maxCharacters,
      labelFrom: { owner: 'writer', menu: true }
    })
  }
  return { menutype, items, slots, hidden, problems }
}
