// The build's failure policy (#575): a problem of one item never stops the whole build. The older write step left out
// an item it could not write with a line naming it and wrote the rest (ADR 0044, decision 26); the draft write does
// the same. Each item a guard refuses before any door (one value, one removal of a copy, one operation) is taken out
// of the plan and listed in `plan.skippedItems`: its code, its operation, its place and the guard's reason, all ids
// and codes, never the owner's words. Only what makes a site impossible still stops: no page left to write
// (`no_page_writable`). Pure.
import { DraftWriteError } from './draft-write-error.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const PAGE_KINDS = new Set(['menuItem.create'])

/** One skipped item as the build result keeps it: codes and ids only. */
export function skippedItemOf(code, details = {}) {
  const reason =
    details.via ?? details.rule ?? (Array.isArray(details.rules) ? details.rules.join(',') : null)
  return {
    code,
    op: details.op ?? null,
    place: details.slot ?? details.entry ?? details.column ?? details.xpath ?? null,
    reason: typeof reason === 'string' ? reason : null,
    at: 'plan'
  }
}

/** The operation keys a plan value names (`{ref}`, a link's `refs`), as the write resolves them to site ids. */
export function refKeysOf(value, plan) {
  const keys = []
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v.ref === 'string') {
      const page = v.ref.startsWith('page:') ? v.ref.slice(5) : null
      const at = page ? (plan.under?.[page]?.list ?? page) : null
      keys.push(at ? `menuItem:${plan.mainMenu}:${at}` : v.ref)
    }
    for (const inner of Object.values(v)) walk(inner)
  }
  walk(value)
  return keys
}

/**
 * An operation without what names an operation left out (`gone`): each value naming one is dropped, and a menu item
 * whose parent is gone goes to the top of its menu, so one item left out never takes a page with it. Returns the
 * operation (a copy when anything changed) and the skipped items, codes and ids only.
 */
export function withoutGone(op, gone, plan, at = 'plan') {
  if (!gone.size) return { op, skipped: [] }
  const skipped = []
  const values = list(op.values).filter((v) => {
    const missing = refKeysOf(v.value, plan).find((k) => gone.has(k))
    if (missing)
      skipped.push({ code: 'depends_on_skipped', op: op.key, place: missing, reason: null, at, value: v })
    return !missing
  })
  const parent = op.item?.parent ? refKeysOf(op.item.parent, plan).find((k) => gone.has(k)) : null
  if (!skipped.length && !parent) return { op, skipped: [] }
  const item = parent ? (({ parent: _p, ...rest }) => rest)(op.item) : op.item
  if (parent) skipped.push({ code: 'parent_skipped', op: op.key, place: parent, reason: null, at })
  return { op: { ...op, values, ...(op.item ? { item } : {}) }, skipped }
}

/**
 * Take the refused items out of the plan and list them.
 * @param {{ops: object[]}} plan the write plan, changed in place
 * @param {{code: string, details: object, op: object, value?: object, remove?: object}[]} items
 */
export function skipItems(plan, items) {
  const pages = plan.ops.filter((op) => PAGE_KINDS.has(op.kind)).length
  const ops = new Set()
  const values = new Set()
  const removes = new Set()
  for (const item of items)
    if (item.value) values.add(item.value)
    else if (item.remove) removes.add(item.remove)
    else ops.add(item.op)
  // An entry no operation writes any more is counted skipped, never written (`planCountsOf`).
  const left = []
  for (const op of plan.ops.filter((o) => ops.has(o))) left.push(...list(op.entries))
  plan.ops = plan.ops.filter((op) => !ops.has(op))
  // What names an operation left out loses that value only (a picture's slot, a parent page), never its operation.
  const gone = new Set([...ops].map((op) => op.key))
  const dependents = []
  plan.ops = plan.ops.map((op) => {
    const out = withoutGone(op, gone, plan)
    for (const s of out.skipped) {
      if (s.value) values.add(s.value)
      dependents.push(s)
    }
    return out.op === op ? op : { ...out.op, values: op.values }
  })
  for (const op of plan.ops) {
    if (Array.isArray(op.values) && op.values.some((v) => values.has(v))) {
      left.push(...op.values.filter((v) => values.has(v)).map((v) => v.entry))
      op.values = op.values.filter((v) => !values.has(v))
      const still = new Set(op.values.map((v) => v.entry))
      if (Array.isArray(op.entries)) op.entries = op.entries.filter((e) => still.has(e) || !left.includes(e))
    }
    if (Array.isArray(op.removes)) op.removes = op.removes.filter((r) => !removes.has(r))
  }
  const written = new Set(plan.ops.flatMap((op) => list(op.entries)))
  for (const entry of new Set(left.filter(Boolean)))
    if (!written.has(entry)) plan.skipped = [...list(plan.skipped), { entry, reason: 'item_refused' }]
  const seen = new Set()
  plan.skippedItems = [
    ...items.map(({ code, details }) => skippedItemOf(code, details)),
    ...dependents.map(({ value: _v, ...s }) => s)
  ].filter((s) => {
    const key = JSON.stringify(s)
    return seen.has(key) ? false : seen.add(key)
  })
  if (pages > 0 && !plan.ops.some((op) => PAGE_KINDS.has(op.kind)))
    throw new DraftWriteError('no_page_writable', 'every page of the plan was refused before any door call', {
      skipped: plan.skippedItems.length
    })
}
