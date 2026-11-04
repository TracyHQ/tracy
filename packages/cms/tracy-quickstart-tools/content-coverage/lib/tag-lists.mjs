// Items lists of tag pages: a tag link on an item opens the page of every item with that tag (`view=tag`). Such a
// page has no menu item of its own, so it is tied to its tag twice: the last part of its path is the tag's alias, and
// its heading is the tag's title (`rendersEntity`); a menu page showing several tags names none in its path. It
// declares `itemLists["<tag>.items"]` like an author page does (`author-lists.mjs`): the tag as source, the items
// shown in order, and each card field. Every article is a candidate, as on the featured page: only the page body
// counts, so a block's cards on the same page are not read as the tag's list. The later pages of a list (`?start=`)
// declare nothing.
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { cardsOnPage, pathOfHref, rowSlotsOf } from './item-lists.mjs'
import { bodyPool } from './listing-lists.mjs'

const laterPage = (url) => /[?&](?:start|limitstart)=[1-9]/.test(String(url ?? ''))
const lastSegment = (path) =>
  String(path ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .pop()
    ?.toLowerCase() ?? null

/**
 * @param {{map: any, findings: any}} input the map should already carry its slot fit
 * @returns {{itemLists: Record<string, any>}}
 */
export function tagListsOf({ map, findings }) {
  const itemLists = {}
  const entities = map.entities ?? []
  const byAlias = new Map(
    entities.filter((e) => e.kind === 'tag' && e.identity?.path).map((e) => [lastSegment(e.identity.path), e])
  )
  if (!byAlias.size) return { itemLists }
  const slotsByKey = new Map((map.slots ?? []).map((s) => [s.key, s]))
  const candidates = new Set(entities.filter((e) => e.kind === 'article').map((e) => e.key))
  /** @type {Map<string, any>} */
  const best = new Map()
  for (const p of findings?.pages ?? []) {
    if ((p.mapPages ?? []).length || laterPage(p.url)) continue
    const tag = byAlias.get(lastSegment(pathOfHref(p.url)))
    if (!tag || p.rendersEntity?.entity !== tag.key) continue
    const seen = cardsOnPage(p, bodyPool, candidates, slotsByKey)
    const prev = best.get(tag.key)
    if (seen && (!prev || seen.cards.size > prev.seen.cards.size)) best.set(tag.key, { seen, url: p.url })
  }
  for (const [tagKey, { seen, url }] of best) {
    const pagePath = pathOfHref(url)
    const shown = [...seen.cards.entries()].sort(([, a], [, b]) => a.first - b.first).map(([e]) => e)
    const rowSlots = rowSlotsOf(shown, seen, slotsByKey)
    const title =
      (map.slots ?? []).find((s) => s.entity === tagKey && s.column === 'title')?.sample ??
      lastSegment(pagePath)
    itemLists[`${tagKey}.items`] = {
      block: null,
      page: null,
      pagePath,
      rowKind: 'items',
      source: { kind: 'tag', id: tagKey, title, page: null, route: null },
      min: null,
      minFrom: 'unknown',
      max: shown.length,
      maxFrom: 'demo-count',
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
