// Items lists of listing pages: a page whose body lists content items (a category's items, the featured items, the
// authors) declares them like a category block does (`item-lists.mjs`): `itemLists["<page>.items"]` with the source,
// the bounds from the view's own settings, the items shown in order, and each card field with its character limit.
// Only the page body counts: findings items record per copy whether they sit in a block (`homes`, '' for the body),
// so a footer menu or a sidebar block on the same page is never read as the listing. A listing page that shows no
// item declares no list: a planner has nothing to count there.
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { cardsOnPage, objectOf, pathOfHref, rowSlotsOf } from './item-lists.mjs'

const viewOf = (link) => /[?&]view=([a-z]+)/i.exec(String(link ?? ''))?.[1]?.toLowerCase() ?? null
const idOf = (link) => /[?&]id=(\d+)(?:&|$)/.exec(String(link ?? ''))?.[1] ?? null
const count = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(v) : null)

/** The page body's items (`by: "body"`), from the per-copy homes of a crawl that records them; menus drawn outside
 * every block (a header mega menu, a list of more links) are navigation, not the listing. The body copy's own role
 * (`bodyRole`) decides: a card title an off-canvas menu also prints is still a card. */
/** A text's role in the body is its body copy's; a bare link (a logo's home address, a "#") keeps the menu's. */
const roleInBody = (it) => (it.kind === 'text' ? (it.bodyRole ?? it.role) : it.role)

export const bodyPool = (items) => {
  if (items.some((it) => Array.isArray(it.homes)))
    return {
      pool: items
        .map((it, index) => ({ it, index }))
        .filter(({ it }) => roleInBody(it) !== 'nav' && (it.homes ?? []).includes('')),
      by: 'body'
    }
  // Without them a block's cards on the same page would read as the listing: nothing is declared.
  return null
}

/** How many rows one page of the listing shows, from the view's own settings, or null when they inherit it. */
function pageSizeOf(view, settings) {
  if (view === 'author') return count(settings.num_authors)
  const leading = count(settings.num_leading_articles)
  const intro = count(settings.num_intro_articles)
  if (leading === null && intro === null) return count(settings.display_num)
  return (leading ?? 0) + (intro ?? 0) || null
}

/**
 * @param {{map: any, lock: any, findings: any}} input the map should already carry its slot fit
 * @returns {{itemLists: Record<string, any>, itemPages: Record<string, any>}}
 */
export function listingListsOf({ map, lock, findings }) {
  const entities = map.entities ?? []
  const slotsByKey = new Map((map.slots ?? []).map((s) => [s.key, s]))
  const categories = entities.filter((e) => e.kind === 'category')
  const entityByKey = new Map(entities.map((e) => [e.key, e]))
  const itemLists = {}
  const itemPages = {}
  for (const page of map.pages ?? []) {
    const view = viewOf(page.link)
    let source
    let kinds
    let catKeys = null
    if (view === 'category') {
      const cat = categories.find((c) => String(c.sourceId) === idOf(page.link))
      if (!cat) continue
      catKeys = new Set([cat.key])
      for (const c of categories)
        if (String(c.identity?.path ?? '').startsWith(`${cat.identity?.path}/`)) catKeys.add(c.key)
      const title =
        (map.slots ?? []).find((s) => s.entity === cat.key && s.column === 'title')?.sample ?? null
      source = { kind: 'category', id: cat.key, title: title ?? cat.identity?.path ?? null }
      kinds = new Set(['article'])
    } else if (view === 'featured') {
      source = { kind: 'featured', id: null, title: null }
      kinds = new Set(['article'])
    } else if (view === 'author') {
      source = { kind: 'authors', id: null, title: null }
      kinds = new Set(['user'])
    } else continue
    source = { ...source, page: page.entity, route: page.route ?? null }
    const candidates = new Set(
      entities
        .filter((e) => kinds.has(e.kind) && (!catKeys || catKeys.has(e.identityReferences?.catid)))
        .map((e) => e.key)
    )
    let best = null
    for (const p of findings?.pages ?? []) {
      if (!(p.mapPages ?? []).some((m) => m.entity === page.entity)) continue
      const seen = cardsOnPage(p, bodyPool, candidates, slotsByKey)
      if (seen && (!best || seen.cards.size > best.cards.size)) best = { ...seen, url: p.url }
    }
    if (!best) continue
    const shown = [...best.cards.entries()].sort(([, a], [, b]) => a.first - b.first).map(([e]) => e)
    const rowSlots = rowSlotsOf(shown, best, slotsByKey)
    const size = pageSizeOf(view, objectOf(lock?.entities?.[page.entity]?.params))
    itemLists[`${page.entity}.items`] = {
      block: null,
      page: page.entity,
      rowKind: 'items',
      source,
      min: null,
      minFrom: 'unknown',
      max: size ?? shown.length,
      maxFrom: size ? 'view-setting' : 'demo-count',
      shown,
      rowSlots,
      demoOwned: rowSlots
        .filter((r) => r.demoOwned)
        .flatMap((r) => r.items.filter((i) => isFactRole(slotsByKey.get(i.slot)?.role)).map((i) => i.slot)),
      observedBy: best.by,
      observedOn: pathOfHref(best.url)
    }
    for (const item of shown) {
      const path = best.cards.get(item).path
      if (!path) continue
      const row = (itemPages[item] ??=
        source.kind === 'category'
          ? {
              path,
              // The item's own category: a blog of a parent category lists its sub-categories' items too.
              category: entityByKey.get(item)?.identityReferences?.catid ?? source.id,
              categoryPage: page.entity,
              categoryRoute: page.route ?? null,
              linkedFrom: []
            }
          : { path, listingPage: page.entity, listingRoute: page.route ?? null, linkedFrom: [] })
      if (!row.linkedFrom.includes(page.entity)) row.linkedFrom.push(page.entity)
    }
  }
  categoryPagesOf({ map, lock, findings, categories, entities, slotsByKey, itemLists, itemPages })
  return { itemLists, itemPages }
}

