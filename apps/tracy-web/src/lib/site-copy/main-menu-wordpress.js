// Shared: main-menu.js reads it for a WordPress kit, so it lives in lib/ (module-graph.test.mjs).
// The main menu of a WordPress kit (#463). A block theme registers no nav menu and the content map holds no menu item:
// the main menu is the navigation block of the theme's `header` template part, and its `ref` wp_navigation post (else
// the one its `metadata.name` names, `nav.<slug>`), both read from the navigation source captured from the release
// (navigation-source.json, which content-map-source.js puts on the content map as `navigationSource`).
//
// The navigation's links become a menu tree matched with the plan's mainMenu by main-menu-tree.js, which the EmDash main
// menu shares. The slot ids are `nav.<slug>.<n>[.<n>].label` by position in the navigation (it is captured once per
// release). Pure: inputs in, a new object out.
import {
  blocksOf,
  blockTree
} from '../template-customization-question-readiness/site-pages/wordpress-blocks.js'
import { menuFromTree, pathOfUrl, unreadMenu } from './main-menu-tree.js'

const arr = (x) => (Array.isArray(x) ? x : [])

const PRIMARY_NAMES = ['nav.mainmenu', 'nav.tracy', 'nav.primary', 'nav.main']
const LINK_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])

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
  if (!found.post) return unreadMenu(found.problem)
  return menuFromTree({ plan, kit, tree: treeOf(found.post), menutype: found.post.slug })
}
