// What a built site shows, place by place (ticket #597). Pure. A place with no real data is hidden, never padded: the
// build never invents content to fill a section.
//
//   item   hidden when the pictures step dropped it (`item_dropped`), a library block sets it aside (its reason) or
//          it shows nothing at all (`item_empty`, e.g. a network link hidden with its icon);
//   row    hidden when it holds nothing (`row_empty`: no written or data value, no own or generated picture, no icon;
//          `social_icon_not_in_template` when its network has no class in the template), or with its parent row, item
//          or block (`parent_hidden`);
//   list   hidden with all its rows when fewer rows show than its declared minimum (`list_below_min`);
//   block  a repeating block with fewer items shown than its `items.min` is hidden (`list_below_min`), or takes its
//          declared fallback when its no data rule is `fallback` (state `fallback`: the template or the CMS fills it,
//          e.g. a menu rebuilt from the pages); a block declaring content and showing none is hidden (`no_data`). A logo
//          frame counts as shown: the write step fills it from the order's look;
//   picture an empty picture frame of a shown place is hidden with its reason (`hideEmptyPictures`): the place keeps
//          its text, the writer removes the demo picture.
// A hidden place keeps no entries, pictures or icons: they leave with it, but stays in the order with its declared
// fields, so the order itself accounts for every field. `hidden` lists every place not shown, and only those.
const list = (value) => (Array.isArray(value) ? value : [])
/** A logo frame is filled by the write step from the order's look (the brand step's logo, or the name as text). */
const LOGO = 'logo_from_brand_step'
const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== '' && e.from !== 'derived'

/** Whether a place shows anything of its own. */
export const placeShows = (place) =>
  place.fields.some(hasValue) ||
  place.pictures.some(
    (p) => p.source === 'own' || p.source === 'generated' || p.source === 'initials' || p.reason === LOGO
  ) ||
  place.icons.some((i) => i.source !== 'none')

function hide(place, reason, hidden) {
  place.state = 'hidden'
  place.reason = reason
  place.fields = []
  place.pictures = []
  place.icons = []
  hidden.push({ at: place.at, reason })
}

/** The path of a child list without its row ranks: `exercises.2.steps` is `exercises.steps`. */
const pathOf = (key) => key.replace(/\.\d+(?=\.|$)/g, '')

/** The declared counts of every child list by its full path (`lists:` or `itemLists:` then the names), at any depth. */
function listCountsOf(description) {
  const counts = new Map()
  const walk = (children, prefix) => {
    for (const child of list(children)) {
      const path = `${prefix}${prefix.endsWith(':') ? '' : '.'}${child.name}`
      counts.set(path, child.items ?? { min: 0, max: 0 })
      walk(child.lists, path)
    }
  }
  walk(description?.lists, 'lists:')
  walk(description?.itemLists, 'itemLists:')
  return counts
}
const countsKeyOf = (group) => `${group.item === undefined ? 'lists:' : 'itemLists:'}${pathOf(group.list)}`

/** Hide every row of some lists with their parent (`parent_hidden`), each listed in `hidden`. */
function hideRows(groups, reason, hidden) {
  for (const group of groups) {
    for (const row of group.rows) if (row.state !== 'hidden') hide(row, reason, hidden)
    group.state = 'hidden'
    group.counts = { ...group.counts, shown: 0 }
  }
}

/** Rows, then lists against their minimum; nested lists after their parent rows. */
function settleLists(groups, description, hidden) {
  const counts = listCountsOf(description)
  // A row whose network the template has no class for says so, rather than that it is empty.
  const emptyReason = (row) =>
    row.icons.find((i) => i.source === 'none' && i.reason === 'social_icon_not_in_template')?.reason ??
    'row_empty'
  const hiddenRows = new Set()
  const depth = (g) => g.list.split('.').length
  for (const group of [...groups].sort((a, b) => depth(a) - depth(b))) {
    const parent = group.list.includes('.') ? group.list.replace(/\.[^.]+$/, '') : null
    for (const row of group.rows) {
      if (parent !== null && hiddenRows.has(`${group.item ?? ''}|${parent}`))
        hide(row, 'parent_hidden', hidden)
      else if (!placeShows(row)) hide(row, emptyReason(row), hidden)
      else row.state = 'show'
      if (row.state === 'hidden') hiddenRows.add(`${group.item ?? ''}|${row.row}`)
    }
    const items = counts.get(countsKeyOf(group)) ?? { min: 0, max: group.rows.length }
    const shown = group.rows.filter((r) => r.state === 'show').length
    group.counts = { min: items.min, max: items.max, shown }
    group.state = shown >= items.min && shown > 0 ? 'show' : 'hidden'
    if (shown < items.min) {
      group.reason = 'list_below_min'
      hidden.push({ at: group.at, reason: 'list_below_min' })
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
      hideRows(item.lists, 'parent_hidden', hidden)
    } else {
      settleLists(item.lists, description, hidden)
      const rows = item.lists.some((g) => g.rows.some((r) => r.state === 'show'))
      if (placeShows(item) || rows) item.state = 'show'
      else {
        hide(item, 'item_empty', hidden)
        hideRows(item.lists, 'parent_hidden', hidden)
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
      for (const item of shownItems) {
        hide(item, 'list_below_min', hidden)
        hideRows(item.lists, 'parent_hidden', hidden)
      }
      hideRows(block.lists, 'parent_hidden', hidden)
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

/**
 * Record every empty picture frame of a shown place as hidden (state `hidden`, listed in `hidden` with `picture: true`
 * and the frame's reason), so a writer removes the template's demo picture there. A logo frame is not empty: the write
 * step fills it from the order's look.
 * @param {object[]} places every place of the order
 */
export function hideEmptyPictures(places, hidden) {
  for (const place of places.filter((p) => p.state === 'show'))
    for (const picture of place.pictures)
      if (picture.source === 'none' && picture.reason !== LOGO) {
        picture.state = 'hidden'
        hidden.push({ at: picture.frame, reason: picture.reason ?? 'picture_empty', picture: true })
      }
}

/** Hide a whole block with its items and rows. */
export function hideBlock(block, reason, hidden) {
  hide(block, reason, hidden)
  if (block.counts) block.counts.shown = 0
  for (const item of block.items) {
    if (item.state !== 'hidden') hide(item, 'parent_hidden', hidden)
    hideRows(item.lists, 'parent_hidden', hidden)
  }
  hideRows(block.lists, 'parent_hidden', hidden)
}
