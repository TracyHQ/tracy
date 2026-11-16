// What a copy or an in-place record needs besides its words (ticket #597): the `hides` of its block (rows cut, a button
// element taken out, a setting that hides an empty button), the `resets` of its placement (the category it lists, the
// position of its container, the ordering of its recipe), its module title and the mark a resumed run finds it by.
// Pure; part of `writePlanOf`. Spec: `docs/references/ai-quickstart-contract.md`, "Copies and blocks written in place".
import { movedAfterCut, rowIndexOf } from './draft-write-codec.mjs'
import { emptyControl, holdsField, omitRows } from './draft-write-plan-hides.mjs'
import { categoryRecordOf } from './draft-write-kit-pages.mjs'
import { DraftWriteError } from './draft-write-error.mjs'
import { DRAFT_WRITE_HIDE_VALUES } from './draft-write-kit-keys.mjs'
import { put, unproven } from './draft-write-sink.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

const elementOf = (xpath) => String(xpath ?? '').replace(/\/(@[\w-]+|text\(\)(\[\d+\])?)$/, '')

/** A hide whose way the write does not know stops the plan, typed, before any door: it is never skipped in silence. */
function checkHideBy(record, hide) {
  if (DRAFT_WRITE_HIDE_VALUES.by.includes(hide.by)) return
  throw new DraftWriteError('hide_by_unknown', `${record.block} declares a hide the write does not know`, {
    block: record.block,
    by: hide.by ?? null
  })
}

/**
 * A group of fields (`fields`, #587): fields that print a frame of their own (a tile, a picture), taken off the page
 * when the record holds none of them. Not a pair: some written and some not is no problem, so it is no control.
 */
function fieldsHide(state, record, hide) {
  if (hide.fields.some((f) => groupHolds(state, record, f))) return
  if (hide.by === 'empty') emptyControl(state, record, { ...hide, control: hide.fields })
  else if (hide.by === 'setting') settingHide(state, record, hide)
  // `unassign`: the record's module on no page (`assignOf` makes it a `module.unassign`).
  else if (hide.by === 'unassign') record.unassign = { fields: hide.fields, rule: 'hides.unassign' }
  else unproven(state.sink, 'hide_fields_by_unread', { record: record.key, by: hide.by })
}

/** Whether the record holds a field of a group: at the field's locations, or, for a fact field, from that fact. */
function groupHolds(state, record, field) {
  const fact = state.kit.mapping.blocks?.[record.block]?.fields?.[field]?.fact
  if (!fact) return holdsField(state, record, field)
  return [...record.values.values()].some((v) => String(v.rule ?? '').split('+')[0] === `fact:${fact}`)
}

function settingHide(state, record, hide) {
  if (record.kind === 'copy')
    put(state.sink, record.key, hide.location, hide.value, { rule: 'hides.setting' })
  else record.settings.push({ loc: hide.location, value: hide.value, rule: 'hides.setting' })
}

function applyHides(state, record) {
  for (const hide of list(state.kit.mapping.hides?.[record.block])) checkHideBy(record, hide)
  for (const hide of list(state.kit.mapping.hides?.[record.block])) {
    if (hide.by === 'row' && record.kind === 'copy')
      for (const row of Array.isArray(hide.row) ? hide.row : [hide.row]) {
        const kept = [
          ...new Set([...record.values.values()].map((v) => rowIndexOf(v.loc, row)).filter((i) => i !== null))
        ].sort((a, b) => a - b)
        record.cuts.push({ row, kept, rule: 'hides.row' })
        if (row.keys) unproven(state.sink, 'row_form_keys', { record: record.key })
      }
  }
  // The controls after the rows are cut: an `empty` hide writes only into the rows the copy keeps.
  for (const hide of list(state.kit.mapping.hides?.[record.block])) {
    if (Array.isArray(hide.fields)) fieldsHide(state, record, hide)
    if (!hide.control) continue
    if (hide.by === 'empty') emptyControl(state, record, hide)
    const written = hide.control.map((f) => holdsField(state, record, f))
    record.controls.push({ fields: hide.control, written, by: hide.by })
    if (written.some(Boolean)) continue
    if (hide.by === 'rows.remove') {
      const link = state.kit.mapping.blocks[record.block].fields[hide.control.at(-1)]
      if (record.kind !== 'copy') {
        record.contractRemoves.push(...list(hide.slots))
        continue
      }
      // The whole stored value the control sits in: the link's location without its xpath, named where it stands
      // once the rows are cut (a cut renumbers the kept rows; a control in a row that was cut is gone with it).
      const { xpath: _piece, ...whole } = link
      let loc = whole
      for (const cut of record.cuts) loc = loc && movedAfterCut(loc, cut.row, cut.kept)
      if (!loc) continue
      // The element the hide declares (`element`), else the one holding the last field of the control.
      record.removes.push({ loc, xpath: hide.element ?? elementOf(link.xpath), rule: 'hides.rows.remove' })
    } else if (hide.by === 'setting') settingHide(state, record, hide)
  }
  // After the rows are cut: an omitted row element is named where it stands once the cut rows are gone.
  for (const hide of list(state.kit.mapping.hides?.[record.block]))
    if (hide.by === 'omit') omitRows(state, record, hide)
}

function applyResets(state, record, placement) {
  for (const reset of list(placement.resets)) {
    const loc = reset.location
    if (reset.from === 'buildSets') {
      const key = `${loc.entity}:${loc.column}:${(loc.jsonPath ?? []).join('.')}`
      const pageType = state.kit.mapping.buildSets?.[key]?.pageType
      if (!pageType) continue
      categoryRecordOf(state, pageType)
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
