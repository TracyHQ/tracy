import { arr, has, obj, str } from './rule-set.js'

// R23 a list row the plan keeps keeps all its printed fields. A plan may drop a whole row (hide every field of it, or
// lower the list's rows), but hiding one field of a row that stays prints an uneven card: a title without its
// description, a card without its picture. Rows come from the kit: the rows of a slots list, the items of an items
// list, and repeated stored fields ("<prefix><n>.<field>", the repeatable sub-forms a template keeps per article).
// Legitimately optional, never counted: video ids and link urls (not printed text or pictures), fields the demo
// leaves empty, fields the kit marks writable:false, name slots, and a field hidden in EVERY kept row of its list
// (a column the plan drops for the whole list keeps the cards alike, e.g. a schedule the brief cannot fill), and
// fields the kit marks printed:false. R24 (rules-labels.js) reads the same row map.

const NOT_PRINTED = /video|(^|[._-])url$/i
const ROW_FIELD = /^(.*?)(\d+)\.([^.]+)$/

// Kit-wide row map, built once per check: block id -> [{ list, rows: [{ index, fields: Map(field -> [slot]) }] }]
// and slot id -> { block, list, row } for the slots that belong to a row.
export function indexRows(ctx) {
  if (ctx._rows) return ctx._rows
  const { kit, kitBlocks, blockIx } = ctx
  const byBlock = new Map()
  const rowOfSlot = new Map()
  const add = (blockId, listKey, listLabel, rowKey, field, slot) => {
    if (!has(slot) || rowOfSlot.has(`${blockId}|${slot}`)) return
    if (!byBlock.has(blockId)) byBlock.set(blockId, new Map())
    const lists = byBlock.get(blockId)
    if (!lists.has(listKey)) lists.set(listKey, { list: listKey, label: listLabel, rows: new Map() })
    const l = lists.get(listKey)
    if (!l.rows.has(rowKey)) l.rows.set(rowKey, { index: rowKey, fields: new Map() })
    const fields = l.rows.get(rowKey).fields
    if (!fields.has(field)) fields.set(field, [])
    fields.get(field).push(slot)
    rowOfSlot.set(`${blockId}|${slot}`, { list: listKey, row: rowKey })
  }
  for (const b of kitBlocks.values()) {
    for (const l of arr(b.lists)) {
      arr(l.rows).forEach((row, i) => {
        const seen = new Map()
        for (const s of arr(obj(row).slots).map(obj)) {
          const role = str(s.role) || 'slot'
          const n = seen.get(role) ?? 0
          seen.set(role, n + 1)
          add(b.id, l.id, `list ${l.id}`, i, `${role}#${n}`, s.id)
        }
      })
      for (const rs of arr(l.rowSlots).map(obj))
        for (const s of arr(rs.slots).map(obj))
          if (has(s.item)) add(b.id, l.id, `list ${l.id}`, s.item, str(rs.field) || str(rs.role), s.id)
    }
  }
  // Repeated stored fields of a block not already in a kit list: one list per article and prefix.
  for (const sf of arr(kit.storedFields).map(obj)) {
    const m = ROW_FIELD.exec(str(sf.field))
    if (!m || !has(sf.slot)) continue
    const item = sf.slot.replace(/\.[^.]+$/, '')
    for (const [blockId, o] of blockIx)
      if (o.slots.has(sf.slot) && !rowOfSlot.has(`${blockId}|${sf.slot}`))
        add(blockId, `${item}|${m[1]}`, `repeated field ${m[1]} of ${item}`, Number(m[2]), m[3], sf.slot)
  }
  ctx._rows = { byBlock, rowOfSlot }
  return ctx._rows
}

