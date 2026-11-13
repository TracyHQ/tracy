// The field entries of the write order (ticket #597): one entry per declared non-design field of a place (a block, an
// item, a child list row), each saying where its value comes from. Pure. The order's own keys (`BASE_KEYS`: the place,
// the declared kind, type and `from`, the limit of its smallest stored place, its stored slots) always win over any key
// a writer entry carries.
//
//   copy    a text the model writes (`page-writer-roles.mjs` copy roles): the writer's value; a place the writer did
//           not write follows the block's no data rule (`reason: 'not_written'`). A main button label the customer
//           answered (`contact.cta_label`, or a label paired with a `contact.cta_url` link: `write-order-buttons.mjs`)
//           is the answer, character for character (`from: 'answer'`), whatever the writer wrote (`written`).
//   data    a text of a data role, a link or a number: the plan data only, never the writer (`write-order-data.mjs`).
//           A child list row takes the value the writer copied from the row's data (#615). A social link beside a
//           network icon takes the icon's link, and is hidden with the icon. A row text declared `textOf: "network"`
//           is the display name of the network of the row's link.
//   derived a link the build makes (`DERIVED_FORMS`): the target page is resolved here (`write-order-targets.mjs`).
// Image fields, video frames and icon fields are not entries: the pictures and the icons of the order hold them.
import { limitOf, placesOfField } from './field-place-limits.mjs'
import { DATA_ROLES } from './page-writer-roles.mjs'
import { isVideoFrame } from './picture-frames.mjs'
import { SOCIAL_URL_KINDS } from './picture-block-places.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { networkNameOf, TEXT_OF_NETWORK } from './row-network-text.mjs'
import { dataIdOf, dataValueOf, valueText } from './write-order-data.mjs'
import { targetOf } from './write-order-targets.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The keys of an entry the order sets itself; a writer entry never overrides them. */
export const BASE_KEYS = Object.freeze([
  'key',
  'place',
  'field',
  'kind',
  'type',
  'limit',
  'slots',
  'declared',
  'row',
  'list',
  'button'
])
/** The Contract A field keys the order reads; any other key a field declares is carried untouched (`declared`). */
const READ_KEYS = new Set(
  'name kind type slot slots limit limitFrom derived keyAt pageType for textOf frame frameFrom theme variantOf storage iconOf designFrom items itemsFrom'.split(
    ' '
  )
)
const declaredKeysOf = (field) => {
  const other = Object.entries(field).filter(([k]) => !READ_KEYS.has(k))
  return other.length ? { declared: structuredClone(Object.fromEntries(other)) } : {}
}
/** An entry with only the order's own keys, before its value is decided. */
export const keepBase = (e) =>
  Object.fromEntries(BASE_KEYS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))

/** Whether a field is written by the order's field entries (not a picture, a video, an icon or a design value). */
export const isEntryField = (field) =>
  field?.type === 'text' || ((field?.type === 'link' || field?.type === 'number') && !isVideoFrame(field))
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

const baseOf = (at, field, ctx) => ({
  key: [at.block, at.item, at.row, field.name].filter(Boolean).join('/'),
  place: `${at.prefix}.${field.name}`,
  field: field.name,
  kind: field.kind,
  type: field.type,
  ...(field.type === 'text' ? { limit: limitOf(field, ctx.placeLimits) } : {}),
  slots: placesOfField(field),
  ...declaredKeysOf(field),
  ...(at.row ? { row: at.row, list: at.listKey } : {})
})
const noData = (base, at, reason) => ({
  ...base,
  from: 'no-data',
  ...noDataOf(at.description),
  ...(reason ? { reason } : {})
})

/** The plan id a planned row holds (#615), never guessed from its value; undefined off a row. */
const rowDataOf = (at, ctx) =>
  at.row ? (ctx.plannedRows?.get(`${at.item ?? ''}|${at.row}`)?.data ?? null) : undefined

/** A data value: the plan's, or for a row the one the writer copied from the row's own data (#615). */
function dataOf(at, field, ctx, base) {
  if (!at.row) return dataValueOf(at, field, ctx.data)
  const copied = ctx.written.get(base.place)
  if (copied?.from !== 'data' || valueText(copied.value) === null) return null
  return { value: valueText(copied.value), data: rowDataOf(at, ctx) ?? copied.data ?? null }
}

/** The value and plan id of the social link of a place: the network icon's link, held by the place's own data. */
function socialLinkOf(at, field, ctx, icon) {
  const copied = dataOf(at, field, ctx, { place: `${at.prefix}.${field.name}` })
  // A planned row names the plan id it holds; only a row the plan did not plan (a plan before #615) is matched to the
  // fact holding exactly its link.
  if (at.row) {
    const value = copied?.value ?? icon.link
    return { value, data: rowDataOf(at, ctx) ?? copied?.data ?? dataIdOf(value, at, ctx.data) }
  }
  return { value: icon.link, data: dataIdOf(icon.link, at, ctx.data) }
}

