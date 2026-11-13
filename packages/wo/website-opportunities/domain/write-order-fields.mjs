// The field entries of the write order (ticket #597): one entry per declared non-design field of a place (a block, an
// item, a child list row), each saying where its value comes from. Pure.
//
//   text    the writer's entry for the place, passed through with every key it carries (`row` and `list` of the child
//           list work, #615, included); a place the writer did not write follows the block's no data rule, with
//           `reason: 'not_written'`. A main button label (`contact.cta_label`) the customer answered is the answer,
//           character for character (`from: 'answer'`), whatever the writer wrote (`written` keeps it).
//   link    from the plan data only, never from the writer: a fact of the field's kind the block shows, or the item's
//   number  own field value. A social link beside a network icon takes the icon's link, and is hidden with the icon.
//   derived a link the build makes (`DERIVED_FORMS`): the target page is resolved here, the address by the write step.
// Image fields, video frames and icon fields are not entries: the pictures and the icons of the order hold them.
import { KEYED } from './ai-quickstart-field-keys.mjs'
import { isVideoFrame } from './picture-frames.mjs'
import { SOCIAL_URL_KINDS } from './picture-block-places.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const valueText = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : isText(value) ? value : null

/** Whether a field is written by the order's field entries (not a picture, a video, an icon or a design value). */
export const isEntryField = (field) =>
  field?.type === 'text' || ((field?.type === 'link' || field?.type === 'number') && !isVideoFrame(field))
/** Whether a field stands for a network (Contract A `iconOf: "network"`). */
const isNetworkIcon = (field) => field?.type === 'icon' && field.iconOf === 'network'
const isSocialLink = (field) => field?.type === 'link' && SOCIAL_URL_KINDS.includes(field.kind)

/** The place id of a writer entry, in the ids of `picture-block-places.mjs`. */
export const writerPlaceOf = (pageId, e) =>
  [pageId, e.block, e.item, e.row, e.field].filter((part) => part !== undefined && part !== null).join('.')

/** The customer's answered main button label, or null. */
export function answeredLabelOf(profile) {
  const fact = list(profile?.facts?.['contact.cta_label'])[0]
  return fact && list(fact.sources).includes(ANSWER_SOURCE) && isText(fact.value) ? fact.value : null
}

export function noDataOf(description) {
  return description?.noData?.rule === 'fallback'
    ? { action: 'fallback', fallback: description.noData.fallback }
    : { action: 'hide' }
}

const baseOf = (at, field) => ({
  key: [at.block, at.item, at.row, field.name].filter(Boolean).join('/'),
  place: `${at.prefix}.${field.name}`,
  field: field.name,
  kind: field.kind,
  type: field.type,
  ...(field.type === 'text' ? { limit: field.limit } : {}),
  ...(at.row ? { row: at.row, list: at.listKey } : {})
})

function textEntryOf(at, field, ctx) {
  const base = baseOf(at, field)
  const written = ctx.written.get(base.place)
  if (field.kind === 'contact.cta_label' && ctx.answer !== null) {
    const kept = written?.from === 'writer' && written.value !== ctx.answer ? { written: written.value } : {}
    return { ...base, from: 'answer', value: ctx.answer, data: 'contact-cta-label', ...kept }
  }
  if (!written) return { ...base, from: 'no-data', ...noDataOf(at.description), reason: 'not_written' }
  const { key: _key, block: _block, item: _item, field: _field, ...rest } = written
  return { ...base, ...rest }
}

/** The plan data value of a link or number field, with the plan id it came from. */
function dataValueOf(at, field, data) {
  if (at.row) return null
  if (at.item !== undefined) {
    const entry = data.byId.get(at.item)
    if (entry?.what === 'fact')
      return entry.kind === field.kind && isText(entry.entry.value)
        ? { value: entry.entry.value, data: at.item }
        : null
    const raw = entry?.source?.fields?.[field.kind]?.value
    const value = valueText(Array.isArray(raw) ? raw.find(isText) : raw)
    return value === null ? null : { value, data: at.item }
  }
  for (const id of list(at.blockData)) {
    const entry = data.byId.get(id)
    if (entry?.what === 'fact' && entry.kind === field.kind && isText(entry.entry.value))
      return { value: entry.entry.value, data: id }
  }
  return null
}

