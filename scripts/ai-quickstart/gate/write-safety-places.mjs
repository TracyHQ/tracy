// The places of write safety (ticket #586): every value the marker build writes that a customer could type, named the
// same way in every pass (a writer field by its page and key, a profile value by its kind and item), and where the
// write plan stores it. A pass gives the build a `textOf` and a `factOf` that write a probe at the places it chose and
// the plain marker everywhere else, and keeps the code each probed place got, so its value is found in the plan and on
// the pages. Pure.
import { codesIn } from './marker-codec.mjs'
import { markerText } from './marker-plan.mjs'
import { placeTypeOf, probedValue } from './write-probes.mjs'

/** A place key of a writer field. */
const writerKey = (f) => 'writer:' + f.page + '/' + f.key

/**
 * The build options of one pass and what the pass did with them.
 * @param {Map<string, object>} assignment place key to probe
 * @returns {{options: {textOf: Function, factOf: Function}, used: Map<string, {code: string, probe: object, value:
 *   string, base: string}>,
 *   refused: Map<string, string[]>, seen: Map<string, object>}} `used`: the probed places and their codes; `refused`:
 *   probed writer fields the page writer's copy check sent back, with its reasons; `seen`: every place the build asked
 *   for, probed or not (`{key, type, kind, limit, base, code}`)
 */
export function passOptions(assignment = new Map()) {
  const used = new Map()
  const refused = new Map()
  const seen = new Map()
  const counts = new Map()
  const textOf = (f) => {
    const key = writerKey(f)
    if (f.rewrite) {
      if (used.has(key)) refused.set(key, (f.problems ?? []).map(String))
      used.delete(key)
      return markerText(f)
    }
    const base = 'Qx' + f.code
    seen.set(key, {
      key,
      type: placeTypeOf({ kind: f.kind }),
      kind: f.kind ?? null,
      limit: f.limit ?? null,
      base,
      code: f.code
    })
    const probe = assignment.get(key)
    if (!probe) return markerText(f)
    const value = probedValue(base, probe, f.code, f.limit ?? null)
    used.set(key, { code: f.code, probe, value, base })
    return value
  }
  const factOf = (v) => {
    const head = v.what === 'fact' ? 'fact:' + v.kind : v.what + ':' + v.item + '/' + v.kind
    const n = counts.get(head) ?? 0
    counts.set(head, n + 1)
    const key = v.what === 'item' ? head : head + '#' + n
    const code = v.code ?? codesIn(v.value)[0] ?? null
    if (!code) return v.value
    seen.set(key, { key, type: placeTypeOf(v), kind: v.kind ?? null, limit: null, base: v.value, code })
    const probe = assignment.get(key)
    if (!probe) return v.value
    const value = probedValue(v.value, probe, code)
    used.set(key, { code, probe, value, base: v.value })
    return value
  }
  return { options: { textOf, factOf }, used, refused, seen }
}

/** Every string of a write plan operation with where it is stored: its values, then its record fields. */
export function storedOf(op) {
  const out = []
  for (const v of op.values ?? [])
    out.push({ value: String(v.value ?? ''), entry: v.entry ?? null, loc: v.loc ?? null })
  for (const [column, value] of Object.entries(op.fields ?? {}))
    if (typeof value === 'string')
      out.push({ value, entry: op.page ? op.page + '.' + column : null, loc: { entity: op.record, column } })
  return out
}

/**
 * Where each code is stored in a write plan: code to `[{op, entry, loc, value}]`.
 * @param {object | null} writePlan
 */
export function storedIndex(writePlan) {
  const index = new Map()
  for (const op of writePlan?.ops ?? [])
    for (const s of storedOf(op))
      for (const code of codesIn(s.value)) {
        if (!index.has(code)) index.set(code, [])
        index.get(code).push({ op: op.key, ...s })
      }
  return index
}

/**
 * Where a probed place is stored in a pass (review 6 U1). A probe with a code is found by it in the pass plan. A probe
 * that replaces the whole value carries none, and the code the place got in this pass is not its plain code once the
 * page writer sent a field back (the marker writer takes a new code on every ask): it is found where the plain build
 * stores the place itself, looked up by the place key (`plainAt`), never by the pass's code, which in the plain plan is
 * another place's. A coded probe the pass plan lost is placed the same way.
 * @param {string} key the place key
 * @param {{code: string, probe: {whole?: boolean}}} u the place in this pass
 * @param {Map<string, object[]>} index the pass plan's `storedIndex`
 * @param {(key: string) => object[] | null} plainAt where the plain build stores a place, by its key
 */
