// One placed block of the write order (ticket #597): its own fields, each item it shows and each row of its child
// lists, every place with its declared fields and their entries, and the pictures and icons of the place. Which places
// show is decided after (`write-order-hide.mjs`). Pure.
import { placesOfBlock } from './picture-block-places.mjs'
import { entryOf, isEntryField } from './write-order-fields.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isPicture = (field) =>
  field?.type === 'image' || (field?.type === 'link' && field.kind === 'business.video')
/** The list a row belongs to: its row id without its own rank (`social.2` is in `social`, `a.1.b.2` in `a.1.b`). */
export const listKeyOf = (row) => row.replace(/\.\d+$/, '')
const declaredOf = (fields) => fields.map(({ name, type }) => ({ name, type }))

/** A picture of the order from a frame of the pictures step, with the declared size of its field. */
function pictureOf(frame, field) {
  const { id, page, block, item, row, place, source, ref, file, label, theme, sameAs, reason, generate } =
    frame
  return {
    frame: id,
    page,
    block,
    ...(item ? { item } : {}),
    ...(row ? { row } : {}),
    field: field.name,
    kind: field.kind,
    place,
    source,
    ...(file ? { file } : {}),
    ...(ref ? { ref } : {}),
    ...(source === 'own' ? { alt: label ?? null } : {}),
    size: field.frame ? { width: field.frame.width, height: field.frame.height } : null,
    ...(theme ? { theme } : {}),
    ...(sameAs ? { sameAs } : {}),
    ...(reason ? { reason } : {}),
    ...(generate ? { generate } : {})
  }
}

/**
 * The page of every planned row keyed to a page (#615 `plan-rows.mjs`: `block.lists[].rows[].page`), by
 * `<item>|<row id>`, the row id of the pictures step (`<list>.<n>`, nested `<list>.<n>.<list>.<n>`).
 */
function plannedRowPagesOf(block) {
  const pages = new Map()
  const walk = (planned, item, prefix) =>
    list(planned?.rows).forEach((row, k) => {
      const id = prefix ? `${prefix}.${planned.name}.${k + 1}` : `${planned.name}.${k + 1}`
      if (typeof row?.page === 'string') pages.set(`${item ?? ''}|${id}`, row.page)
      for (const nested of list(row?.lists)) walk(nested, item, id)
    })
  for (const planned of list(block.lists)) walk(planned, planned.item, '')
  return pages
}

/** A place's entries, and the pictures and icons of its fields, by the place's id. */
function placeOf(at, ctx) {
  const fields = []
  const pictures = []
  const icons = []
  for (const field of at.fields) {
    if (field?.type === 'design') continue
    const placeId = `${at.prefix}.${field.name}`
    if (isPicture(field)) {
      const frame = ctx.frames.get(placeId)
      if (frame) pictures.push(pictureOf(frame, field))
    } else if (field.type === 'icon') {
      const icon = ctx.icons.get(placeId)
      if (icon) icons.push(icon)
    } else if (isEntryField(field)) fields.push(entryOf(at, field, ctx))
  }
  return { at: at.prefix, declared: declaredOf(at.fields), fields, pictures, icons }
}

/**
 * The places of one placed block, in the order's shape before hiding.
 * @param {object} page the plan page
 * @param {object} block the plan block (`{id, type, block, source, data}`)
 * @param {object} description its declaration (block store or library)
 * @param {object} ctx `{data, frames, icons, written, answer, pages}`
 */
export function blockPlacesOf(page, block, description, ctx) {
  const placeCtx = { ...ctx, page, rowPages: plannedRowPagesOf(block) }
  const out = { own: null, items: [], lists: [] }
  const groups = new Map()
  const rowOf = (at, owner) => {
    const key = listKeyOf(at.row)
    if (!groups.has(`${at.item ?? ''}|${key}`)) {
      const group = {
        list: key,
        name: at.list,
        ...(at.item === undefined ? {} : { item: at.item }),
        rows: []
      }
      groups.set(`${at.item ?? ''}|${key}`, group)
      owner.lists.push(group)
    }
    const place = placeOf({ ...at, listKey: key }, placeCtx)
    groups.get(`${at.item ?? ''}|${key}`).rows.push({ row: at.row, rank: at.rank, ...place })
  }
  const items = new Map()
  // A block that declares nothing per item shows its data as a whole: it has no item places of its own.
  const repeating = list(description.itemFields).length > 0 || list(description.itemLists).length > 0
  for (const raw of placesOfBlock(page, block, description, ctx.data)) {
    if (raw.level !== 'block' && raw.item !== undefined && !repeating) continue
    const at = { ...raw, block: block.id, description, blockData: list(block.data) }
    if (at.level === 'block') out.own = placeOf(at, placeCtx)
    else if (at.level === 'item') {
      const item = { id: at.item, data: at.item, ...placeOf(at, placeCtx), lists: [] }
      items.set(at.item, item)
      out.items.push(item)
    } else rowOf(at, at.item === undefined ? out : items.get(at.item))
  }
  return out
}