/** The network icon a social link field stands beside: the one of its row or item, or the one of its rank. */
function networkIconOf(at, field, ctx) {
  const icons = at.fields.filter((f) => isNetworkIcon(f) && f.variantOf === undefined)
  if (icons.length === 0) return null
  const links = at.fields.filter(isSocialLink)
  const icon = at.level === 'block' ? icons[links.indexOf(field)] : icons[0]
  return icon ? (ctx.icons.get(`${at.prefix}.${icon.name}`) ?? null) : null
}

/** The plan id of a link value: the fact holding it, else the item of the place. */
function dataIdOf(value, at, data) {
  for (const [id, entry] of data.byId) if (entry.what === 'fact' && entry.entry.value === value) return id
  return at.item ?? null
}

function linkEntryOf(at, field, ctx) {
  const base = baseOf(at, field)
  const icon = isSocialLink(field) ? networkIconOf(at, field, ctx) : null
  if (icon) {
    if (icon.source === 'none' || !isText(icon.link))
      return { ...base, from: 'no-data', action: 'hide', reason: 'network_icon_hidden', icon: icon.id }
    return { ...base, from: 'data', value: icon.link, data: dataIdOf(icon.link, at, ctx.data), icon: icon.id }
  }
  // A child list row takes the value the writer copied from the row's own data (#615); never a written value.
  const copied = at.row ? ctx.written.get(base.place) : null
  if (copied?.from === 'data' && valueText(copied.value) !== null)
    return { ...base, from: 'data', value: valueText(copied.value), data: copied.data ?? null }
  const found = dataValueOf(at, field, ctx.data)
  return found
    ? { ...base, from: 'data', ...found }
    : { ...base, from: 'no-data', ...noDataOf(at.description) }
}

/** The page a derived link opens, or null. `pages`: the plan pages in order, the home page first. */
function targetOf(at, field, ctx) {
  const { pages, page } = ctx
  if (field.derived === KEYED) {
    if (at.row) {
      const planned = ctx.rowPages?.get(`${at.item ?? ''}|${at.row}`)
      if (planned !== undefined) return pages.some((p) => p.id === planned) ? planned : null
      // A plan without planned rows (before #615): row n of a list keyed to the pages is the n-th page.
      return ctx.rowPages?.size ? null : (pages[at.rank - 1]?.id ?? null)
    }
    if (field.pageType !== undefined) return pages.find((p) => p.pageType === field.pageType)?.id ?? null
    return page.id
  }
  if (at.item === undefined) return null
  if (field.derived === 'the page address' && pages.some((p) => p.id === at.item)) return at.item
  const own = pages.find(
    (p) => p.id !== page.id && list(p.blocks).some((b) => list(b.data).length === 1 && b.data[0] === at.item)
  )
  return own?.id ?? null
}

function derivedEntryOf(at, field, ctx) {
  const base = baseOf(at, field)
  const page = targetOf(at, field, ctx)
  if (page === null) return { ...base, from: 'no-data', action: 'hide', reason: 'derived_target_missing' }
  return { ...base, from: 'derived', derived: field.derived, target: { page } }
}

/**
 * The entry of one field of a place.
 * @param {{prefix: string, level: string, block: string, item?: string, row?: string, rank?: number, listKey?: string,
 *   fields: object[], description: object, blockData: string[]}} at the place
 * @param {object} field its declared field (`isEntryField`)
 * @param {{written: Map<string, object>, icons: Map<string, object>, data: object, answer: string | null,
 *   pages: object[], page: object}} ctx
 */
export function entryOf(at, field, ctx) {
  if (field.derived !== undefined) return derivedEntryOf(at, field, ctx)
  if (field.type === 'text') return textEntryOf(at, field, ctx)
  return linkEntryOf(at, field, ctx)
}
