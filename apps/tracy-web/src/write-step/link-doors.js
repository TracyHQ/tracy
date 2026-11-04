// Which door holds a kit link on this site (TracyHQ/tracy#371): nothing here writes. A link's address is held by its own link slot,
// by the link slot of its label's row or anchor, by a link slot of its block that holds the address the kit measured, by a menu
// item when a menu module prints it, or inside a slot of words. Several links can share one address (a card's picture and name).
import { contentMapKey } from '../site-writer/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])
const slashless = (path) =>
  String(path ?? '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
const ANCHOR = /(?:\(\(|<)a href="#"/g
const anchorParent = (xpath) =>
  /^(.*)\/(?:text\(\)(?:\[\d+\])?|@href)$/.exec(String(xpath ?? ''))?.[1] ?? null
const NOT_ADDRESSES = new Set(['business.video'])

/** A slot that holds an address, as opposed to words: the map's url type, or a `*_url` role kept in a text column. */
export const holdsAddress = (slot) =>
  !NOT_ADDRESSES.has(slot?.role) && (slot?.type === 'url' || String(slot?.role ?? '').endsWith('_url'))

/** A control the kit measured as acting inside the page: a panel, a modal, a form, a picture's lightbox. */
export const actsInsidePage = (link) =>
  link?.action === 'page-control' && Boolean(link.opens || link.icon?.mechanism === 'image-file')

/** The path a captured value opens: a menu item's or the home page's. */
function pathOfValue(value, rowsById) {
  const text = String(value ?? '')
  const item = /^index\.php\?Itemid=(\d+)$/.exec(text)
  if (item) {
    const row = rowsById.get(Number(item[1]))
    if (!row) return null
    return Number(row.home) === 1 ? '' : slashless(row.path)
  }
  if (text === 'index.php') return ''
  return text.startsWith('/') ? slashless(text) : null
}

const lastIndex = (slot) => {
  const last = each(slot?.jsonPath).at(-1)
  return typeof last === 'number' ? last : 0
}

/** The links of a block with no address the kit measured, in page order, against the anchors of its slots of words. */
function anchorsOfBlock(block, slots) {
  const holders = slots
    .filter((s) => s.entity === block?.source?.entity && !holdsAddress(s))
    .map((s) => ({
      key: s.key,
      order: lastIndex(s),
      count: String(s.sample ?? '').match(ANCHOR)?.length ?? 0
    }))
    .filter((s) => s.count)
    .sort((a, b) => a.order - b.order)
  const anchors = holders.flatMap((h) => Array.from({ length: h.count }, () => h.key))
  const links = each(block?.links)
    .filter((l) => !l?.target && !l?.labelId)
    .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0))
  const found = new Map()
  if (anchors.length === links.length) links.forEach((l, i) => found.set(l.id, anchors[i]))
  return found
}

/**
 * @param {{ kit: object, reading: object, rows: object[] }} input
 * @returns {(id: string) => { via: string, link?: object, block?: object, keys?: string[], key?: string, item?: number, row?: object }}
 *   `via`: "slot" (`keys` holds the address), "shared" (`keys` hold one address several links show), "menu", "words" (`key`
 *   holds it among its words), "words-only" (the plan names a slot of words), "none" (no door) or "no-kit-link"
 */
export function linkDoors({ kit, reading, rows }) {
  const slotList = each(reading?.slots)
  const slots = new Map(slotList.map((s) => [s?.key, s]))
  const rowsById = new Map(rows.map((r) => [Number(r.id), r]))
  const byId = new Map()
  const byLabel = new Map()
  for (const block of each(kit?.blocks))
    for (const link of each(block?.links)) {
      byId.set(link?.id, { link, block })
      if (link?.labelId && !byLabel.has(link.labelId)) byLabel.set(link.labelId, { link, block })
    }
  const anchorCache = new Map()
  const anchorsOf = (block) => {
    if (!anchorCache.has(block)) anchorCache.set(block, anchorsOfBlock(block, slotList))
    return anchorCache.get(block)
  }

  /** The link slot of the label's row, or of the same anchor of an HTML field. */
  function byItsLabel(link) {
    const label = slots.get(contentMapKey(link?.labelId))
    if (!label) return null
    const group = label.group?.id
    const inRow = group ? slotList.filter((s) => s.group?.id === group && holdsAddress(s)) : []
    if (inRow.length === 1) return inRow[0].key
    const anchor = anchorParent(label.xpath)
    if (!anchor) return null
    const sameAnchor = slotList.filter(
      (s) =>
        s.entity === label.entity &&
        s.column === label.column &&
        holdsAddress(s) &&
        anchorParent(s.xpath) === anchor
    )
    return sameAnchor.length === 1 ? sameAnchor[0].key : null
  }

  /** The link slots of its block that hold the address the kit measured on the link. */
  function byItsAddress(link, block) {
    if (!link?.target) return []
    const entities = new Set([block?.source?.entity, slots.get(contentMapKey(link.labelId))?.entity])
    const wanted = slashless(link.target)
    return slotList
      .filter(
        (s) =>
          entities.has(s.entity) && holdsAddress(s) && pathOfValue(s.sample ?? s.current, rowsById) === wanted
      )
      .map((s) => s.key)
  }

  return function doorOf(id) {
    const key = contentMapKey(id)
    const own = slots.get(key)
    if (own && holdsAddress(own)) return { via: 'slot', keys: [key], ...byId.get(id) }
    const found = byId.get(id) ?? byLabel.get(id)
    if (!found) return own ? { via: 'words-only', key } : { via: 'no-kit-link' }
    const { link, block } = found
    const labelled = byItsLabel(link)
    if (labelled) return { via: 'slot', keys: [labelled], ...found }
    const shared = byItsAddress(link, block)
    if (shared.length) return { via: 'shared', keys: shared, ...found }
    // The kit also names a menu on a link that merely opens that item's address: only a menu printed here is its door.
    if (link.menu && link.menuItem && (!block?.source?.entity || block.source.entity === link.menu)) {
      const item = Number(String(link.menuItem).replace(/^menuItem-/, ''))
      return { via: 'menu', item, row: rowsById.get(item), ...found }
    }
    const inWords = anchorsOf(block).get(link.id)
    if (inWords) return { via: 'words', key: inWords, ...found }
    return { via: 'none', ...found }
  }
}

export { slashless }
