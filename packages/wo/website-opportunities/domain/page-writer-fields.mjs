// The text fields of one page of the approved plan, each with where its value comes from (ticket #594, ADR 0046):
//
//   from: 'data'     a DATA field (`page-writer-roles.mjs`) whose value the block's plan data holds: copied in code,
//                    never written by the model
//   from: 'no-data'  a DATA field the block's plan data does not hold: it follows the block's declared no data rule
//                    (Contract A `noData`: `hide`, or `fallback` with what shows instead); never asked of the model
//   from: 'writer'   a COPY field: the model writes it (a slot)
//
// One copy role is kept verbatim (#597): a `contact.cta_label` block field whose block data holds the main button label
// the customer answered (`settleAnswers`, source `customer-answer`) is `from: 'data'` with that exact value; the model
// never rewrites it. A label the customer did not answer stays copy.
//
// Data comes only from the plan data the block shows (`block.data`, plan ids of `planDataOf`): a fact of the field's
// kind for a block field, the item's own field value for an item field. The block store and the library are read for
// their declared shape only; a stray demo or example value on a block or a field is never read.
import { limitOf } from './field-place-limits.mjs'
import { WRITER_FIELD_TYPES } from './page-copy-check.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'
import { roleOrigin } from './page-writer-roles.mjs'
import { rowFieldsOf } from './page-writer-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const textOf = (value) =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : null
const isText = (value) => textOf(value) !== null && textOf(value).trim() !== ''

/**
 * A failure of the writer, with a code the step chain reports (ADR 0047, #591). `details` keeps what the report needs.
 * `noRerun: true` when the writer already made its own second attempt: the engine stops at once (#597).
 */
export class PageWriterError extends Error {
  constructor(code, message, details = {}, { noRerun = false } = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    if (noRerun) this.noRerun = true
  }
}

/** The block descriptions by id: the template's block store first, then the Tracy library blocks it lacks. */
export function blockDescriptionsOf(blockStore, library = []) {
  const blocks = new Map()
  for (const block of list(blockStore?.blocks)) blocks.set(block.id, block)
  for (const block of list(library)) if (!blocks.has(block.id)) blocks.set(block.id, block)
  return blocks
}

/**
 * The key of a field: `<block>/<field>`, or `<block>/<item>/<field>` for an item field. A child list row field is
 * keyed by its row too: `<block>[/<item>]/<row>/<field>` (`page-writer-rows.mjs`).
 */
export const slotKey = (blockId, fieldName, itemId) =>
  itemId === undefined ? `${blockId}/${fieldName}` : `${blockId}/${itemId}/${fieldName}`

/** The field as the writer reads it: its limit is the smallest of the stored places it writes (`limitOf`). */
const declared = (field, placeLimits) => ({
  name: field.name,
  type: field.type,
  ...(field.kind ? { kind: field.kind } : {}),
  limit: limitOf(field, placeLimits)
})

/** The origin of a text field (`data` or `copy`), or false for a field the writer never fills. */
function originOf(field, at) {
  if (!WRITER_FIELD_TYPES.includes(field?.type)) return false
  if (!Number.isInteger(field.limit) || field.limit < 1)
    throw new PageWriterError('field_without_limit', `${at} is a text field without a declared limit`)
  const origin = roleOrigin(field.kind)
  if (origin === null)
    throw new PageWriterError(
      'field_kind_unknown',
      `${at} declares ${JSON.stringify(field.kind)}, not a known role`
    )
  if (origin === 'not-text')
    throw new PageWriterError(
      'field_kind_not_text',
      `${at} is a text field of ${field.kind}, a role without text`
    )
  return origin
}

/** The value of a data field from the block's plan data, or undefined when the data does not hold it. */
function dataValueOf({ field, block, item, byId }) {
  if (item !== undefined) {
    const value = byId.get(item)?.source?.fields?.[field.kind]?.value
    return isText(value) ? { value: textOf(value), data: item } : undefined
  }
  for (const id of list(block.data)) {
    const entry = byId.get(id)
    if (entry?.what === 'fact' && entry.kind === field.kind && isText(entry.entry.value))
      return { value: textOf(entry.entry.value), data: id }
  }
  return undefined
}

/** The copy roles the customer's own answer fixes word for word, when the block's plan data holds that answer. */
export const ANSWERED_COPY_ROLES = Object.freeze(['contact.cta_label'])

