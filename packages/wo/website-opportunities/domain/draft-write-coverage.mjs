// Every entry of the write order accounted for by the write plan (ticket #597): entries in = entries written by exactly
// one operation + entries skipped with a reason + entries in conflict, none unexplained, none written twice.
//
//   written     an operation carries the entry (`op.entries`): its words reach the site at one place at least. An
//               entry that won one place and lost another is written; its lost place is still a row of
//               `plan.conflicts` (`written: true`), so a report shows it.
//   conflicted  no operation carries the entry and it lost a place to other words (`plan.conflicts`): no plain skip,
//               counted and listed apart.
//   skipped     no operation carries the entry, it lost no place, and `plan.skipped` gives its reason.
// Pure.
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

/** How many entries an order holds (`in`), and of each kind: `{in, field, picture, icon, menu, seo, look}`. */
export function entryCountsOf(order) {
  const out = { in: 0, field: 0, picture: 0, icon: 0, menu: 0, seo: 0, look: 0 }
  for (const { kind } of entriesOfOrder(order)) {
    out.in += 1
    out[kind] += 1
  }
  return out
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
  const lost = new Set(list(plan.conflicts).map((c) => c.entry))
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
    else if (lost.has(id)) {
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

/**
 * The counts a run reports, from the plan alone: entries `written` (carried by an operation), `conflicted` (lost a
 * place and written nowhere) and `skipped` (a reason, no conflict), each entry counted once, so
 * `in = written + skipped + conflicted` where `in` counts every entry of the order (`plan.entries`): its field entries
 * and also its pictures, icons, each page's menu item and three SEO entries, and the look. A field entry is one entry
 * however many places it fans out to. `conflicts`: the ids of every entry that lost a place, each once, an entry written
 * elsewhere included (so it can be longer than `conflicted`). `entries`: `plan.entries` as it is.
 */
export function planCountsOf(plan) {
  const written = new Set(list(plan.ops).flatMap((op) => list(op.entries)))
  const lost = new Set(list(plan.conflicts).map((c) => c.entry))
  const conflicted = [...lost].filter((id) => !written.has(id))
  const skipped = new Set(
    list(plan.skipped)
      .map((s) => s.entry)
      .filter((id) => !written.has(id) && !lost.has(id))
  )
  return {
    ...(plan.entries ? { in: plan.entries.in, entries: plan.entries } : {}),
    ops: list(plan.ops).length,
    written: written.size,
    skipped: skipped.size,
    conflicted: conflicted.length,
    conflicts: [...lost]
  }
}
