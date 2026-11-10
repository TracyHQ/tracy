// Every field the content map stores, in the kit, whether or not a page prints it where the kit looked: a field the
// read pass never saw (a button's address, a title printed only on one template layout) still changes the page. Named
// by `slot`, not `id`: the plan and copy checks scan the kit for ids, and this list adds no slot to what a plan must
// decide, so a plan made on an earlier kit reads the same. A planner does not read it (template-kit-planner-view.js).
import { neutralKey } from './ids.mjs'

const short = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

/** A field's name: its column, then its path inside that column's stored JSON. */
const fieldName = (s) =>
  [s.column, ...(s.jsonPath ?? [])].filter((p) => p !== undefined && p !== null).join('.')

/** Slot id -> the first block listing it as its own. */
function listedIn(kit) {
  const out = new Map()
  const add = (id, block) => id && !out.has(id) && out.set(id, block)
  for (const b of kit.blocks ?? []) {
    for (const s of b.slots ?? []) if (!s.ownedBy) add(s.id, b.id)
    for (const s of b.demoOwned ?? []) add(s.id, b.id)
    for (const f of b.frames ?? []) add(f.id, b.id)
    for (const l of b.links ?? []) {
      add(l.labelId, b.id)
      if (l.action === 'media-source') add(l.sourceSlot, b.id)
    }
    for (const l of b.lists ?? []) {
      for (const r of l.rowSlots ?? []) {
        add(r.id, b.id)
        for (const s of Array.isArray(r.slots) ? r.slots : []) add(s.id, b.id)
      }
      for (const r of l.rows ?? []) for (const s of r.slots ?? []) add(s.id, b.id)
    }
  }
  for (const g of kit.site?.navigationGroups ?? []) {
    add(g.titleSlot, g.block)
    for (const it of g.items ?? []) add(it.labelSlot, g.block)
  }
  for (const c of kit.site?.contactBlocks ?? []) for (const f of c.accepts?.fields ?? []) add(f.id, c.block)
  return out
}

/**
 * List every stored field on `kit.storedFields`.
 * @param {object} kit changed in place
 * @param {{map: object, drives?: Record<string, {controls?: object[]}>}} o `drives`: field-drives.json
 */
export function settleStoredFields(kit, { map, drives = {} }) {
  const listed = listedIn(kit)
  kit.storedFields = (map.slots ?? []).map((s) => {
    const slot = neutralKey(s.key)
    const measured = drives[slot]?.controls
    return {
      slot,
      field: fieldName(s),
      type: s.type,
      ...(s.role === 'business.audio'
        ? {
            role: s.role,
            mediaKind: 'audio',
            entity: s.entity,
            column: s.column,
            jsonPath: s.jsonPath,
            group: s.group
          }
        : {}),
      sample: short(s.sample),
      listedIn: listed.get(slot) ?? null,
      ...(measured ? { drives: measured } : {})
    }
  })
  return kit
}

/** What the coverage gate says of the stored fields; undefined when the kit lists none. A report, not a failure. */
export function storedFieldReport(kit) {
  const fields = kit.storedFields
  if (!Array.isArray(fields)) return undefined
  return {
    total: fields.length,
    measured: fields.filter((f) => f.drives).length,
    notListed: fields.filter((f) => !f.listedIn).length,
    drivingSeveralControls: fields
      .filter((f) => (f.drives?.length ?? 0) > 1)
      .map((f) => ({ slot: f.slot, field: f.field, controls: f.drives }))
  }
}
