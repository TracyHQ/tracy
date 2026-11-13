// The text fields of one page of the approved plan, each with where its value comes from (ticket #594, ADR 0046):
//
//   from: 'data'     a DATA field (`page-writer-roles.mjs`) whose value the block's plan data holds: copied in code,
//                    never written by the model
//   from: 'no-data'  a DATA field the block's plan data does not hold: it follows the block's declared no data rule
//                    (Contract A `noData`: `hide`, or `fallback` with what shows instead); never asked of the model
//   from: 'writer'   a COPY field: the model writes it (a slot)
//
// Data comes only from the plan data the block shows (`block.data`, plan ids of `planDataOf`): a fact of the field's
// kind for a block field, the item's own field value for an item field. The block store and the library are read for
// their declared shape only; a stray demo or example value on a block or a field is never read.
import { WRITER_FIELD_TYPES } from './page-copy-check.mjs'
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

/** A failure of the writer, with a code the step chain reports (ADR 0047, #591). `details` keeps what the report needs. */
export class PageWriterError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
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

const declared = ({ name, type, kind, limit }, shared) => ({
  name,
  type,
  ...(kind ? { kind } : {}),
  limit: Number.isInteger(shared) && Number.isInteger(limit) ? Math.min(limit, shared) : limit
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
 * @param {{blocks: Map<string, object>, byId: Map<string, object>, data?: object, sharedLimits?: Map<string, number>}}
 *   context `byId`: the plan data (`planDataOf`); `data`: the whole plan data, its rows included; `sharedLimits`: the
 *   smallest limit of the stored places a field shares with others, by `<block>/<field>` (`sharedLimitsOf`),
 *   applied to child list row fields (block and item fields keep their declared limit, as before #615)
 * @returns {Array<{key: string, page: string, block: string, item?: string, row?: string, field: object,
 *   from: 'writer' | 'data' | 'no-data', value?: string, data?: string,
 *   action?: 'hide' | 'fallback' | 'derived' | 'network' | 'pictures', fallback?: string}>}
 */
export function pageFieldsOf(page, { blocks, byId, data = { byId }, sharedLimits = new Map() }) {
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
        field: declared(field)
      }
      if (origin === 'copy') return out.push({ ...base, from: 'writer' })
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
      field: declared(field, sharedLimits.get(`${block.block}/${field.name}`))
    })
    out.push(...rowFieldsOf(block, description, { data, base, originOf }))
  }
  return out
}

/**
 * The smallest text limit of every field whose stored place another field also uses (Contract A: a shared place is
 * written within the smallest limit of its fields), by `<block>/<field>`.
 */
export function sharedLimitsOf(shared) {
  const out = new Map()
  for (const { limit, uses } of shared)
    if (Number.isInteger(limit))
      for (const use of uses) {
        const key = `${use.block}/${use.field}`
        out.set(key, Math.min(limit, out.get(key) ?? limit))
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