/** A row label naming the network of the row's link (Contract A `textOf: "network"`): data, never copy. */
function networkTextOf(at, base, ctx) {
  const field = at.fields.find(isSocialLink)
  const link = field ? linkEntryOf(at, field, ctx) : null
  const name = link?.from === 'data' ? networkNameOf(link.value) : null
  if (name === null) return { ...base, from: 'no-data', action: 'hide', reason: 'network_unknown' }
  return { ...base, from: 'data', value: name, textOf: TEXT_OF_NETWORK, data: link.data }
}

function textEntryOf(at, field, ctx) {
  const base = baseOf(at, field, ctx)
  if (field.textOf === TEXT_OF_NETWORK) return networkTextOf(at, base, ctx)
  if (DATA_ROLES.includes(field.kind)) {
    const found = dataOf(at, field, ctx, base)
    return found ? { ...base, from: 'data', ...found } : noData(base, at)
  }
  const written = ctx.written.get(base.place)
  if (field.kind === 'contact.cta_label' && ctx.answer !== null) {
    const kept = written?.from === 'writer' && written.value !== ctx.answer ? { written: written.value } : {}
    return { ...base, from: 'answer', value: ctx.answer, data: 'contact-cta-label', ...kept }
  }
  if (!written) return noData(base, at, 'not_written')
  // A writer entry's own extra keys (`writtenBy`) pass through; the order's keys and the value keys are its own.
  const extras = { ...written }
  for (const k of [...BASE_KEYS, 'block', 'item', 'page', 'from', 'value', 'data', 'action', 'fallback'])
    delete extras[k]
  if (written.from === 'no-data' || !hasText(written.value))
    return {
      ...extras,
      ...noData(base, at),
      ...(written.action === 'fallback' ? { action: 'fallback', fallback: written.fallback } : {})
    }
  return { ...extras, ...base, from: 'writer', value: written.value }
}
const hasText = (value) => valueText(value) !== null

/** The network icon a social link field stands beside: the one of its row or item, or the one of its rank. */
function networkIconOf(at, field, ctx) {
  const icons = at.fields.filter((f) => isNetworkIcon(f) && f.variantOf === undefined)
  if (icons.length === 0) return null
  const links = at.fields.filter(isSocialLink)
  const icon = at.level === 'block' ? icons[links.indexOf(field)] : icons[0]
  return icon ? (ctx.icons.get(`${at.prefix}.${icon.name}`) ?? null) : null
}

function linkEntryOf(at, field, ctx) {
  const base = baseOf(at, field, ctx)
  const icon = isSocialLink(field) ? networkIconOf(at, field, ctx) : null
  if (icon) {
    if (icon.source === 'none' || !isText(icon.link))
      return {
        ...base,
        from: 'no-data',
        action: 'hide',
        reason: icon.reason === 'social_icon_not_in_template' ? icon.reason : 'network_icon_hidden',
        icon: icon.id
      }
    return { ...base, from: 'data', ...socialLinkOf(at, field, ctx, icon), icon: icon.id }
  }
  const found = dataOf(at, field, ctx, base)
  return found ? { ...base, from: 'data', ...found } : noData(base, at)
}

function derivedEntryOf(at, field, ctx) {
  const base = baseOf(at, field, ctx)
  const page = targetOf(at, field, ctx)
  if (page === null) return { ...base, from: 'no-data', action: 'hide', reason: 'derived_target_missing' }
  if (page === ctx.page.id && field.derived === 'the item page address')
    return { ...base, from: 'no-data', action: 'hide', reason: 'derived_self' }
  return { ...base, from: 'derived', derived: field.derived, target: { page } }
}

/**
 * The entry of one field of a place.
 * @param {{prefix: string, level: string, block: string, item?: string, row?: string, rank?: number, listKey?: string,
 *   fields: object[], description: object, blockData: string[]}} at the place
 * @param {object} field its declared field (`isEntryField`)
 * @param {{written: Map<string, object>, icons: Map<string, object>, data: object, answer: string | null,
 *   pages: object[], page: object, placeLimits: Map<string, number>}} ctx
 */
export function entryOf(at, field, ctx) {
  if (field.derived !== undefined) return derivedEntryOf(at, field, ctx)
  if (field.type === 'text') return textEntryOf(at, field, ctx)
  return linkEntryOf(at, field, ctx)
}
