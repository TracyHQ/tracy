// What a built site shows, place by place (ticket #597). Pure. A place with no real data is hidden, never padded: the
// build never invents content to fill a section.
//
//   item   hidden when the pictures step dropped it (`item_dropped`), a library block sets it aside (its reason) or
//          it shows nothing at all (`item_empty`, e.g. a network link hidden with its icon);
//   row    hidden when it holds nothing (`row_empty`: no written or data value, no own or generated picture, no icon),
//          or when its parent row is hidden (`parent_hidden`);
//   list   hidden with all its rows when fewer rows show than its declared minimum (`list_below_min`);
//   block  a repeating block with fewer items shown than its `items.min` is hidden (`list_below_min`), or takes its
//          declared fallback when its no data rule is `fallback` (state `fallback`: the template or the CMS fills it,
//          e.g. a menu rebuilt from the pages); a block declaring content and showing none is hidden (`no_data`). A logo
//          frame counts as shown: the write step fills it from the order's look.
// A hidden place keeps no entries, pictures or icons: they leave with it, and `hidden` lists every place not shown.
const list = (value) => (Array.isArray(value) ? value : [])
/** A logo frame is filled by the write step from the order's look (the brand step's logo, or the name as text). */
const LOGO = 'logo_from_brand_step'
const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== '' && e.from !== 'derived'

/** Whether a place shows anything of its own. */
export const placeShows = (place) =>
  place.fields.some(hasValue) ||
  place.pictures.some((p) => p.source === 'own' || p.source === 'generated' || p.reason === LOGO) ||
  place.icons.some((i) => i.source !== 'none')

function hide(place, reason, hidden) {
  place.state = 'hidden'
  place.reason = reason
  place.fields = []
  place.pictures = []
  place.icons = []
  hidden.push({ at: place.at, reason })
}

/** The declared counts of a child list by its name, at any depth. */
function listCountsOf(description) {
  const counts = new Map()
  const walk = (owner) => {
    for (const child of [...list(owner?.lists), ...list(owner?.itemLists)]) {
      counts.set(child.name, child.items ?? { min: 0, max: 0 })
      walk(child)
    }
  }
  walk(description)
  return counts
}

/** Rows, then lists against their minimum; nested lists after their parent rows. */
function settleLists(groups, description, hidden) {
  const counts = listCountsOf(description)
  const hiddenRows = new Set()
  const depth = (g) => g.list.split('.').length
  for (const group of [...groups].sort((a, b) => depth(a) - depth(b))) {
    const parent = group.list.includes('.') ? group.list.replace(/\.[^.]+$/, '') : null
    for (const row of group.rows) {
      if (parent !== null && hiddenRows.has(`${group.item ?? ''}|${parent}`))
        hide(row, 'parent_hidden', hidden)
      else if (!placeShows(row)) hide(row, 'row_empty', hidden)
      else row.state = 'show'
      if (row.state === 'hidden') hiddenRows.add(`${group.item ?? ''}|${row.row}`)
    }
    const items = counts.get(group.name) ?? { min: 0, max: group.rows.length }
    const shown = group.rows.filter((r) => r.state === 'show').length
    group.counts = { min: items.min, max: items.max, shown }
    group.state = shown >= items.min && shown > 0 ? 'show' : 'hidden'
    if (shown < items.min) {
      group.reason = 'list_below_min'
      hidden.push({ at: group.rows[0]?.at.replace(/\.\d+$/, '') ?? group.list, reason: 'list_below_min' })
      for (const row of group.rows.filter((r) => r.state === 'show')) {
        hide(row, 'list_below_min', hidden)
        hiddenRows.add(`${group.item ?? ''}|${row.row}`)
      }
      group.counts.shown = 0
    }
  }
}

/**
 * Settle what one block shows, in place.
 * @param {object} block the order block (own place, items, lists)
 * @param {object} description its declaration
 * @param {{dropped: Map<string, string>, hidden: object[]}} ctx `dropped`: item place id -> reason
 */
export function settleBlock(block, description, { dropped, hidden }) {
  if (block.state === 'hidden') return
  for (const item of block.items) {
    const reason = dropped.get(item.at) ?? item.setAside
    if (reason) {
      hide(item, reason, hidden)
      item.lists = []
    } else {
      settleLists(item.lists, description, hidden)
      const rows = item.lists.some((g) => g.rows.some((r) => r.state === 'show'))
      if (placeShows(item) || rows) item.state = 'show'
      else {
        hide(item, 'item_empty', hidden)
        item.lists = []
      }
    }
  }
  settleLists(block.lists, description, hidden)
  const shownItems = block.items.filter((i) => i.state === 'show')
  shownItems.forEach((item, index) => {
    item.index = index
  })
  const min = description.items?.min ?? 0
  block.counts = {
    min,
    max: description.items?.max ?? null,
    available: shownItems.length,
    shown: shownItems.length
  }
  const repeating = list(description.itemFields).length > 0
  if (repeating && shownItems.length < min) {
    if (description.noData?.rule === 'fallback') {
      block.state = 'fallback'
      block.reason = 'list_below_min'
      block.fallback = description.noData.fallback
      for (const item of shownItems) hide(item, 'list_below_min', hidden)
      block.counts.shown = 0
      hidden.push({ at: block.at, reason: 'list_below_min', fallback: description.noData.fallback })
      return
    }
    return hideBlock(block, 'list_below_min', hidden)
  }
  const declaresContent = list(block.declared).some((f) => f.type !== 'design')
  const anything =
    !declaresContent ||
    placeShows(block) ||
    shownItems.length > 0 ||
    block.lists.some((g) => g.rows.some((r) => r.state === 'show'))
  if (!anything) return hideBlock(block, 'no_data', hidden)
  block.state = 'show'
}

/** Hide a whole block with its items and rows. */
export function hideBlock(block, reason, hidden) {
  hide(block, reason, hidden)
  if (block.counts) block.counts.shown = 0
  for (const item of block.items) if (item.state !== 'hidden') hide(item, reason, [])
  for (const item of block.items) item.lists = []
  block.lists = []
}
