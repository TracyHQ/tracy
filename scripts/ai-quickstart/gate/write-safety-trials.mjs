// The trials of write safety's bisection (ticket #586). Two counts, never mixed: a build refusal is found in memory
// (the build runs without a site), every place its problems name at once and the rest by bisection, each trial a build
// counted but not limited; a stopped write or an erroring page is found on the site, each trial a site step (a fresh site and a write, or the
// blocks of an erroring page taken off it on the same site). Pure but for the injected build and site.
import { bisect, bisectBlocks } from './bisect.mjs'
import { buildRefusalOf, pageBroken, stopClassOf } from './write-safety-judge.mjs'
import { storedIndex } from './write-safety-places.mjs'

/** The probes of an assignment kept for a subset of its places. */
export const only = (assignment, keys) => new Map([...assignment].filter(([k]) => keys.includes(k)))

/** The problems a build refusal names: a guard's problem list, a gap's record, an order problem's entry. */
function namedProblems(refusal) {
  const problems = refusal.details?.problems ?? []
  if (problems.length) return problems
  if (refusal.at) return [{ entry: refusal.at }]
  if (refusal.op) return [{ op: refusal.op }]
  return []
}

/** Whether a problem names a stored location exactly (its entry or slot), or only the operation that writes it. */
const exactly = (p, s) => (p.entry ? s.entry === p.entry : p.slot ? s.loc?.slot === p.slot : false)
const byOp = (p, s) =>
  !p.entry && !p.slot && p.op ? s.op === p.op && (!p.column || s.loc?.column === p.column) : false

/**
 * The probed places a refusal names, found by where the plain build stores each place's code: `exact` with the
 * problem that names each (its entry or slot), `byOp` the places only an operation of a problem names.
 */
export function namedPlaces(refusal, used, plainIndex) {
  const problems = namedProblems(refusal)
  const exact = new Map()
  const op = []
  for (const [key, { code }] of used) {
    const stored = plainIndex.get(String(code).toUpperCase()) ?? []
    const hit = problems.find((p) => stored.some((s) => exactly(p, s)))
    if (hit) exact.set(key, hit)
    else if (problems.some((p) => stored.some((s) => byOp(p, s)))) op.push(key)
  }
  return { exact, op }
}

/** The finding of one problem of a refusal: its own class and code where it has them. */
const failureOf = (refusal, p) =>
  p?.failure ?? { ...refusal, code: p?.code ? String(p.code) : refusal.code, details: undefined }

/**
 * The probes a build refuses, in memory only, all of them from one refusal: every place a problem names by its entry
 * or slot is a culprit at once (the plain build has no such problem, and only that place's probe is stored there);
 * places only an operation names, or every probe when nothing is named, are traced by bisection over builds. A build
 * in memory is no site step and no rerun: its trials are counted (`buildBudget`), never limited but by time.
 */
export async function buildCulprits(refusal, a, active, ctx) {
  const { attempt, buildBudget, plainGaps, plainIndex } = ctx
  const refuses = async (subset) => buildRefusalOf(await attempt(only(active, subset)), plainGaps)
  const named = namedPlaces(refusal, a.opts.used, plainIndex)
  const culprits = [...named.exact].map(([unit, p]) => ({ unit, failure: failureOf(refusal, p) }))
  if (culprits.length) return { culprits, together: [], exhausted: [], steps: 0 }
  if (named.op.length) {
    const found = await bisect(named.op, refuses, buildBudget, refusal)
    if (found.culprits.length) return found
  }
  return bisect([...a.opts.used.keys()], refuses, buildBudget, refusal)
}

/** A trial of a subset of probes on a fresh site: the class of its stopped write, or null when it is written. */
export async function stopOf(subset, active, { attempt, writeOn, plainGaps }) {
  const a = await attempt(only(active, subset))
  if (buildRefusalOf(a, plainGaps)) return null
  const w = await writeOn(a)
  return w.report?.status === 'done' ? null : stopClassOf(w.report)
}

/** The probes that make a page not answer as planned: its blocks on the same site first, then those blocks' values. */
export async function pageCulprits(page, failure, a, w, active, ctx) {
  const { attempt, writeOn, budget, site, plainGaps } = ctx
  const pageFails = async () => pageBroken(await site.fetch(page.url), page)
  const index = storedIndex(a.built.writePlan)
  const opsOf = (key) => (index.get(String(a.opts.used.get(key).code).toUpperCase()) ?? []).map((s) => s.op)
  let units = [...a.opts.used.keys()]
  if (site.off && site.back) {
    const ops = [...new Set(units.flatMap(opsOf))]
    const blocks = await bisectBlocks({
      blocks: ops,
      off: (x) => site.off(x, w.record),
      back: (x) => site.back(x, w.record),
      pageFails,
      budget
    })
    if (blocks.culprits.length)
      units = units.filter((k) => opsOf(k).some((op) => blocks.culprits.some((c) => c.unit === op)))
  }
  const named = { ...failure, cause: failure.cause ?? page.pageType ?? null }
  return bisect(
    units,
    async (subset) => {
      const t = await attempt(only(active, subset))
      if (buildRefusalOf(t, plainGaps)) return null
      const tw = await writeOn(t)
      if (tw.report?.status !== 'done') return null
      const broken = pageBroken(await site.fetch(page.url), page)
      return broken ? { ...broken, cause: broken.cause ?? named.cause } : null
    },
    budget,
    named
  )
}