/** The customer's answered value of a copy field (`ANSWERED_COPY_ROLES`) from the block's plan data, else undefined. */
function answeredValueOf({ field, block, item, byId }) {
  if (item !== undefined || !ANSWERED_COPY_ROLES.includes(field.kind)) return undefined
  for (const id of list(block.data)) {
    const entry = byId.get(id)
    if (
      entry?.what === 'fact' &&
      entry.kind === field.kind &&
      list(entry.source?.sources).includes(ANSWER_SOURCE) &&
      typeof entry.entry.value === 'string' &&
      entry.entry.value.trim() !== ''
    )
      return { value: entry.entry.value, data: id }
  }
  return undefined
}

function noDataOf(description) {
  const rule = description?.noData?.rule === 'fallback' ? 'fallback' : 'hide'
  return rule === 'fallback'
    ? { action: 'fallback', fallback: description.noData.fallback }
    : { action: 'hide' }
}

/**
 * Every text field of one page, with its origin: every text field of every block, and every text item field once per
 * item the block shows. Design, image, icon, link and number fields of a block or an item are never listed: the writer
 * fills text only. Then every declared field of every planned child list row (`page-writer-rows.mjs`), with `row`.
 * @param {object} page a page of the plan (`plan.pages[]`)
 * @param {{blocks: Map<string, object>, byId: Map<string, object>, data?: object, placeLimits?: Map<string, number>}}
 *   context `byId`: the plan data (`planDataOf`); `data`: the whole plan data, its rows included; `placeLimits`: the
 *   smallest limit of each stored place (`placeLimitsOf`): every field, a block's, an item's or a row's, is written
 *   within the smallest limit of the places it writes
 * @returns {Array<{key: string, page: string, block: string, item?: string, row?: string, field: object,
 *   from: 'writer' | 'data' | 'no-data', value?: string, data?: string,
 *   action?: 'hide' | 'fallback' | 'derived' | 'network' | 'pictures', fallback?: string}>}
 */
export function pageFieldsOf(page, { blocks, byId, data = { byId }, placeLimits = new Map() }) {
  const out = []
  for (const block of list(page.blocks)) {
    const description = blocks.get(block.block)
    if (!description)
      throw new PageWriterError('unknown_block', `${block.block} of ${block.id} is not a block of the store`)
    const add = (field, item) => {
      const origin = originOf(field, `${block.block}.${field.name}`)
      if (!origin) return
      const base = {
        key: slotKey(block.id, field.name, item),
        page: page.id,
        block: block.id,
        ...(item === undefined ? {} : { item }),
        field: declared(field, placeLimits)
      }
      if (origin === 'copy') {
        const answered = answeredValueOf({ field, block, item, byId })
        return out.push(answered ? { ...base, from: 'data', ...answered } : { ...base, from: 'writer' })
      }
      const found = dataValueOf({ field, block, item, byId })
      out.push(
        found ? { ...base, from: 'data', ...found } : { ...base, from: 'no-data', ...noDataOf(description) }
      )
    }
    for (const field of list(description.fields)) add(field)
    const items = list(block.data).filter((id) => byId.get(id)?.what === 'item')
    for (const item of items) for (const field of list(description.itemFields)) add(field, item)
    const base = (field, item, row) => ({
      key: slotKey(block.id, `${row}/${field.name}`, item),
      page: page.id,
      block: block.id,
      ...(item === undefined ? {} : { item }),
      field: declared(field, placeLimits)
    })
    out.push(...rowFieldsOf(block, description, { data, base, originOf }))
  }
  return out
}

/** The slots of one page: its COPY fields only, the fields the model writes (`pageFieldsOf`, `from: 'writer'`). */
export const pageSlotsOf = (page, context) => pageFieldsOf(page, context).filter((f) => f.from === 'writer')

/** Every value of the plan data as text (facts and item fields), for the guard against invented data in copy. */
export function knownValuesOf(byId, rowsById = new Map()) {
  const values = []
  for (const entry of byId.values()) {
    if (entry.what === 'fact') values.push(textOf(entry.entry.value))
    else for (const f of Object.values(entry.source?.fields ?? {})) values.push(textOf(f?.value))
  }
  for (const row of rowsById.values()) values.push(...Object.values(row.values).flat())
  return values.filter((v) => v !== null)
}
