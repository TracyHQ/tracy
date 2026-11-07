// The WordPress content map in the shape the kit reads (contract-read.mjs). A Joomla map lists its pages with the
// modules assigned to each (`pages[]`, from menu items) and its menus and item lists (`menuBlocks`, `itemLists`,
// `fitGroups`). A WordPress map lists entities and slots only: a page entity (`page-<slug>`) holds every named block
// of its post content, found by `metadata.name`. So the pages are derived here from the contract alone, never
// guessed: each page entity's address is its slug under its parents' slugs (`inventory.json` posts, the release's own
// database), the front page is the page `page_on_front` names. Every page prints the header and footer template parts,
// and between them its post content, read as its sections (wordpress-sections.mjs: the top-level blocks, each one a
// block of the kit, as a Joomla module is) when the run read them from the site, else as one block.
// The Joomla-only keys stay absent; `platformGaps` names each one the kit cannot read on WordPress and why.
import { wordpressPagePath } from '../../../../content-coverage/lib/wordpress-page-path.mjs'
import { sectionOfTarget } from './wordpress-sections.mjs'

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
    reason:
      'the WordPress content map declares no fit groups: list minimums come from the page measurement only'
  },
  {
    key: 'menuItem',
    field: 'pages[].inMainMenu',
    reason:
      'WordPress pages have no menu item entity: whether a page is in the main menu is read from the header navigation the pages print'
  }
])

/** The path of a page post: its slug under its parents' slugs (the shared rule), `/` for the front page. */
function pathOf(post, pages, frontId) {
  if (String(post.id) === String(frontId)) return '/'
  return `/${wordpressPagePath(post.slug, pages)}`
}

/**
 * A page's sections as blocks of the shaped map: one entity per section (`block-<page>-<label>`, kind `section`), the
 * page's slots handed to the section that holds each, and the areas the page prints. Null, with the reason, when a
 * slot of the page is in no section (the page then stays one block, so no slot is lost).
 */
function sectionsOfPage(entity, sections, slots) {
  const page = entity.key.replace(/^page-/, '')
  const keyOf = (s) => `block-${page}-${s.label}`
  const owner = new Map()
  for (const slot of slots) {
    const section = sectionOfTarget(sections, slot.target)
    if (!section)
      return {
        gap: {
          field: `blocks[${entity.key}]`,
          reason: `the slot ${slot.key} (${JSON.stringify(slot.target)}) is in no top-level block of the page: the post content stays one block`
        }
      }
    owner.set(slot.key, keyOf(section))
  }
  const entities = sections.map((s) => ({
    key: keyOf(s),
    kind: 'section',
    identity: { page: entity.key, name: s.name, index: s.index }
  }))
  const areas = sections.map((s) => ({
    entity: keyOf(s),
    position: s.label.replace(/-\d+$/, ''),
    kind: 'section',
    selector: s.selector
  }))
  return { entities, areas, owner }
}

/**
 * The map with `pages[]` derived for a WordPress map that lists none, and `platformGaps` naming the Joomla-only keys
 * it lacks. A map that already lists pages, or no inventory, comes back as it is (with its gaps named).
 * @param {object} map the content map
 * @param {object|null} inventory inventory.json beside the contract
 * @param {Record<string, object[]>|null} [sectionsByPost] each page post's sections (`postSections`), by post id, as
 *   the run read them from the site; without them every page's post content is one block
 */
export function withWordPressPages(map, inventory, sectionsByPost = null) {
  const platformGaps = WORDPRESS_MAP_GAPS.filter((g) =>
    g.key === 'menuItem' ? !(map.entities ?? []).some((e) => e.kind === 'menuItem') : map[g.key] == null
  )
  if (Array.isArray(map.pages) && map.pages.length) return { ...map, platformGaps }
  const posts = (inventory?.posts ?? []).filter((p) => p.type === 'page')
  const published = posts.filter((p) => p.status === 'publish')
  const front = inventory?.options?.page_on_front ?? null
  const [header, body, footer] = WORDPRESS_AREAS.map((a) => ({ ...a, published: '1' }))
  const pages = []
  const sectionEntities = []
  const sectionGaps = []
  const slotOwner = new Map()
  for (const e of map.entities ?? []) {
    if (e.kind !== 'page' || !e.identity?.slug) continue
    const post = posts.find((p) => p.slug === e.identity.slug && p.status === 'publish')
    if (!post) continue
    const path = pathOf(post, published, front)
    let middle = [body]
    const sections = sectionsByPost?.[post.id] ?? sectionsByPost?.[String(post.id)]
    if (sections?.length) {
      const own = (map.slots ?? []).filter((s) => s.entity === e.key)
      const r = sectionsOfPage(e, sections, own)
      if (r.gap) sectionGaps.push(r.gap)
      else {
        middle = r.areas.map((a) => ({ ...a, published: '1' }))
        sectionEntities.push(...r.entities)
        for (const [k, v] of r.owner) slotOwner.set(k, v)
      }
    }
    pages.push({
      entity: e.key,
      route: path === '/' ? 'home' : path.slice(1),
      link: null,
      postId: post.id,
      assignedModules: [header, ...middle, footer]
    })
  }
  const slots = slotOwner.size
    ? (map.slots ?? []).map((s) => (slotOwner.has(s.key) ? { ...s, entity: slotOwner.get(s.key) } : s))
    : map.slots
  return {
    ...map,
    entities: [...(map.entities ?? []), ...sectionEntities],
    slots,
    pages,
    platformGaps,
    sectionGaps
  }
}
