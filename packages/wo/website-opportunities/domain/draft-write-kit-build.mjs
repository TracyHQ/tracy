// What the kit declares about the build besides the pages (ticket #597), as the write plan reads it: the container
// copies (`placements.<id>.holds.copies`), the items of a menu block (`placements.<id>.menu.items`), the row a page
// type keys (`placements.<id>.keyedRow`), the HTML frames of created records (`createdFrames`) and the featured article
// (`seo.featuredView.article`). Pure; part of `writePlanOf`. A key the kit has not measured, or whose meaning the
// contract leaves open, is never acted on: when the plan needs it the plan stops typed, otherwise it is not read.
import { DraftWriteError } from './draft-write-error.mjs'
import { unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const shown = (block) => block.state !== 'hidden'

/**
 * The container copies of every page (`holds.copies: {perPage: 1, keptWhen}`): one container per page holds every
 * held block the page places, and is kept only while one of them is. Returns the container blocks to drop (none held
 * on their page); stops when a page places more containers than `perPage` or a held block with no container.
 */
export function droppedContainersOf(state) {
  const dropped = new Set()
  const placements = state.kit.mapping.placements ?? {}
  for (const page of state.order.pages)
    for (const [id, p] of Object.entries(placements)) {
      const copies = p.holds?.copies
      if (!copies) continue
      const containers = page.blocks.filter((b) => b.block === id && shown(b))
      const held = page.blocks.filter((b) => list(p.holds.blocks).includes(b.block) && shown(b))
      if (containers.length > copies.perPage)
        throw new DraftWriteError('container_copies_per_page', `${page.id} places ${id} more than once`, {
          page: page.id,
          block: id
        })
      if (held.length && !containers.length)
        throw new DraftWriteError(
          'held_block_without_container',
          `${page.id} places a block ${id} holds without it`,
          {
            page: page.id,
            block: id,
            held: held.map((b) => b.id)
          }
        )
      if (containers.length && !held.length) for (const c of containers) dropped.add(c.id)
    }
  return dropped
}

/**
 * The items of a menu block (`menu.items`). `from: "main-menu"` draws the page items. `from: "pages"` is a rule the kit
 * chose by default and has not measured: a block the order shows with no items of its own would need the write to
 * choose them by that rule, so the plan stops; items the order gives are written, at most `max` of them. A block the
 * order leaves to its fallback (`list_below_min`) does not need it: the order's own reason says why it is empty.
 */
export function checkMenuItems(state) {
  for (const page of state.order.pages)
    for (const block of page.blocks) {
      const items = state.kit.mapping.placements?.[block.block]?.menu?.items
      if (items?.from !== 'pages' || block.state !== 'show') continue
      const own = list(block.items).filter((i) => i.state !== 'hidden')
      const at = { page: page.id, block: block.block }
      if (!own.length)
        throw new DraftWriteError(
          'menu_items_not_measured',
          `${block.block} lists pages by a rule the kit has not measured, and the order gives no items`,
          at
        )
      if (Number.isInteger(items.max) && own.length > items.max)
        throw new DraftWriteError('menu_items_over_max', `${block.block} holds at most ${items.max} items`, {
          ...at,
          max: items.max,
          items: own.length
        })
    }
}

/** Whether a menu block draws the main menu: its items are the page items. */
export const drawsMainMenu = (kit, blockId) => {
  const menu = kit.mapping.placements?.[blockId]?.menu
  return menu?.items ? menu.items.from === 'main-menu' : menu?.menutype === kit.mainMenu
}

/**
 * Whether a list row keyed to a page is the row another field keys (`keyedRow`): the masthead prints the first row
 * whose item names the page, so a page of `keyedRow.pageType` takes `keyedRow.row` and never a row of the list.
 */
export function keyedRowTaken(state, blockId, scope, pageId) {
  const k = state.kit.mapping.placements?.[blockId]?.keyedRow
  if (!k || scope.list !== k.list) return false
  return state.order.pages.find((p) => p.id === pageId)?.pageType === k.pageType
}

const sameLoc = (f, loc) =>
  f.column === loc.column &&
  (f.nestedJson ?? null) === (loc.nestedJson ?? null) &&
  JSON.stringify(list(f.jsonPath)) === JSON.stringify(list(loc.jsonPath))

/**
 * The declared frames of a created record's HTML values (`createdFrames`): `[{loc, html}]`, one per value its pieces
 * sit in. A kit with no `createdFrames` keeps the smallest frame (`draft-write-frame.mjs`, flagged
 * `created_record_frame`); a kit that declares them stops when a value has none (`created_frame_not_declared`).
 */
export function framesOf(state, record) {
  const declared = state.kit.mapping.createdFrames
  if (!Array.isArray(declared)) return null
  const out = new Map()
  for (const { loc } of record.values.values()) {
    // A value written whole (`/html/body/div`) needs no frame.
    if (!loc.xpath || loc.xpath === '/html/body/div') continue
    const { xpath: _piece, slot: _slot, ...at } = loc
    const key = JSON.stringify([at.entity, at.column, at.nestedJson ?? '', list(at.jsonPath)])
    if (out.has(key)) continue
    const frame = declared.find((f) => list(f.entities).includes(loc.entity) && sameLoc(f, loc))
    if (!frame)
      throw new DraftWriteError(
        'created_frame_not_declared',
        `${record.key} writes into a value the kit gives no frame`,
        {
          record: record.key,
          entity: loc.entity,
          column: loc.column
        }
      )
    out.set(key, { loc: at, html: frame.html })
  }
  return [...out.values()]
}

/**
 * The featured article the featured view pages need (`seo.featuredView.article`): every created article of its page
 * type is written with `set`; with none in the plan, none is made, and the plan says so (`featured_article_none`).
 */
export function planFeaturedArticle(state) {
  const featured = state.kit.mapping.seo?.featuredView
  const a = featured?.article
  const needs = state.order.pages.some((p) => list(featured?.pageTypes).includes(p.pageType))
  if (!a) {
    const home = state.order.pages.find((p) => p.home && list(featured?.pageTypes).includes(p.pageType))
    if (home) unproven(state.sink, 'featured_article_needed', { page: home.id, why: featured.needs })
    return
  }
  const articles = [...state.sink.records.values()].filter(
    (r) => r.recordKind === 'article' && r.pageType === a.pageType
  )
  for (const r of articles) r.base = { ...r.base, [a.set.column]: a.set.value }
  if (needs && !articles.length) unproven(state.sink, 'featured_article_none', { why: a.none })
}
