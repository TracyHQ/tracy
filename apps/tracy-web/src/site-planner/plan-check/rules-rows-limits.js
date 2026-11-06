import { arr, has, obj, str } from './rule-set.js'

// R05 list rows
export function checkR05(ctx) {
  const { R, blockIx, keptDecisions, decisionParts, W } = ctx
  const r = R.r5
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    if (!o) return
    const parts = decisionParts(x.d)
    parts.lists.forEach((l) => {
      const kl = o.lists.get(l.list)
      if (!kl) return
      if (typeof l.rows !== 'number') return r.note(`cannot check: field "rows" missing on list ${l.list}`)
      if (typeof kl.min === 'number' && l.rows < kl.min)
        r.fail(W(x, `list ${l.list}`), `rows ${l.rows} is below kit min ${kl.min}`)
      else if (typeof kl.max === 'number' && l.rows > kl.max)
        r.fail(W(x, `list ${l.list}`), `rows ${l.rows} is above kit max ${kl.max}`)
      else r.ok()
      if (Array.isArray(l.items) && l.items.length !== l.rows)
        r.fail(W(x, `list ${l.list}`), `rows is ${l.rows} but items has ${l.items.length} entries`)
    })
  })
  r.note('"never more than the brief has true items" needs judgement; see R10h')
}

// R06 character limits
// Two comparisons, kept apart on purpose:
//  (a) FINAL-TEXT limit: the plan's maxCharacters is what the writer is told the slot can hold. It must not exceed
//      the kit limit, and when the kit has a limit it should be copied (spec: "maxCharacters copied from the kit").
//      Above the limit, or null/missing where the kit has one, is a real plan error.
//  (b) NOTE length: "says" is a note of what the line is about, not the final sentence. A note longer than the
//      slot is NOT a failure; it is listed in the notes so a reviewer can see what the writer must compress.
export function checkR06(ctx) {
  const { R, slotLimit, isLabelSlot, keptDecisions, decisionParts, W } = ctx
  const r = R.r6
  const longNotes = []
  keptDecisions.forEach((x) =>
    decisionParts(x.d).copy.forEach((c) => {
      if (!has(c.slot)) return
      const lim = slotLimit.get(c.slot)
      if (typeof lim !== 'number') return
      const mc = c.maxCharacters
      if (typeof mc === 'number' && mc > lim)
        r.fail(
          W(x, `slot ${c.slot}`),
          `(a final-text limit) plan maxCharacters ${mc} is above the kit limit ${lim}`,
          'plan'
        )
      else if (typeof mc !== 'number')
        r.fail(
          W(x, `slot ${c.slot}`),
          `(a final-text limit) maxCharacters is ${mc === null ? 'null' : 'missing'} but the kit gives this slot a limit of ${lim}; the spec says to copy it`,
          'plan'
        )
      else r.ok()
      // A label slot's "text" is the exact printed words, so its length is a real limit.
      if (c.text !== undefined && isLabelSlot(c.slot)) {
        const t = str(c.text).length
        if (t > lim)
          r.fail(
            W(x, `slot ${c.slot}`),
            `(a final-text limit) label text "${c.text}" is ${t} characters, above the kit limit ${lim}`,
            'plan'
          )
        else r.ok()
      }
      const n = str(c.says).length
      if (n > lim) longNotes.push(`${W(x, 'slot ' + c.slot)} (note ${n} > limit ${lim})`)
    })
  )
  if (longNotes.length)
    r.note(
      `(b) note length, not a failure: ${longNotes.length} "says" notes are longer than the kit limit of their slot. "says" is a note, not final text, so this only shows what the writer must shorten: ${longNotes.join(' | ')}`
    )
}

// R07 demoOwned
export function checkR07(ctx) {
  const { R, kit, logoIds, blockIx, slotRow, frameById, keptPageIds, keptDecisions, decisionParts, W } = ctx
  const r = R.r7
  // Slots in site.nameSlots belong to the brand step (spec): never a missed demoOwned slot,
  // and the plan must not write or hide them.
  const nameSlotIds = new Set(
    arr(obj(kit.site).nameSlots)
      .filter((n) => obj(n).kind === 'slot' && has(n.id))
      .map((n) => n.id)
  )
  // Blocks to check: every kept decision, plus (for undecided blocks on kept pages) nothing: R10a reports them.
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    if (!o) return
    if (x.page && !keptPageIds.has(x.page)) return
    const parts = decisionParts(x.d)
    const decided = new Set()
    parts.copy.forEach((c) => decided.add(c.slot))
    parts.hidden.forEach((h) => decided.add(h.slot))
    parts.pics.forEach((p) => decided.add(p.frame))
    parts.links.forEach((l) => decided.add(l.link))
    const hiddenLists = new Set(parts.hidden.map((h) => h.slot))
    const rowsOf = new Map(
      parts.lists.map((l) => [
        l.list,
        typeof l.rows === 'number' ? l.rows : Array.isArray(l.items) ? l.items.length : null
      ])
    )
    o.demo.forEach((d) => {
      if (d.role === 'business.logo' || logoIds.has(d.id)) return // brand step
      if (nameSlotIds.has(d.id)) {
        if (decided.has(d.id))
          return r.fail(
            W(x, `slot ${d.id}`),
            'name slot (site.nameSlots) is written or hidden; the brand step fills it',
            'plan'
          )
        return r.ok()
      }
      const sr = slotRow.get(d.id)
      if (sr) {
        if (hiddenLists.has(sr.list)) return
        const n = rowsOf.get(sr.list)
        if (typeof n === 'number' && sr.row >= n) return // row not shown
        if (!rowsOf.has(sr.list) && !decided.has(d.id))
          return r.fail(
            W(x, `slot ${d.id}`),
            `demoOwned slot (${d.role}) of list ${sr.list}, and the list is not in the decision`
          )
      }
      const fr = frameById.get(d.id)
      if (fr && has(fr.twinOf)) {
        if (decided.has(fr.twinOf) || decided.has(d.id)) return r.ok()
        return r.fail(W(x, `slot ${d.id}`), `twin frame of ${fr.twinOf}, and the twin is not decided`)
      }
      if (decided.has(d.id)) r.ok()
      else
        r.fail(
          W(x, `slot ${d.id}`),
          `demoOwned slot (${d.role}, sample "${str(d.sample).slice(0, 40)}") is neither replaced nor hidden`,
          'plan'
        )
    })
  })
  if (!keptDecisions.length) r.note('cannot check: no kept block decisions found')
}