// Slots a plan may hide in a kept row: not printed (video ids, urls), empty on the demo, unwritable, name slots.
function optionalSlots(ctx) {
  if (ctx._optional) return ctx._optional
  const { kit, slotRole, unwritable } = ctx
  const out = new Set(unwritable)
  for (const n of arr(obj(kit.site).nameSlots)) if (has(obj(n).id)) out.add(n.id)
  for (const [id, role] of slotRole) if (NOT_PRINTED.test(role)) out.add(id)
  for (const b of arr(kit.blocks).map(obj))
    for (const l of arr(b.lists).map(obj))
      for (const rs of arr(l.rowSlots).map(obj))
        if (rs.printed === false) for (const sl of arr(rs.slots).map(obj)) if (has(sl.id)) out.add(sl.id)
  ;(function scan(o, depth) {
    if (!o || typeof o !== 'object' || depth > 10) return
    if (!Array.isArray(o)) {
      const id = has(o.id) ? o.id : has(o.slot) ? o.slot : null
      if (id) {
        if (('sample' in o && str(o.sample).trim() === '') || obj(o.demoChars).total === 0) out.add(id)
        if (has(o.field) && NOT_PRINTED.test(str(o.field).split('.').pop())) out.add(id)
      }
    }
    for (const v of Object.values(o)) scan(v, depth + 1)
  })(kit, 0)
  ctx._optional = out
  return out
}

// What one kept decision shows of its block's rows: per list, the kept rows and each field's hidden state.
export function shownRows(ctx, x) {
  const { byBlock } = indexRows(ctx)
  const lists = byBlock.get(x.d.block)
  if (!lists) return []
  const optional = optionalSlots(ctx)
  const parts = ctx.decisionParts(x.d)
  const hidden = new Set(parts.hidden.map((h) => h.slot).filter(has))
  const shown = new Set(
    [...parts.copy.map((c) => c.slot), ...parts.pics.map((p) => p.frame)].filter(
      (s) => has(s) && !hidden.has(s)
    )
  )
  const planRows = new Map(parts.lists.map((l) => [l.list, typeof l.rows === 'number' ? l.rows : null]))
  const out = []
  for (const l of lists.values()) {
    if (hidden.has(l.list)) continue
    const rows = []
    for (const row of l.rows.values()) {
      const limit = planRows.get(l.list)
      if (typeof row.index === 'number' && typeof limit === 'number' && row.index >= limit) continue
      const fields = [...row.fields].filter(([, slots]) => !slots.every((s) => optional.has(s)))
      const kept = fields.some(([, slots]) => slots.some((s) => shown.has(s)))
      rows.push({ index: row.index, kept, fields, hidden, shown })
    }
    out.push({ ...l, shown: rows })
  }
  return out
}

export function checkR23(ctx) {
  const { R, keptDecisions, W } = ctx
  const r = R.r23
  const optional = optionalSlots(ctx)
  let lists = 0
  keptDecisions.forEach((x) => {
    for (const l of shownRows(ctx, x)) {
      const kept = l.shown.filter((row) => row.kept)
      if (!kept.length) continue
      lists++
      r.ok()
      const fieldNames = new Set(kept.flatMap((row) => row.fields.map(([f]) => f)))
      for (const field of fieldNames) {
        const state = kept
          .map((row) => ({ row, slots: row.fields.find(([f]) => f === field)?.[1] }))
          .filter((s) => s.slots)
        const isHidden = (s) => s.slots.filter((id) => !optional.has(id)).every((id) => s.row.hidden.has(id))
        const hiddenIn = state.filter(isHidden)
        const printedIn = state.filter((s) => !isHidden(s))
        if (!hiddenIn.length) continue
        if (!printedIn.length) {
          r.ok() // the field is dropped from every kept row of the list: a column, not a broken row
          continue
        }
        for (const s of hiddenIn) {
          const slot = s.slots.find((id) => !optional.has(id))
          const kept = s.row.fields
            .flatMap(([, slots]) => slots)
            .filter((id) => s.row.shown.has(id))
            .slice(0, 3)
          r.fail(
            W(x, `slot ${slot}`),
            `slot ${slot} (field ${field}) of row ${s.row.index} in ${l.label} is hidden while the row stays ` +
              `(it keeps ${kept.join(', ')}) and the same field prints in row ${printedIn.map((p) => p.row.index).join(', ')}; ` +
              'a kept row keeps all its fields: write this slot from trade knowledge without any number, duration, count or ' +
              'price, as the other rows do, or drop the whole row (hide every field of it, or lower the rows of the list)',
            'plan'
          )
        }
      }
    }
  })
  if (!lists) r.skip('cannot check: no kept block keeps a list row the kit describes')
  r.note(
    'optional in a kept row: video ids, link urls, fields empty on the demo, unwritable and name slots, and a field hidden in every kept row of its list'
  )
}
