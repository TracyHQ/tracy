// The WordPress content map in the shape the kit reads (contract-read.mjs). A Joomla map lists its pages with the
// modules assigned to each (`pages[]`, from menu items) and its menus and item lists (`menuBlocks`, `itemLists`,
// `fitGroups`). A WordPress map lists entities and slots only: a page entity (`page-<slug>`) holds every named block
// of its post content, found by `metadata.name`. So the pages are derived here from the contract alone, never
// guessed: each page entity's address is its slug under its parents' slugs (`inventory.json` posts, the release's own
// database), the front page is the page `page_on_front` names, and every page prints the same three areas of a block
// theme, found by selector (find-blocks.js): the header template part, the post content and the footer template part.
// The Joomla-only keys stay absent; `platformGaps` names each one the kit cannot read on WordPress and why.

/**
 * The areas every page of a block theme prints, in the order `findBlocks` takes them. `.wp-site-blocks` holds the
 * template's top-level blocks: the template parts and the `main` group between them.
 */
export const WORDPRESS_AREAS = Object.freeze([
  {
    entity: 'header',
    position: 'header',
    selector: '.wp-site-blocks > .wp-block-template-part:not(main ~ *)'
  },
  { entity: 'main-body', position: null, selector: '.wp-block-post-content' },
  {
    entity: 'footer',
    position: 'footer',
    selector: '.wp-site-blocks > main ~ .wp-block-template-part'
  }
])

/** What a WordPress content map does not declare, and so what the kit leaves empty, each with its reason. */
export const WORDPRESS_MAP_GAPS = Object.freeze([
  {
    key: 'menuBlocks',
    field: 'site.navigationGroups[].items',
    reason:
      'the WordPress content map declares no menu blocks: menus are wp_navigation posts (navigation-source.json), so navigation groups are read from the pages only'
  },
  {
    key: 'itemLists',
    field: 'blocks[].lists[rowKind=items]',
    reason:
      'the WordPress content map declares no item lists: a query loop lists posts the map holds no slots for, so no items list is built'
  },
  {
    key: 'fitGroups',
    field: 'blocks[].lists[].min',
    reason: 'the WordPress content map declares no fit groups: list minimums come from the page measurement only'
  },
  {
    key: 'menuItem',
    field: 'pages[].inMainMenu',
    reason:
      'WordPress pages have no menu item entity: whether a page is in the main menu is read from the header navigation the pages print'
  }
])

/** The path of a page post: its slug under its parents' slugs, `/` for the front page. */
function pathOf(post, byId, frontId) {
  if (String(post.id) === String(frontId)) return '/'
  const parts = []
  const seen = new Set()
  for (let p = post; p && !seen.has(p.id); p = byId.get(p.parent)) {
    seen.add(p.id)
    parts.unshift(p.slug)
  }
  return `/${parts.join('/')}`
}

/**
 * The map with `pages[]` derived for a WordPress map that lists none, and `platformGaps` naming the Joomla-only keys
 * it lacks. A map that already lists pages, or no inventory, comes back as it is (with its gaps named).
 * @param {object} map the content map
 * @param {object|null} inventory inventory.json beside the contract
 */
export function withWordPressPages(map, inventory) {
  const platformGaps = WORDPRESS_MAP_GAPS.filter((g) =>
    g.key === 'menuItem' ? !(map.entities ?? []).some((e) => e.kind === 'menuItem') : map[g.key] == null
  )
  if (Array.isArray(map.pages) && map.pages.length) return { ...map, platformGaps }
  const posts = (inventory?.posts ?? []).filter((p) => p.type === 'page')
  const byId = new Map(posts.map((p) => [p.id, p]))
  const front = inventory?.options?.page_on_front ?? null
  const assignedModules = WORDPRESS_AREAS.map((a) => ({ ...a, published: '1' }))
  const pages = []
  for (const e of map.entities ?? []) {
    if (e.kind !== 'page' || !e.identity?.slug) continue
    const post = posts.find((p) => p.slug === e.identity.slug && p.status === 'publish')
    if (!post) continue
    const path = pathOf(post, byId, front)
    pages.push({
      entity: e.key,
      route: path === '/' ? 'home' : path.slice(1),
      link: null,
      postId: post.id,
      assignedModules
    })
  }
  return { ...map, pages, platformGaps }
}
