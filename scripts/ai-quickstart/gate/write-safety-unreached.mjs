// The probes a pass's build did not write, settled in memory before the site write (ticket #586, review 7 D2). A probe
// the plan does not hold at its place is built alone (the place's probe, every other place plain), and that build
// decides what it is, once per (place, probe) pair:
//   refused       the build refuses it alone: a finding of its own (`built_alone`)
//   normalized    the build writes it otherwise alone too, by its own rule (an empty title replaced, an empty row
//                 dropped, a number wrapped in a paragraph): `normalized_by_build` in the ledger, with what the build
//                 wrote, a result that does not block a pass, since the probe never reached the site
//   unsafe        the build writes it otherwise alone, but what it wrote still holds the probe's danger (its signature
//                 or its code) without the place's marker: no page can judge it, so it fails (`normalized_unsafe`)
//   dropped       the build writes it alone: another place's probe of the pass made the build drop it (an item it took
//                 out, a list that closed up), so it is taken out of this pass untried and tried again in a later one
// A pair dropped a second time is packed apart from the probe that drops it, found by builds in memory. A pass is
// written on the site only once its plan holds every probe it keeps. Pure but for the injected build.
import { bisect } from './bisect.mjs'
import { buildRefusalOf } from './write-safety-judge.mjs'
import { storedIndex, storedOf } from './write-safety-places.mjs'
import { reachedInPlan } from './write-safety-reached.mjs'
import { only } from './write-safety-trials.mjs'
import { placeKeyOf } from './universe.mjs'

const pairOf = (key, probe) => key + '\u0000' + probe.id

/** A stored value cut short around the place's own marker: what the build wrote, never a whole article. */
function shortAround(value, code) {
  const v = String(value)
  const at = v.toUpperCase().indexOf('QX' + String(code).toUpperCase())
  const from = at > 20 ? at - 20 : 0
  return (from ? '...' : '') + v.slice(from, from + 80) + (v.length > from + 80 ? '...' : '')
}

/**
 * What a plan writes at the locations where the plain build stores a place: each location's value, or `dropped`
 * when the plan has no such operation or location.
 */
export function writtenAt(key, plan, plainAt) {
  const byOp = new Map((plan?.ops ?? []).map((op) => [op.key, op]))
  return (plainAt(key) ?? []).map((s) => {
    const op = byOp.get(s.op)
    const where = s.loc ? placeKeyOf(s.loc) : null
    const hit = op
      ? storedOf(op).find((x) => (where ? x.loc && placeKeyOf(x.loc) === where : x.entry === s.entry))
      : null
    return hit ? { op: s.op, value: hit.value } : { op: s.op, dropped: true }
  })
}

/** The danger a probe leaves in a value even without the place's marker: its signature, or its own code. */
const dangersOf = (probe, code) => [probe.danger?.(code), probe.signature?.(code)].filter(Boolean)

/** Whether what the build wrote still holds the probe's danger. */
export function holdsDanger(wrote, probe, code) {
  const dangers = dangersOf(probe, code).map((d) => String(d).toLowerCase())
  return wrote.some((w) => !w.dropped && dangers.some((d) => String(w.value).toLowerCase().includes(d)))
}

/** The class of one pair built alone (see the header). */
async function aloneOf(key, active, ctx) {
  const probe = active.get(key)
  const a = await ctx.attempt(only(active, [key]))
  if (a.opts?.refused?.has(key))
    return {
      class: 'refused',
      failure: {
        kind: 'refused_by_build',
        code: 'page_copy_check',
        problems: a.opts.refused.get(key),
        evidence: 'built_alone'
      }
    }
  const refusal = buildRefusalOf(a, ctx.plainGaps)
  if (refusal) return { class: 'refused', failure: { ...refusal, evidence: 'built_alone' } }
  const plan = a.built.writePlan
  if (reachedInPlan(a.opts.used, plan, storedIndex(plan), ctx.plainAt).has(key)) return { class: 'dropped' }
  const code = a.opts.used.get(key)?.code
  const at = writtenAt(key, plan, ctx.plainAt)
  const wrote = at.map((w) =>
    w.dropped ? { op: w.op, dropped: true } : { op: w.op, value: shortAround(w.value, code) }
  )
  return { class: holdsDanger(at, probe, code) ? 'unsafe' : 'normalized', wrote }
}

