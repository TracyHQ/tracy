// Shared: main-menu.js reads it for a WordPress kit, so it lives in lib/ (module-graph.test.mjs).
// The main menu of a WordPress kit (#463). A block theme registers no nav menu and the content map holds no menu item:
// the main menu is the navigation block of the theme's `header` template part, and its `ref` wp_navigation post (else
// the one its `metadata.name` names, `nav.<slug>`), both read from the navigation source captured from the release
// (navigation-source.json, which content-map-source.js puts on the content map as `navigationSource`).
//
// The output has the shape of the Joomla main menu (main-menu.js), so the writer input, the copy check and the export
// read it the same way. One difference: the WordPress kit's header names no menu label, so the plan cannot label a
// top-level item, and every item the plan's mainMenu keeps (top-level and dropdown child) is a writer slot. The slot
// ids are `nav.<slug>.<n>[.<n>].label` by position in the navigation (it is captured once per release), and they are
// not content map slots: the export hands the labels to step 9 with the menu, never to the content contract door.
// Pure: inputs in, a new object out.
import {
  blocksOf,
  blockTree
} from '../template-customization-question-readiness/site-pages/wordpress-blocks.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

const PRIMARY_NAMES = ['nav.mainmenu', 'nav.tracy', 'nav.primary', 'nav.main']
const LINK_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])

/** A menu label limit when the kit names none: twice the demo label, at least 20 characters. */
const limitOf = (demo) => Math.max(20, 2 * String(demo ?? '').length)
const trimSlashes = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '')
const pathOfUrl = (url) =>
  trimSlashes(
    String(url ?? '')
      .replace(/^[a-z]+:\/\/[^/]+/i, '')
      .replace(/[?#].*$/, '')
  )

/** The header's main navigation post and its slug, or a problem. */
function mainNavigation(source) {
  const parts = arr(source?.templateParts)
  const header = parts.find((p) => p?.area === 'header') ?? parts.find((p) => p?.slug === 'header')
  if (!header) return { problem: 'the navigation source has no header template part' }
  const navs = blocksOf(header.content).filter((t) => t.name === 'core/navigation' && !t.close)
  const nav =
    navs.find((t) => t.attrs.ref) ??
    PRIMARY_NAMES.map((n) => navs.find((t) => t.attrs.metadata?.name === n)).find(Boolean)
  if (!nav) return { problem: 'the header template part has no main navigation block' }
  const posts = arr(source.navigations)
  const slug = String(nav.attrs.metadata?.name ?? '').replace(/^nav\./, '')
  const post = nav.attrs.ref
    ? posts.find((p) => String(p?.id) === String(nav.attrs.ref))
    : posts.find((p) => p?.slug === slug)
  if (!post) return { problem: `the header navigation's wp_navigation post is not in the navigation source` }
  return { post }
}

/** The navigation's links as a flat tree in menu order: { item, slot, path, parent, demo }. */
function treeOf(post) {
  const out = []
  const walk = (nodes, parent, prefix) => {
    let n = 0
    for (const node of nodes) {
      if (!LINK_BLOCKS.has(node.name)) continue
      n += 1
      const item = `${prefix}.${n}`
      const demo = String(node.attrs.label ?? (node.name === 'core/home-link' ? 'Home' : '')).trim()
      out.push({ item, slot: `${item}.label`, path: pathOfUrl(node.attrs.url), parent, demo })
      walk(node.children, item, item)
    }
  }
  walk(blockTree(blocksOf(post.content)), null, `nav.${post.slug}`)
  return out
}

/**
 * @param {{ plan: object, kit: object, navigationSource: object }} input
 * @returns {{ menutype: string | null, items: object[], slots: object[], hidden: object[], problems: object[] }}
 */
export function wordpressMainMenuOf({ plan, kit, navigationSource }) {
  const found = mainNavigation(navigationSource)
  if (!found.post)
    return {
      menutype: null,
      items: [],
      slots: [],
      hidden: [],
      problems: [{ page: null, parent: null, detail: found.problem }]
    }
  const tree = treeOf(found.post)
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
  return { menutype: found.post.slug, items, slots, hidden, problems }
}
