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

/** Whether one list is the start of the other (an empty list is the start of every list). */
const prefixEither = (a, b) => {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (String(a[i]) !== String(b[i])) return false
  return true
}
const xpathEither = (a, b) => !a || !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

/**
 * Whether a write location and a design location overlap: the same record and column, and one path is the start of
 * the other. A write of the whole column, or of a parent (`['gallery']`), replaces the design line under it; a write
 * deeper than a design line changes part of it.
 */
export function overlaps(write, design) {
  if (!write?.entity || write.entity !== design.entity || (write.column ?? '') !== (design.column ?? ''))
    return false
  return prefixEither(list(write.jsonPath), list(design.jsonPath)) && xpathEither(write.xpath, design.xpath)
}

/** Every design typed place of a kit: by slot and by location, each `{block, field, slot}`. */
export function designPlacesOf(kit) {
  const bySlot = new Map()
  const byLoc = new Map()
  const add = (loc, at) => {
    if (!loc || typeof loc !== 'object') return
    if (typeof loc.slot === 'string') bySlot.set(loc.slot, { ...at, slot: loc.slot })
    if (loc.entity) byLoc.set(locKey(loc), { ...at, slot: loc.slot ?? null, loc })
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
      const near = [...places.byLoc.values()].find((p) => overlaps(v.loc, p.loc))
      const found = places.bySlot.get(v.loc?.slot) ?? places.byLoc.get(locKey(v.loc)) ?? near
      const hit = found ? { block: found.block, field: found.field, slot: found.slot } : null
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
  if (write?.plan?.ops?.length && !write.ops.length && !stored)
    return {
      status: 'not_run',
      reason: "nothing_ran: the run report lists none of the write plan's operations",
      findings: []
    }
  const places = designPlacesOf(kit)
  if (!places.bySlot.size && !places.byLoc.size)
    return {
      status: 'not_run',
      reason: 'no_design_place: the kit declares no design field, design line or design element',
      findings: []
    }
  const findings = write ? writeFindings(write, places, kit, entries) : []
  const values = write ? write.ops.reduce((n, op) => n + list(op.values).length, 0) : 0
  const notes = write ? [`${values} written value(s) checked`] : []
  if (stored) {
    const s = storedFindings(stored, places, kit)
    findings.push(...s.out)
    if (!kit.contentMap) notes.push('blank_values_missing: the kit has no blank site content map')
    else if (s.unknown) notes.push(`${s.unknown} design slot(s) with no blank site value`)
  } else notes.push('stored values not given: only what the write sent is checked')
  return { status: 'ran', notes, findings }
}
