// What one writer call of the AI quickstart build reads (ticket #594, ADR 0046): exactly the fields of ONE page of the
// approved plan, each with its declared type and limit from the block store (Contract A), and the plan data each block
// shows. The block store and the library are read for their declared shape only; a stray demo or example value on a
// block or a field never reaches the model.
import { WRITER_FIELD_TYPES } from './page-copy-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

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

/** The slot key of a field: `<block>/<field>`, or `<block>/<item>/<field>` for an item field. */
export const slotKey = (blockId, fieldName, itemId) =>
  itemId === undefined ? `${blockId}/${fieldName}` : `${blockId}/${itemId}/${fieldName}`

const declared = ({ name, type, kind, limit }) => ({ name, type, ...(kind ? { kind } : {}), limit })

function writable(field, at) {
  if (!WRITER_FIELD_TYPES.includes(field?.type)) return false
  if (!Number.isInteger(field.limit) || field.limit < 1)
    throw new PageWriterError('field_without_limit', `${at} is a text field without a declared limit`)
  return true
}

/**
 * The slots of one page: every text field of every block, and every text item field once per item the block shows.
 * Design, image, icon, link and number fields are never slots: the writer writes copy only.
 * @param {object} page a page of the plan (`plan.pages[]`)
 * @param {{blocks: Map<string, object>, byId: Map<string, object>}} context `byId`: the plan data (`planDataOf`)
 * @returns {Array<{key: string, page: string, block: string, item?: string, field: object}>}
 */
export function pageSlotsOf(page, { blocks, byId }) {
  const slots = []
  for (const block of list(page.blocks)) {
    const description = blocks.get(block.block)
    if (!description)
      throw new PageWriterError('unknown_block', `${block.block} of ${block.id} is not a block of the store`)
    for (const field of list(description.fields))
      if (writable(field, `${block.block}.${field.name}`))
        slots.push({
          key: slotKey(block.id, field.name),
          page: page.id,
          block: block.id,
          field: declared(field)
        })
    const items = list(block.data).filter((id) => byId.get(id)?.what === 'item')
    for (const item of items)
      for (const field of list(description.itemFields))
        if (writable(field, `${block.block}.${field.name}`))
          slots.push({
            key: slotKey(block.id, field.name, item),
            page: page.id,
            block: block.id,
            item,
            field: declared(field)
          })
  }
  return slots
}

/** A data entry as the writer reads it: a fact's value, or an item's field values by data kind. */
function dataView(id, byId) {
  const entry = byId.get(id)
  if (!entry) return null
  if (entry.what === 'fact') {
    const { kind, label, value } = entry.entry
    return { id, kind, label, value }
  }
  const fields = entry.source?.fields ?? {}
  return {
    id,
    kind: entry.kind,
    label: entry.entry.label,
    fields: Object.fromEntries(Object.entries(fields).map(([role, f]) => [role, f?.value]))
  }
}

/**
 * The user message of one writer call. On a rewrite, `rewrite` lists the failing slots with what was written and why
 * it failed, and only those slots (and the blocks that hold them) are sent.
 * @param {{plan: object, page: object, slots: object[], byId: Map<string, object>, blocks: Map<string, object>,
 *   rewrite?: Array<{key: string, value: unknown, problems: object[]}>}} input
 */
export function pageWriterUser({ plan, page, slots, byId, blocks, rewrite }) {
  const wanted = rewrite ? new Set(rewrite.map((f) => f.key)) : null
  const asked = wanted ? slots.filter((s) => wanted.has(s.key)) : slots
  const name = list(plan.facts).find((f) => f.kind === 'business.name')?.value
  const out = {
    language: plan.language,
    business: isText(name) ? { name } : {},
    page: { id: page.id, name: page.name, pageType: page.pageType },
    blocks: list(page.blocks)
      .map((block) => ({
        id: block.id,
        type: blocks.get(block.block)?.type,
        label: block.label,
        data: list(block.data)
          .map((id) => dataView(id, byId))
          .filter(Boolean),
        fields: asked
          .filter((s) => s.block === block.id)
          .map(({ key, item, field }) => ({ key, ...field, ...(item ? { item } : {}) }))
      }))
      .filter((block) => block.fields.length > 0)
  }
  if (rewrite)
    out.rewrite = rewrite.map(({ key, value, problems }) => ({
      key,
      ...(value === undefined ? {} : { written: value }),
      problems: problems.map((p) => p.message)
    }))
  return out
}
