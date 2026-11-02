// Items lists of author pages: an author list (`view=author`) links each author to a page of that author's articles.
// Such a page has no menu item of its own, so the crawl ties it to the author by its heading (`rendersEntity`). It
// declares `itemLists["<user>.items"]` like a listing page does (`listing-lists.mjs`): the author as source, the bound
// from the author view's own settings, the articles shown in order, and each card field. Only articles the dump says
// the author wrote are candidates (`findings.contentAuthors`); without them nothing proves whose articles a card shows.
// A shipped user the map holds no entity for (the site's own Super User) is found by the last part of its page's path,
// against the accounts the dump ships (`findings.contentUsers`). A page tied to no shipped user (a machine's own
// account) and the later pages of a list (`?start=`) declare nothing.
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { cardsOnPage, objectOf, pathOfHref, rowSlotsOf } from './item-lists.mjs'
import { bodyPool } from './listing-lists.mjs'

const count = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(v) : null)
const isAuthorView = (link) => /[?&]view=author(?:&|$)/i.test(String(link ?? ''))
const laterPage = (url) => /[?&](?:start|limitstart)=[1-9]/.test(String(url ?? ''))

/** How many articles one page of an author shows, from the author view's settings, or null when they inherit it. */
function pageSizeOf(settings) {
  const leading = count(settings.num_leading_articles)
  const intro = count(settings.num_intro_articles)
  if (leading === null && intro === null) return null
  return (leading ?? 0) + (intro ?? 0) || null
}

/** The author list an author page belongs to: the one whose route its path continues, else the only one. */
function listingOf(views, path) {
  const segs = (r) =>
    String(r ?? '')
      .split('/')
      .filter(Boolean)
  const hit = views.find((v) => {
    const route = segs(v.route).join('/')
    return route && `/${segs(path).join('/')}/`.includes(`/${route}/`)
  })
  return hit ?? (views.length === 1 ? views[0] : null)
}

/**
 * @param {{map: any, lock: any, findings: any}} input the map should already carry its slot fit
 * @returns {{itemLists: Record<string, any>}}
 */
export function authorListsOf({ map, lock, findings }) {
  const itemLists = {}
  const authors = findings?.contentAuthors
  const views = (map.pages ?? []).filter((p) => isAuthorView(p.link))
  if (!authors || !views.length) return { itemLists }
  const entities = map.entities ?? []
  const slotsByKey = new Map((map.slots ?? []).map((s) => [s.key, s]))
  const users = new Map(entities.filter((e) => e.kind === 'user').map((e) => [e.key, e]))
  const articleKey = new Map(
    entities.filter((e) => e.kind === 'article').map((e) => [String(e.sourceId), e.key])
  )
  const accounts = Object.entries(findings.contentUsers ?? {})
  /** The shipped user a page lists the articles of: its heading's entity, else the account its path names. */
  const userOf = (p) => {
    const user = users.get(p.rendersEntity?.entity)
    if (user) return { key: user.key, id: String(user.sourceId), name: null }
    const segment = /\/author\/([^/?#]+)/.exec(pathOfHref(p.url) ?? '')?.[1]
    if (!segment) return null
    let named = segment
    try {
      named = decodeURIComponent(segment)
    } catch {
      /* a malformed escape: compare it as written */
    }
    const hit = accounts.find(([, a]) => a.username === named) ?? accounts.find(([, a]) => a.name === named)
    return hit ? { key: `user-${hit[0]}`, id: hit[0], name: hit[1].name || null } : null
  }
  /** @type {Map<string, any>} */
  const best = new Map()
  for (const p of findings.pages ?? []) {
    if ((p.mapPages ?? []).length || laterPage(p.url)) continue
    const user = userOf(p)
    if (!user) continue
    const candidates = new Set(
      Object.entries(authors)
        .filter(([, by]) => String(by) === user.id)
        .map(([id]) => articleKey.get(id))
        .filter(Boolean)
    )
    if (!candidates.size) continue
    const seen = cardsOnPage(p, bodyPool, candidates, slotsByKey)
    const prev = best.get(user.key)
    if (seen && (!prev || seen.cards.size > prev.seen.cards.size))
      best.set(user.key, { seen, url: p.url, user })
  }
  for (const [userKey, { seen, url, user }] of best) {
    const pagePath = pathOfHref(url)
    const listing = listingOf(views, pagePath)
    const shown = [...seen.cards.entries()].sort(([, a], [, b]) => a.first - b.first).map(([e]) => e)
    const rowSlots = rowSlotsOf(shown, seen, slotsByKey)
    const size = listing ? pageSizeOf(objectOf(lock?.entities?.[listing.entity]?.params)) : null
    const title =
      (map.slots ?? []).find((s) => s.entity === userKey && s.column === 'name')?.sample ?? user.name ?? null
    itemLists[`${userKey}.items`] = {
      block: null,
      page: null,
      pagePath,
      rowKind: 'items',
      source: {
        kind: 'author',
        id: userKey,
        title,
        page: listing?.entity ?? null,
        route: listing?.route ?? null
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
      observedOn: pagePath
    }
  }
  return { itemLists }
}
