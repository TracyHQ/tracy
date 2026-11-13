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

/**
 * The user message of one writer call. On a rewrite, `rewrite` lists the failing slots with what was written and why
 * it failed, and only those slots (and the blocks that hold them) are sent. `shown` (the page's data fields, from
 * `pageFieldsOf`) gives each block the values its data fields show: context, never a field to write.
 * @param {{plan: object, page: object, slots: object[], shown?: object[], byId: Map<string, object>,
 *   blocks: Map<string, object>, rewrite?: Array<{key: string, value: unknown, problems: object[]}>}} input
 */
export function pageWriterUser({ plan, page, slots, shown = [], byId, blocks, rewrite }) {
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
          .map(({ field, item, value }) => ({
            name: field.name,
            kind: field.kind,
            ...(item ? { item } : {}),
            value
          })),
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
