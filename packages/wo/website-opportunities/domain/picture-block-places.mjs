// The places of a placed block at every depth (ticket #595, spec #577): the block itself, each item it shows, and each
// row of its child lists (Contract A `lists` and `itemLists`, `ai-quickstart-child-lists.mjs`), rows of nested lists
// included. The picture frames (`picture-frames.mjs`) and the icon fields (`icon-fields.mjs`) are read from these
// places, so a field inside a child list is never invisible. Pure.
//
// A child list row is its own item: its fields are the words and the frames of that row. The plan does not say how
// many rows a child list gets, so every row the list may hold (`items.max` per parent place) is a place; a row the
// write step leaves out drops its decisions with it.
//
// Place ids extend the field ids of the plan: `<page>.<block>.<field>` for a block field, `<page>.<block>.<item>.<field>`
// for an item field, and `<page>.<block>[.<item>].<list>.<n>[.<list>.<n>].<field>` for a row field (`n` from 1).
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The data kind of a social link. */
export const SOCIAL_URL = 'contact.social_url'

/** The social links a placed block shows, in its data order: social link facts, and items holding one. */
export function socialLinksOf(block, data) {
  const out = []
  for (const id of list(block?.data)) {
    const entry = data.byId.get(id)
    if (entry?.what === 'fact' && entry.kind === SOCIAL_URL) out.push({ id, url: entry.entry.value })
    else if (entry?.what === 'item') {
      const url = entry.source?.fields?.[SOCIAL_URL]?.value
      if (isText(url)) out.push({ id, url })
    }
  }
  return out
}

/**
 * The items a placed block shows: its social links when its item fields hold a social link (a footer row of links),
 * else the plan items of its data, in data order.
 * @returns {Array<{id: string, kind: string, url?: string | null}>}
 */
export function shownItemsOf(block, description, data) {
  if (list(description?.itemFields).some((f) => f?.kind === SOCIAL_URL))
    return socialLinksOf(block, data).map((l) => ({ id: l.id, kind: 'social', url: l.url }))
  return list(block?.data)
    .map((id) => ({ id, entry: data.byId.get(id) }))
    .filter((d) => d.entry?.what === 'item')
    .map((d) => ({ id: d.id, kind: d.entry.kind }))
}

/** The rows of the child lists of `owner`, each with its own rows' nested lists, at every depth. */
function rowsOf(owner, keys, parent, out) {
  for (const key of keys)
    for (const child of list(owner?.[key])) {
      const max = Number.isInteger(child?.items?.max) && child.items.max > 0 ? child.items.max : 0
      for (let n = 1; n <= max; n++) {
        const row = parent.row ? `${parent.row}.${child.name}.${n}` : `${child.name}.${n}`
        out.push({ ...parent, level: 'row', row, list: child.name, fields: list(child.fields) })
        rowsOf(child, ['lists'], { ...parent, row }, out)
      }
    }
  return out
}

/**
 * Every place of one placed block, at every depth: the block itself (`level: 'block'`, its `fields`), each shown item
 * (`level: 'item'`, the `itemFields`), each row of its `lists`, and each row of its `itemLists` per shown item.
 * @returns {Array<{level: 'block' | 'item' | 'row', prefix: string, item?: string, itemKind?: string,
 *   url?: string | null, row?: string, list?: string, fields: object[]}>} `prefix` is the id of the place, its
 *   fields' ids are `<prefix>.<field name>`
 */
export function placesOfBlock(page, block, description, data) {
  const base = `${page.id}.${block.id}`
  const out = [{ level: 'block', prefix: base, fields: list(description?.fields) }]
  rowsOf(description, ['lists'], {}, []).forEach((r) => out.push({ ...r, prefix: `${base}.${r.row}` }))
  for (const item of shownItemsOf(block, description, data)) {
    const at = {
      item: item.id,
      itemKind: item.kind,
      ...(item.kind === 'social' ? { url: item.url ?? null } : {})
    }
    out.push({ level: 'item', prefix: `${base}.${item.id}`, ...at, fields: list(description?.itemFields) })
    for (const r of rowsOf(description, ['itemLists'], {}, []))
      out.push({ ...r, ...at, prefix: `${base}.${item.id}.${r.row}` })
  }
  return out
}

/** The field names that appear more than once in one place: two fields of one place would share an id. */
export function repeatedNames(fields) {
  const seen = new Set()
  const repeated = new Set()
  for (const f of list(fields)) (seen.has(f?.name) ? repeated : seen).add(f?.name)
  return [...repeated]
}