/**
 * Settle the probes a pass's accepted build does not hold at their places. Answers `{changed}`: true when a probe was
 * taken out of `active`, so the pass is built again (taking a normalized probe out may give a dropped one its item
 * back); false when the plan holds every probe left.
 * @param {number} n the pass
 * @param {Map<string, object>} active the probes the pass still writes
 * @param {{opts: object, built: object}} a the pass's accepted build
 * @param {object} ctx `{attempt, plainAt, plainGaps, buildBudget, record, ledger, defer, timesDeferred, alone}`;
 *   `alone`: the class of each pair built alone, kept for the run; `defer(key, probe)`: the pair is taken out of this
 *   pass untried, tried again in a later one; `timesDeferred(key, probe)`: how often it was
 */
export async function settleUnreached(n, active, a, ctx) {
  const plan = a.built.writePlan
  const reached = reachedInPlan(a.opts.used, plan, storedIndex(plan), ctx.plainAt)
  const unreached = [...a.opts.used.keys()].filter((k) => active.has(k) && !reached.has(k))
  if (!unreached.length) return { changed: false }
  const dropped = []
  let settled = 0
  for (const key of unreached) {
    const probe = active.get(key)
    const pair = pairOf(key, probe)
    if (!ctx.alone.has(pair)) {
      ctx.buildBudget.take()
      ctx.alone.set(pair, await aloneOf(key, active, ctx))
    }
    const alone = ctx.alone.get(pair)
    if (alone.class === 'dropped') {
      dropped.push(key)
      continue
    }
    settled += 1
    active.delete(key)
    if (alone.class === 'refused') ctx.record(key, probe, alone.failure, n)
    else if (alone.class === 'unsafe')
      ctx.record(
        key,
        probe,
        {
          kind: 'normalized_unsafe',
          code: 'probe_written_unmarked',
          evidence: 'built_alone',
          wrote: alone.wrote
        },
        n
      )
    else ctx.ledger.set(key, probe.id, { status: 'normalized_by_build', pass: n, wrote: alone.wrote })
  }
  // Probes taken out first: their removal may give a dropped probe its item back, so the pass is built again.
  if (settled) return { changed: true }
  // A pair dropped for the first time waits for a later pass, whose packing differs. One dropped before finds, by
  // builds in memory, the probe that drops it: that probe waits instead, so this pass packs the two apart.
  for (const key of dropped) {
    const probe = active.get(key)
    if (ctx.timesDeferred(key, probe) > 0) {
      const culprit = await droppedBy(key, active, ctx)
      if (culprit) {
        ctx.defer(culprit, active.get(culprit))
        active.delete(culprit)
        return { changed: true }
      }
    }
    ctx.defer(key, probe)
    active.delete(key)
  }
  return { changed: true }
}

/** The one probe of a pass that makes the build drop `key`, found by halving the others in memory; null when none alone. */
async function droppedBy(key, active, ctx) {
  const others = [...active.keys()].filter((k) => k !== key)
  const drops = async (subset) => {
    const a = await ctx.attempt(only(active, [key, ...subset]))
    if (buildRefusalOf(a, ctx.plainGaps) || a.opts.refused.size) return null
    const plan = a.built.writePlan
    return reachedInPlan(a.opts.used, plan, storedIndex(plan), ctx.plainAt).has(key) ? null : true
  }
  const found = await bisect(others, drops, ctx.buildBudget, true, { firstOnly: true })
  return found.culprits[0]?.unit ?? null
}
