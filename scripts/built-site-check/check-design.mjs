// Design typed fields that were written (ticket #601). A build never writes a design value of the template (Contract
// A): the write order has no entry for one (`write-order-check.mjs`, `design_field`), so any write at a design place
// is one the order never approved. A place is design typed when it is any of:
//   - the place of a store field typed `design` (its `slot`, or its mapping location);
//   - a location the mapping lists in a block's `designLines` (a config line of the template's look);
//   - a blank site contract slot whose role is `editorial.design_element`;
//   - a slot shared with any of these (a value typed as content stored on a design line).
// An icon class value outside the mapping's `networkIconClasses` is a design value of the icon font: reported too.
// Two sources: the write result's operations (what was sent), and the slots read back from the built site after the
// build (`stored`), compared with the blank site's value (`sample` of the content map). The rendered page alone does
// not show a design value, so this check does not read it.

const list = (value) => (Array.isArray(value) ? value : [])
const locKey = (loc) =>
  `${loc?.entity ?? ''}|${loc?.column ?? ''}|${JSON.stringify(loc?.jsonPath ?? [])}|${loc?.xpath ?? ''}`

/** Every design typed place of a kit: by slot and by location, each `{block, field, slot}`. */
export function designPlacesOf(kit) {
  const bySlot = new Map()
  const byLoc = new Map()
  const add = (loc, at) => {
    if (!loc || typeof loc !== 'object') return
    if (typeof loc.slot === 'string') bySlot.set(loc.slot, { ...at, slot: loc.slot })
    if (loc.entity) byLoc.set(locKey(loc), { ...at, slot: loc.slot ?? null })
  }
  for (const block of list(kit.blockStore?.blocks))
    for (const f of [...list(block.fields), ...list(block.itemFields)])
      if (f.type === 'design')
        for (const slot of [f.slot, ...list(f.slots)].filter((s) => typeof s === 'string'))
          bySlot.set(slot, { block: block.id, field: f.name, slot })
  for (const [id, entry] of Object.entries(kit.mapping?.blocks ?? {})) {
    const store = list(kit.blockStore?.blocks).find((b) => b.id === id)
    const design = new Set(
      list(store?.fields)
        .filter((f) => f.type === 'design')
        .map((f) => f.name)
    )
    for (const [name, loc] of Object.entries(entry.fields ?? {}))
      if (design.has(name)) add(loc, { block: id, field: name })
    for (const loc of list(entry.designLines)) add(loc, { block: id, field: null })
  }
  for (const slot of list(kit.contentMap?.slots))
    if (slot.role === 'editorial.design_element')
      add({ ...slot, slot: slot.key }, { block: null, field: null })
  return { bySlot, byLoc }
}

const iconClassesOf = (kit) => new Set(Object.values(kit.mapping?.networkIconClasses?.classes ?? {}))

/** The findings of the write result: a value sent to a design place, an icon class outside the allowed list. */
function writeFindings(write, places, kit, entries) {
  const out = []
  const classes = iconClassesOf(kit)
  for (const op of write.ops)
    for (const v of list(op.values)) {
      const hit = places.bySlot.get(v.loc?.slot) ?? places.byLoc.get(locKey(v.loc))
      const page = entries?.get(v.entry)?.page ?? op.page ?? null
      if (hit)
        out.push({
          kind: 'design_field_written',
          source: 'write',
          page,
          place: { op: op.key, entity: v.loc?.entity ?? null, ...hit },
          approvedEntry: false
        })
      if (String(v.rule ?? '').startsWith('icon_class') && !classes.has(v.value))
        out.push({
          kind: 'icon_class_not_allowed',
          source: 'write',
          page,
          place: { op: op.key, entity: v.loc?.entity ?? null, slot: v.loc?.slot ?? null },
          allowed: classes.size
        })
    }
  return out
}

/** The findings of the slots read back after the build: a design slot whose value is not the blank site's. */
function storedFindings(stored, places, kit) {
  const blank = new Map(list(kit.contentMap?.slots).map((s) => [s.key, s.sample]))
  const out = []
  let unknown = 0
  for (const [slot, value] of Object.entries(stored ?? {})) {
    const hit = places.bySlot.get(slot)
    if (!hit) continue
    if (!blank.has(slot)) {
      unknown++
      continue
    }
    const before = blank.get(slot) ?? ''
    if (String(value ?? '') !== String(before))
      out.push({
        kind: 'design_field_written',
        source: 'stored',
        page: null,
        place: hit,
        lengths: { blank: String(before).length, built: String(value ?? '').length }
      })
  }
  return { out, unknown }
}

/**
 * The design check.
 * @param {{kit?: object, write?: object, stored?: object, entries?: Map}} input
 */
export function checkDesign({ kit, write, stored, entries }) {
  if (!kit)
    return { status: 'not_run', reason: 'kit_missing: the design places come from the kit', findings: [] }
  if (!write && !stored)
    return {
      status: 'not_run',
      reason: 'no_write_result_or_stored_values: nothing says what was written',
      findings: []
    }
  const places = designPlacesOf(kit)
  const findings = write ? writeFindings(write, places, kit, entries) : []
  const notes = []
  if (stored) {
    const s = storedFindings(stored, places, kit)
    findings.push(...s.out)
    if (!kit.contentMap) notes.push('blank_values_missing: the kit has no blank site content map')
    else if (s.unknown) notes.push(`${s.unknown} design slot(s) with no blank site value`)
  } else notes.push('stored values not given: only what the write sent is checked')
  return { status: 'ran', notes, findings }
}
