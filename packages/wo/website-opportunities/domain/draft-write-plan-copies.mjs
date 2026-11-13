// What a copy or an in-place record needs besides its words (ticket #597): the `hides` of its block (rows cut, a button
// element taken out, a setting that hides an empty button), the `resets` of its placement (the category it lists, the
// position of its container, the ordering of its recipe), its module title and the mark a resumed run finds it by.
// Pure; part of `writePlanOf`. Spec: `docs/references/ai-quickstart-contract.md`, "Copies and blocks written in place".
import { addressOf, rowIndexOf } from './draft-write-codec.mjs'
import { put, recordOf, unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a block field holds a value on the record (any of its locations). */
function holds(state, record, field) {
  const me = state.kit.mapping.blocks?.[record.block]?.fields?.[field]
  if (!me?.entity) return false
  return record.values.has(addressOf(me))
}
const elementOf = (xpath) => String(xpath ?? '').replace(/\/(@[\w-]+|text\(\)(\[\d+\])?)$/, '')

function applyHides(state, record) {
  for (const hide of list(state.kit.mapping.hides?.[record.block])) {
    if (hide.by === 'row' && record.kind === 'copy') {
      for (const row of Array.isArray(hide.row) ? hide.row : [hide.row]) {
        const kept = [
          ...new Set([...record.values.values()].map((v) => rowIndexOf(v.loc, row)).filter((i) => i !== null))
        ].sort((a, b) => a - b)
        record.cuts.push({ row, kept, rule: 'hides.row' })
        if (row.keys) unproven(state.sink, 'row_form_keys', { record: record.key })
      }
      continue
    }
    if (!hide.control) continue
    const written = hide.control.map((f) => holds(state, record, f))
    record.controls.push({ fields: hide.control, written, by: hide.by })
    if (written.some(Boolean)) continue
    if (hide.by === 'rows.remove') {
      const link = state.kit.mapping.blocks[record.block].fields[hide.control.at(-1)]
      if (record.kind === 'copy')
        record.removes.push({
          loc: { ...link, xpath: undefined },
          xpath: elementOf(link.xpath),
          rule: 'hides.rows.remove'
        })
      else record.contractRemoves.push(...list(hide.slots))
    } else if (hide.by === 'setting') {
      if (record.kind === 'copy')
        put(state.sink, record.key, hide.location, hide.value, { rule: 'hides.setting' })
      else record.settings.push({ loc: hide.location, value: hide.value, rule: 'hides.setting' })
    }
  }
}

function applyResets(state, record, placement) {
  for (const reset of list(placement.resets)) {
    const loc = reset.location
    if (reset.from === 'buildSets') {
      const key = `${loc.entity}:${loc.column}:${(loc.jsonPath ?? []).join('.')}`
      const pageType = state.kit.mapping.buildSets?.[key]?.pageType
      if (!pageType) continue
      recordOf(state.sink, `category:${pageType}`, {
        kind: 'created',
        recordKind: 'category',
        pageType,
        title: state.site.listTitleOf(pageType)
      })
      put(
        state.sink,
        record.key,
        loc,
        { ref: `category:${pageType}`, form: 'id' },
        { rule: 'resets.buildSets' }
      )
    } else if (reset.from === 'container') {
      const container = state.site.containerKeyOf(record)
      if (container)
        put(state.sink, record.key, loc, { ref: `tabs:${container}` }, { rule: 'resets.container' })
    } else if (reset.from === 'recipe') {
      put(state.sink, record.key, loc, record.order ?? 0, { rule: 'resets.recipe' })
      unproven(state.sink, 'recipe_ordering', { record: record.key })
    } else if (reset.from === 'demo') record.rules.add('resets.demo_kept')
    // `hides`: the setting is written by the block's `setting` hide, only while its button is empty (above).
  }
}

/**
 * Settle every copy and in-place record.
 * @param {object} state the planner's state, after the values are set
 */
export function planCopies(state) {
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'copy' && record.kind !== 'store') continue
    record.controls ??= []
    record.contractRemoves ??= []
    record.settings ??= []
    const placement = state.kit.mapping.placements?.[record.block]
    if (!placement) continue
    applyHides(state, record)
    if (record.kind !== 'copy') continue
    applyResets(state, record, placement)
    put(state.sink, record.key, { entity: record.entity, column: 'note' }, record.key, { rule: 'mark' })
    if (placement.title?.drawn === 'no' || placement.title?.drawn === 'aria-label')
      put(
        state.sink,
        record.key,
        { entity: record.entity, column: 'title' },
        `${record.block} ${[...record.pages][0] ?? 'site'}`,
        {
          rule: 'title_not_drawn'
        }
      )
    if (placement.holds?.position) record.tabsAt = placement.holds.position
  }
}
