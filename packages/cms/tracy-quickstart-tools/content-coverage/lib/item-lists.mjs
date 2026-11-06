// Item lists of the content map: a block that pulls content items from a category (its own settings name the
// category, never its type or title) shows a list whose rows are content items of their own. The map gets, per block,
// `itemLists["<block>.items"]`: the source category, the bounds, the items shown in display order, and which fields of
// each item a card shows, each mapped to that item's own slots with the slot-fit character limits. `itemPages` ties
// the detail page each card opens to the category, so a kit can put it in the category page's group.
//
// What a card shows is read from the audit's findings, not guessed from the block's layout: an item the findings
// matched to an item's slots inside the block (its `scopes`, the ids of the element's ancestors) belongs to the card
// of that item. Words two items share go to the card whose box they sit in. Findings without scopes fall back to
// every page the block is assigned to, said in `observedBy: "page"`.
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'

/** Settings keys that name the category a block reads its items from, and the most items it shows. */
const CATEGORY_KEY = /^(catid|catids|category|categories|category_?id|cat_?id)$/i
const COUNT_KEY = /^(count|limit|num_?items|items_?count|number_?of_?items|display_?num)$/i
/** Item entity kinds a category holds. */
const ITEM_KINDS = new Set(['article'])

/** A settings value as an object: a JSON string or an object; anything else is empty. */
export function objectOf(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string' || !/^\s*[[{]/.test(raw)) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Every [key, value] of a settings tree (nested objects and JSON strings included), a few levels deep. */
function* entriesOf(o, depth = 0) {
  if (depth > 4 || !o || typeof o !== 'object') return
  for (const [k, v] of Object.entries(o)) {
    yield [k, v]
    if (v && typeof v === 'object' && !Array.isArray(v)) yield* entriesOf(v, depth + 1)
    else if (typeof v === 'string' && /^\s*\{/.test(v)) yield* entriesOf(objectOf(v), depth + 1)
  }
}

const idsOf = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => String(x).trim())
    .filter((x) => /^\d+$/.test(x) && x !== '0')

/** The categories and the configured count a block's own settings name, or null when they name no known category. */
function sourceOf(params, categoryById) {
  const cats = []
  let count = null
  for (const [k, v] of entriesOf(params)) {
    if (CATEGORY_KEY.test(k))
      for (const id of idsOf(v)) if (categoryById.has(id) && !cats.includes(id)) cats.push(id)
    if (count === null && COUNT_KEY.test(k) && /^\d+$/.test(String(v)) && Number(v) > 0) count = Number(v)
  }
  return cats.length ? { cats: cats.map((id) => categoryById.get(id)), count } : null
}

const entityOfKey = (key) => String(key).replace(/\.\d+$/, '')
const rectOf = (item) => {
  const vps = item.viewports ?? {}
  return (
    (vps.desktop?.visible && vps.desktop.rect) || Object.values(vps).find((v) => v?.visible && v.rect)?.rect
  )
}
const contains = (box, r) => {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1
}
export const pathOfHref = (href) => {
  if (!href || /^\s*(#|javascript:|mailto:|tel:)/i.test(href)) return null
  try {
    const u = new URL(href, 'http://site.invalid/')
    return /^https?:$/.test(u.protocol) ? u.pathname + u.search : null
  } catch {
    return null
  }
}

/** The field of an item a slot fills, in CMS-neutral words: `title`, `summary`, `body`, `image:<name>`, `custom:<path>`. */
function fieldOf(slot) {
  const path = (slot.jsonPath ?? []).filter((p) => typeof p === 'string').join('/')
  if (slot.type === 'image') return { field: `image:${path || slot.column}`, kind: 'image' }
  if (slot.type === 'url') return { field: `url:${path || slot.column}`, kind: 'link' }
  if (!path && /^(title|name|post_title)$/i.test(slot.column)) return { field: 'title', kind: 'title' }
  if (!path && /^(introtext|excerpt|post_excerpt|description)$/i.test(slot.column))
    return { field: 'summary', kind: 'summary' }
  if (!path && /^(fulltext|content|post_content)$/i.test(slot.column)) return { field: 'body', kind: 'body' }
  return { field: `custom:${path || slot.column}`, kind: 'custom' }
}

/** Is a findings item inside the block whose id is `id`? Joomla chrome ids: `Mod160`, `mod-articles-160`, `module-160`;
 * the JA module chrome wraps a module in `Section<id>`, no separator (JA Diner's latest news, `#Section103`); a page
 * section's own `section-2` is not a module. */
const scopeTest = (id) => new RegExp(`^(?:(?:mod|module)[-_a-z]*|section)0*${id}$`, 'i')

/** The findings items of a block on a page (`by: "block"`), else the whole page when it is assigned there. A module
 * alone in its position, rendered with no chrome of its own, is known by the position's wrapper (`t4-section-9`), as the
 * kit finds it. */
export const blockPool =
  (block, assigned, soleAt = null) =>
  (items) => {
    const inScope = scopeTest(block.sourceId)
    const atPosition = soleAt
      ? new RegExp(`^t[34]-${soleAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      : null
    const pool = items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => (it.scopes ?? []).some((s) => inScope.test(s) || atPosition?.test(s)))
    if (pool.length) return { pool, by: 'block' }
    if (items.some((it) => Array.isArray(it.scopes)) || !assigned) return null
    return { pool: items.map((it, index) => ({ it, index })), by: 'page' }
  }

/**
 * The cards of one list on one page: per shown item its findings items (in page order) and its detail page path.
 * `pick` chooses the page's items the list may hold and says how (`block`, `body` or `page`): on `page` every slot
 * an anchor matched must be the item's, since nothing says where on the page the words are.
 */
export function cardsOnPage(page, pick, candidates, slotsByKey) {
  const items = page.items ?? []
  const picked = pick(items)
  if (!picked) return null
  const { pool, by } = picked
  const ownersOf = (it) => [
    ...new Set(
      (it.slots ?? []).filter((k) => slotsByKey.has(k)).map((k) => slotsByKey.get(k).entity ?? entityOfKey(k))
    )
  ]
  /** @type {Map<string, any>} */
  const cards = new Map()
  const card = (e) => {
    if (!cards.has(e)) cards.set(e, { first: Number.POSITIVE_INFINITY, items: [], path: null, box: null })
    return cards.get(e)
  }
  const grow = (c, r) => {
    if (!r) return
    const b = c.box ?? { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
    c.box = {
      x0: Math.min(b.x0, r.x),
      y0: Math.min(b.y0, r.y),
      x1: Math.max(b.x1, r.x + r.w),
      y1: Math.max(b.y1, r.y + r.h)
    }
  }
  const matched = pool.filter(({ it }) => it.status === 'matched' && (it.slots ?? []).length)
  const shared = []
  // Anchors: the item matched slots of exactly one candidate item. Inside the block the same words may also fill a
  // slot elsewhere (a footer menu link named like the card title): the block scope already says where they are. On
  // the page fallback every slot must belong to that one item, since nothing says the words are in the block.
  for (const { it, index } of matched) {
    const owners = ownersOf(it)
    const mine = owners.filter((o) => candidates.has(o))
    if (mine.length === 1 && (by !== 'page' || owners.length === 1)) {
      const c = card(mine[0])
      c.first = Math.min(c.first, index)
      c.items.push({ it, index, slots: it.slots.filter((k) => entityOfKey(k) === mine[0]) })
      grow(c, rectOf(it))
      const path = it.kind === 'text' ? pathOfHref(it.href) : null
      if (path && !c.path) c.path = path
    } else if (owners.some((o) => candidates.has(o))) shared.push({ it, index, owners })
  }
  // Words several items share (or an item shares with another block): the card whose box holds them.
  for (const { it, index, owners } of shared) {
    const r = rectOf(it)
    if (!r) continue
    const hits = owners.filter((o) => cards.get(o)?.box && contains(cards.get(o).box, r))
    if (hits.length !== 1) continue
    const c = cards.get(hits[0])
    c.items.push({ it, index, slots: it.slots.filter((k) => entityOfKey(k) === hits[0]) })
  }
  // A card whose title merged with the same words elsewhere on the page (the page's own heading) lost its link: the
  // first link drawn inside the card's box names its detail page.
  for (const c of cards.values()) {
    if (c.path || !c.box) continue
    for (const { it } of pool) {
      const path = it.kind === 'text' ? pathOfHref(it.href) : null
      const r = rectOf(it)
      if (path && r && contains(c.box, r)) {
        c.path = path
        break
      }
    }
  }
  // Links to a card's detail page whose words are not the item's (a "Try a class" button): template words.
  const labels = new Map()
  for (const { it } of pool) {
    const path = it.kind === 'text' ? pathOfHref(it.href) : null
    if (!path) continue
    const owner = [...cards.entries()].find(([, c]) => c.path === path)
    if (!owner || ownersOf(it).includes(owner[0])) continue
    const words = String(it.value ?? '').trim()
    if (words) labels.set(words, true)
  }
  for (const c of cards.values()) c.items.sort((a, b) => a.index - b.index)
  return cards.size ? { cards, by, labels: [...labels.keys()] } : null
}

/** The character limit of a text slot: its slot-fit limit when measured, else the store's. */
export function limitOf(slot) {
  if (slot.type !== 'text') return {}
  if (slot.fit?.measured && Number.isFinite(slot.fit.maxCharacters))
    return { maxCharacters: slot.fit.maxCharacters, limitFrom: 'slot-fit' }
  return Number.isFinite(slot.maxCharacters) ? { maxCharacters: slot.maxCharacters, limitFrom: 'store' } : {}
}

/** The row fields of a list from the cards of its best page, in the order a card shows them. */
export function rowSlotsOf(shown, observed, slotsByKey) {
  /** @type {Map<string, any>} */
  const fields = new Map()
  const order = new Map()
  for (const item of shown) {
    const card = observed.cards.get(item)
    const seen = new Set()
    for (const { index, slots } of card.items)
      for (const key of slots) {
        const slot = slotsByKey.get(key)
        if (!slot || seen.has(key)) continue
        seen.add(key)
        const { field, kind } = fieldOf(slot)
        if (fields.get(field)?.items.some((i) => i.item === item)) continue
        if (!fields.has(field))
          fields.set(field, {
            field,
            kind,
            type: slot.type,
            role: slot.role ?? null,
            demoOwned: false,
            items: []
          })
        const f = fields.get(field)
        if (isFactRole(slot.role)) f.demoOwned = true
        f.items.push({ item, slot: key, ...limitOf(slot) })
        if (!order.has(field)) order.set(field, [shown.indexOf(item), index - card.first])
      }
  }
  // The findings keep one copy of words two cards share ("7:00 AM" on two cards), so a card can miss a field it shows.
  // A card shows the same fields for every item: the item's own slot of that field is added, marked `inferred`.
  const slotsOfItem = (item) =>
    [...slotsByKey.values()].filter((s) => (s.entity ?? entityOfKey(s.key)) === item)
  for (const f of fields.values())
    for (const item of shown) {
      if (f.items.some((i) => i.item === item)) continue
      const own = slotsOfItem(item).find((s) => fieldOf(s).field === f.field)
      if (!own) continue
      f.items.push({ item, slot: own.key, ...limitOf(own), inferred: true })
      if (isFactRole(own.role)) f.demoOwned = true
    }
  for (const f of fields.values()) f.items.sort((a, b) => shown.indexOf(a.item) - shown.indexOf(b.item))
  const paths = shown.map((item) => ({ item, path: observed.cards.get(item).path })).filter((p) => p.path)
  if (paths.length) {
    const firstHref = (item) => {
      const card = observed.cards.get(item)
      const hit = card.items.find(({ it }) => pathOfHref(it.href) === card.path)
      return hit ? hit.index - card.first : 0
    }
    fields.set('link', {
      field: 'link',
      kind: 'link',
      target: 'item-page',
      labels: observed.labels,
      demoOwned: false,
      items: paths
    })
    order.set('link', [shown.indexOf(paths[0].item), firstHref(paths[0].item) + 0.5])
  }
  return [...fields.values()].sort((a, b) => {
    const [ai, ao] = order.get(a.field)
    const [bi, bo] = order.get(b.field)
    return ai - bi || ao - bo
  })
}

/**
 * Item lists and item pages of a content map, from its presentation lock (block settings) and the audit's findings.
 * The map should already carry its slot fit, so each card field gets the measured character limit.
 * @param {{map: any, lock: any, findings: any}} input
 * @returns {{itemLists: Record<string, any>, itemPages: Record<string, any>}}
 */
export function itemListsOf({ map, lock, findings }) {
  const entities = map.entities ?? []
  const slotsByKey = new Map((map.slots ?? []).map((s) => [s.key, s]))
  const categoryById = new Map(
    entities.filter((e) => e.kind === 'category').map((e) => [String(e.sourceId), e])
  )
  const categoryPage = (cat) => {
    const page = (map.pages ?? []).find((p) => {
      const link = String(p.link ?? '')
      return /[?&]view=category\b/.test(link) && new RegExp(`[?&]id=${cat.sourceId}(?:&|$)`).test(link)
    })
    return page ? { page: page.entity, route: page.route ?? null } : { page: null, route: null }
  }
  const titleOf = (cat) =>
    (map.slots ?? []).find((s) => s.entity === cat.key && s.column === 'title')?.sample ??
    cat.identity?.title ??
    cat.identity?.path ??
    null
  const assignedTo = new Map()
  for (const p of map.pages ?? [])
    for (const m of p.assignedModules ?? []) {
      const e = typeof m === 'string' ? m : m.entity
      if (!assignedTo.has(e)) assignedTo.set(e, new Set())
      assignedTo.get(e).add(p.entity)
    }
  const itemLists = {}
  const itemPages = {}
  const atPosition = new Map()
  for (const e of entities.filter((x) => x.kind === 'module' && x.identity?.position))
    atPosition.set(e.identity.position, (atPosition.get(e.identity.position) ?? 0) + 1)
  for (const block of entities.filter((e) => e.kind === 'module')) {
    const soleAt = atPosition.get(block.identity?.position) === 1 ? block.identity.position : null
    const params = objectOf(lock?.entities?.[block.key]?.params)
    const source = sourceOf(params, categoryById)
    if (!source) continue
    const catKeys = new Set(source.cats.map((c) => c.key))
    // A category's descendants count too: the observation decides what the block really shows.
    const catPaths = source.cats.map((c) => c.identity?.path).filter(Boolean)
    for (const c of categoryById.values())
      if (catPaths.some((p) => String(c.identity?.path ?? '').startsWith(`${p}/`))) catKeys.add(c.key)
    const candidates = new Set(
      entities
        .filter((e) => ITEM_KINDS.has(e.kind) && catKeys.has(e.identityReferences?.catid))
        .map((e) => e.key)
    )
    let best = null
    for (const page of findings?.pages ?? []) {
      const assigned = (page.mapPages ?? []).some((m) => assignedTo.get(block.key)?.has(m.entity))
      const seen = cardsOnPage(page, blockPool(block, assigned, soleAt), candidates, slotsByKey)
      if (!seen) continue
      if (!best || seen.cards.size > best.cards.size || (best.by === 'page' && seen.by === 'block'))
        best = { ...seen, url: page.url }
    }
    const shown = best
      ? [...best.cards.entries()].sort(([, a], [, b]) => a.first - b.first).map(([e]) => e)
      : []
    const [main] = source.cats
    const where = categoryPage(main)
    const rowSlots = best ? rowSlotsOf(shown, best, slotsByKey) : []
    const max = source.count ?? (shown.length || null)
    itemLists[`${block.key}.items`] = {
      block: block.key,
      rowKind: 'items',
      source: { kind: 'category', id: main.key, title: titleOf(main), ...where },
      ...(source.cats.length > 1 ? { alsoFrom: source.cats.slice(1).map((c) => c.key) } : {}),
      min: null,
      minFrom: 'unknown',
      max,
      maxFrom: source.count ? 'block-setting' : max ? 'demo-count' : 'unknown',
      shown,
      rowSlots,
      demoOwned: rowSlots.filter((r) => r.demoOwned).flatMap((r) => r.items.map((i) => i.slot)),
      observedBy: best ? best.by : null,
      observedOn: best ? pathOfHref(best.url) : null
    }
    for (const item of shown) {
      const path = best.cards.get(item).path
      if (!path) continue
      const cat = entities.find((e) => e.key === item)?.identityReferences?.catid ?? main.key
      const catEntity = [...categoryById.values()].find((c) => c.key === cat) ?? main
      const at = categoryPage(catEntity)
      const row = (itemPages[item] ??= {
        path,
        category: catEntity.key,
        categoryPage: at.page,
        categoryRoute: at.route,
        linkedFrom: []
      })
      if (!row.linkedFrom.includes(block.key)) row.linkedFrom.push(block.key)
    }
  }
  return { itemLists, itemPages }
}
