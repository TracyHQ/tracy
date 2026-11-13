// What one writer call of the AI quickstart build reads (ticket #594, ADR 0046): exactly the COPY fields of ONE page of
// the approved plan, each with its declared type and limit from the block store (Contract A), and, as context only, the
// plan data each block shows and the values its DATA fields show (`page-writer-fields.mjs`). The model never writes a
// data field. The block store and the library are read for their declared shape only; a stray demo or example value on
// a block or a field never reaches the model.
export {
  PageWriterError,
  blockDescriptionsOf,
  pageFieldsOf,
  pageSlotsOf,
  slotKey
} from './page-writer-fields.mjs'

import { rowContextOf } from './page-writer-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

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

/** A planned row as the writer reads it: its values by data kind (a row of the profile, a fact) or its page. */
function rowView(row, byId, data, pages) {
  if (row.page !== undefined) {
    const page = list(pages).find((p) => p.id === row.page)
    return {
      row: row.row,
      ...(row.item ? { item: row.item } : {}),
      page: { name: page?.name, pageType: page?.pageType }
    }
  }
  const record = data?.rowsById?.get(row.data)
  const fact = byId.get(row.data)
  const values = record ? record.values : fact ? { [fact.kind]: [fact.entry.value] } : {}
  return { row: row.row, ...(row.item ? { item: row.item } : {}), fields: values }
}

/** The `rows` context of a block: present only when the block shows child list rows. */
function rowsOfBlock(block, shown, byId, data, pages) {
  const rows = rowContextOf(shown.filter((f) => f.block === block.id)).map((r) =>
    rowView(r, byId, data, pages)
  )
  return rows.length ? { rows } : {}
}

/**
 * The user message of one writer call. On a rewrite, `rewrite` lists the failing slots with what was written and why
 * it failed, and only those slots (and the blocks that hold them) are sent. `shown` (the page's data fields, from
 * `pageFieldsOf`) gives each block the values its data fields show: context, never a field to write.
 * @param {{plan: object, page: object, slots: object[], shown?: object[], byId: Map<string, object>,
 *   blocks: Map<string, object>, rewrite?: Array<{key: string, value: unknown, problems: object[]}>}} input
 */
export function pageWriterUser({ plan, page, slots, shown = [], byId, data, blocks, rewrite }) {
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
        shows: shown
          .filter((f) => f.block === block.id && f.from === 'data')
          .map(({ field, item, row, value }) => ({
            name: field.name,
            kind: field.kind,
            ...(item ? { item } : {}),
            ...(row ? { row } : {}),
            value
          })),
        ...rowsOfBlock(block, shown, byId, data, plan.pages),
        fields: asked
          .filter((s) => s.block === block.id)
          .map(({ key, item, row, field }) => ({
            key,
            ...field,
            ...(item ? { item } : {}),
            ...(row ? { row } : {})
          }))
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
