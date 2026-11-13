// Every entry of the write order accounted for by the write plan (ticket #597): entries in = entries written by exactly
// one operation + entries skipped with a reason + entries in conflict, none unexplained, none written twice. An entry
// in conflict (`address_conflict`: another entry wrote other words at the same place) is no plain skip: it is counted
// and listed apart (`conflicts`), so a report shows it. Pure.
import { placesOfOrder } from './write-order-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every entry of an order, by id: field entries, pictures, icons, each page's menu item and SEO, the look. */
export function entriesOfOrder(order) {
  const ids = []
  for (const { place } of placesOfOrder(order)) {
    for (const e of list(place.fields)) ids.push({ id: e.place, kind: 'field' })
    for (const p of list(place.pictures)) ids.push({ id: p.frame, kind: 'picture' })
    for (const i of list(place.icons)) ids.push({ id: i.id, kind: 'icon' })
  }
  for (const page of list(order.pages)) {
    ids.push({ id: `menu:${page.id}`, kind: 'menu' })
    for (const f of ['title', 'description', 'shareImage'])
      ids.push({ id: `seo:${page.id}.${f}`, kind: 'seo' })
  }
  ids.push({ id: 'look.accent', kind: 'look' })
  if (order.look?.accentDark) ids.push({ id: 'look.accentDark', kind: 'look' })
  return ids
}

/**
 * The coverage of a plan.
 * @returns {{in: number, written: number, skipped: number, conflicted: number, conflicts: string[],
 *   unexplained: string[], twice: string[], byReason: Record<string, number>, byOp: Record<string, number>}}
 */
export function draftWriteCoverage(order, plan) {
  const entries = entriesOfOrder(order)
  const writers = new Map()
  const byOp = {}
  for (const op of plan.ops)
    for (const id of list(op.entries)) {
      writers.set(id, (writers.get(id) ?? 0) + 1)
      byOp[op.kind] = (byOp[op.kind] ?? 0) + 1
    }
  const reasons = new Map()
  for (const s of plan.skipped) if (!reasons.has(s.entry)) reasons.set(s.entry, s.reason)
  const out = {
    in: entries.length,
    written: 0,
    skipped: 0,
    conflicted: 0,
    conflicts: [],
    unexplained: [],
    twice: [],
    byReason: {},
    byOp
  }
  const known = new Set(entries.map((e) => e.id))
  for (const { id } of entries) {
    const n = writers.get(id) ?? 0
    if (n > 1) out.twice.push(id)
    if (n >= 1) out.written += 1
    else if (reasons.get(id) === 'address_conflict') {
      out.conflicted += 1
      out.conflicts.push(id)
    } else if (reasons.has(id)) {
      out.skipped += 1
      out.byReason[reasons.get(id)] = (out.byReason[reasons.get(id)] ?? 0) + 1
    } else out.unexplained.push(id)
  }
  // An operation that names an entry the order does not have is as wrong as an entry nobody wrote.
  for (const id of writers.keys()) if (!known.has(id)) out.unexplained.push(`unknown:${id}`)
  return out
}