export function placeAt(key, u, index, plainAt) {
  const own = u.probe?.whole ? null : index.get(String(u.code).toUpperCase())
  return own?.length ? own : (plainAt?.(key) ?? null)
}

/** Where the plain build stores each place, by the place key's own plain code. */
export const plainAtOf = (seen, plainIndex) => (key) => {
  const code = seen.get(key)?.code
  return code == null ? null : (plainIndex.get(String(code).toUpperCase()) ?? null)
}

/**
 * The stored location of a place that a failure names (review 5 Y2): a value the plain build stores in several
 * operations (one address in a hero button and in a call to action) is named where the site refused it, the operation
 * a stop reports and, within it, the slot or column a read back names; a finding judged on a page is named by an entry
 * of that page. A finding judged on a page none of whose entries stores the place names no location when the place
 * has more than one (review 7 N1): which of them printed it is not known (a menu item's page title prints only in the
 * browser title, which no judge reads), so the judging page and the number of locations are recorded
 * (`{unplaced: true, page, storedAt}`). Else the first location the plain build stores it in.
 * @param {Array<{op: string, entry: string | null, loc: object | null}>} entries where the plain build stores the code
 * @param {{op?: string | null, slot?: string, column?: string, judgedOn?: string | null}} failure
 */
export function storedFor(entries, failure = {}) {
  const list = entries ?? []
  const within = (s) =>
    (!failure.slot || s.loc?.slot === failure.slot) && (!failure.column || s.loc?.column === failure.column)
  const onOp = failure.op ? list.filter((s) => s.op === failure.op) : []
  const onPage = failure.judgedOn
    ? list.filter((s) => String(s.entry ?? '').split('.')[0] === failure.judgedOn)
    : []
  // The location the failure names is the one recorded (review 6 S1); every location in `entries` stores the same
  // place, so one with no plan entry (an alias derived from a title, run 6) borrows the page, block and field of an
  // entry of the same operation, never its column or slot.
  const named = onOp.find((s) => Boolean(s.entry))
  const hit = failure.slot || failure.column ? onOp.find(within) : undefined
  return (
    (hit && !hit.entry && named ? { ...hit, entry: named.entry } : hit) ??
    named ??
    onOp[0] ??
    (failure.slot ? list.find((s) => s.loc?.slot === failure.slot) : undefined) ??
    onPage[0] ??
    (failure.judgedOn && list.length > 1
      ? { unplaced: true, page: failure.judgedOn, storedAt: list.length }
      : list[0])
  )
}

/** The path of a stored location, whichever form it has. */
const pathOf = (loc) => loc?.jsonPath ?? loc?.nestedJson ?? loc?.xpath ?? null

/**
 * The name of a place a kit owner can act on: page, block (the plan block and the store block), field and item index,
 * the stored location and the operation that writes it. Never the value.
 * @param {{op: string, entry: string | null, loc: object | null} | undefined} stored
 * @param {object} order the write order (its pages name the store block of each plan block)
 */
export function nameOf(stored, order) {
  // A page finding no location of which the judging page has: the page only, no guessed block or field (review 7 N1).
  if (stored?.unplaced)
    return {
      page: stored.page,
      block: null,
      storeBlock: null,
      field: null,
      location: null,
      storedAt: stored.storedAt
    }
  const [page = null, block = null, ...rest] = String(stored?.entry ?? '')
    .split('.')
    .filter(Boolean)
  const planBlock = (order?.pages ?? []).find((p) => p.id === page)?.blocks?.find((b) => b.id === block)
  const field = rest.length ? rest[rest.length - 1] : null
  const index = rest.slice(0, -1).join('.') || null
  const loc = stored?.loc ?? null
  return {
    page,
    block,
    storeBlock: planBlock?.block ?? null,
    field,
    ...(index ? { item: index } : {}),
    location: loc
      ? {
          op: stored.op,
          entity: loc.entity ?? null,
          column: loc.column ?? null,
          path: pathOf(loc),
          slot: loc.slot ?? null
        }
      : { op: stored?.op ?? null }
  }
}

/** A message cut short: a finding names a field, it never carries a payload. */
export const shortOf = (text) => String(text ?? '').slice(0, 160)