/** `/index.php/our-blog/2-restaurant-business` -> `our-blog/2-restaurant-business` (no query: a later page of it is not). */
const routeOfUrl = (url) => {
  try {
    const u = new URL(url)
    if (u.search) return null
    return u.pathname.replace(/^\/(?:index\.php\/?)?/, '').replace(/\/$/, '') || null
  } catch {
    return null
  }
}

/**
 * Category pages no menu item names, reached from a blog's own links (`/our-blog/2-restaurant-business`: the category
 * `<id>-<alias>` under the blog's menu route): each declares its list like a category page with a menu item, keyed by
 * the category (`itemLists["category-2.items"]`, `page: null`, `pagePath`), its bounds from the parent page's view
 * settings, and each item it shows names it as its category page (`itemPages[item].categoryRoute`).
 */
function categoryPagesOf({ map, lock, findings, categories, entities, slotsByKey, itemLists, itemPages }) {
  const pages = map.pages ?? []
  for (const p of findings?.pages ?? []) {
    if ((p.mapPages ?? []).length) continue
    const route = routeOfUrl(p.url)
    const m = /^(.+)\/(\d+)-([a-z0-9-]+)$/.exec(route ?? '')
    if (!m) continue
    const [, parentRoute, id, alias] = m
    const cat = categories.find(
      (c) =>
        String(c.sourceId) === id &&
        (c.identity?.alias === alias ||
          String(c.identity?.path ?? '')
            .split('/')
            .at(-1) === alias)
    )
    if (!cat || itemLists[`${cat.key}.items`]) continue
    const parent = pages.find((pg) => pg.route === parentRoute && viewOf(pg.link) === 'category')
    if (!parent) continue
    const catKeys = new Set([cat.key])
    for (const c of categories)
      if (String(c.identity?.path ?? '').startsWith(`${cat.identity?.path}/`)) catKeys.add(c.key)
    const candidates = new Set(
      entities
        .filter((e) => e.kind === 'article' && catKeys.has(e.identityReferences?.catid))
        .map((e) => e.key)
    )
    const seen = cardsOnPage(p, bodyPool, candidates, slotsByKey)
    if (!seen || seen.cards.size === 0) continue
    const shown = [...seen.cards.entries()].sort(([, a], [, b]) => a.first - b.first).map(([e]) => e)
    const rowSlots = rowSlotsOf(shown, seen, slotsByKey)
    const size = pageSizeOf('category', objectOf(lock?.entities?.[parent.entity]?.params))
    const title = (map.slots ?? []).find((s) => s.entity === cat.key && s.column === 'title')?.sample ?? null
    itemLists[`${cat.key}.items`] = {
      block: null,
      page: null,
      pagePath: `/${route}`,
      rowKind: 'items',
      source: {
        kind: 'category',
        id: cat.key,
        title: title ?? cat.identity?.path ?? null,
        page: null,
        route
      },
      min: null,
      minFrom: 'unknown',
      max: size ?? shown.length,
      maxFrom: size ? 'view-setting' : 'demo-count',
      shown,
      rowSlots,
      demoOwned: rowSlots
        .filter((r) => r.demoOwned)
        .flatMap((r) => r.items.filter((i) => isFactRole(slotsByKey.get(i.slot)?.role)).map((i) => i.slot)),
      observedBy: seen.by,
      observedOn: pathOfHref(p.url)
    }
    for (const item of shown) {
      const path = seen.cards.get(item).path
      const where = { category: cat.key, categoryPage: null, categoryRoute: route }
      if (itemPages[item]) Object.assign(itemPages[item], where)
      else if (path) itemPages[item] = { path, ...where, linkedFrom: [] }
    }
  }
}
