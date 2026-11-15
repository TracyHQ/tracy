// Write safety of the release gate (ticket #586, product decisions 1 and 2): does the site keep and print as words what
// a customer could type into any place the build writes? In passes, each on a fresh site, the marker build writes a
// probe (`write-probes.mjs`) at every place it can; the pass is written, every page read, and each probe classed
// (`write-safety-judge.mjs`). A refusal or an error is traced to the one value that caused it by bisection
// (`bisect.mjs`), that probe is taken out and the pass runs again (at most `reruns` times). The ledger shows which
// probe reached which place. The site and the build are injected: a memory site in the unit test, a real one through
// `gate.mjs` (`release-gate.mjs`). Without a way to reset the site the measurement is `not_run`.
import { bisect, stepBudget } from './bisect.mjs'
import { only, pageCulprits, stopOf } from './write-safety-trials.mjs'
import { buildRefusalOf, FAILING, gapKey, judgePage, stopClassOf } from './write-safety-judge.mjs'
import { nameOf, passOptions, shortOf, storedIndex } from './write-safety-places.mjs'
import { packPass, probeLedger } from './write-probes.mjs'

/**
 * The limits of one measurement (#586): passes, bisection steps, minutes, re-runs of one pass. A pass gives a place one
 * probe, so the passes must cover the place that takes most probes (21 for a text place with a declared limit, with the
 * edge probes and the Joomla ones).
 */
export const LIMITS = Object.freeze({ passes: 24, steps: 40, minutes: 60, reruns: 5 })

/**
 * @param {{build: (options: object) => Promise<object>, site: {reset: Function | null, write: Function,
 *   pages: Function, fetch: Function, off?: Function, back?: Function} | null, probes: object[], limits?: object,
 *   now?: () => number, log?: (line: string) => void}} input `build`: the marker build with the given options;
 *   `site.write(built)` answers `{report, record}`; `site.pages(built, record)` the pages; `site.fetch(url)`
 *   `{status, html}`; `site.off(ops)` / `site.back(ops)` take copies off their pages and back (block bisection)
 * @returns {Promise<{status: string, reason?: string, places?: object, passes?: object[], findings?: object[],
 *   ledger?: object[], missing?: object[], steps?: number}>}
 */
export async function writeSafety({ build, site, probes, limits = LIMITS, now = Date.now, log = () => {} }) {
  if (typeof site?.reset !== 'function') return { status: 'not_run', reason: 'no_reset_hook' }
  const start = now()
  const late = () => now() - start > limits.minutes * 60000
  const budget = stepBudget(limits.steps)
  const plain = passOptions()
  const plainBuilt = await build(plain.options)
  const plainGaps = new Set((plainBuilt.gaps ?? []).map(gapKey))
  const plainIndex = storedIndex(plainBuilt.writePlan)
  const written = [...plain.seen.values()].filter((p) => plainIndex.has(String(p.code).toUpperCase()))
  const places = written.filter((p) => p.type)
  const ledger = probeLedger()
  const findings = []
  const record = (key, probe, failure, pass) => {
    const stored = plainIndex.get(String(plain.seen.get(key)?.code).toUpperCase())?.[0]
    findings.push({
      kind: failure.kind,
      probe: probe.id,
      place: key,
      ...nameOf(stored, plainBuilt.order),
      ...(failure.code ? { code: failure.code } : {}),
      ...(failure.cause ? { cause: failure.cause } : {}),
      ...(failure.site ? { site: failure.site } : {}),
      ...(failure.element ? { element: failure.element } : {}),
      ...(failure.problems ? { problems: failure.problems.map(shortOf) } : {}),
      pass
    })
    ledger.set(key, probe.id, { status: failure.kind, pass })
  }
  const attempt = async (assignment) => {
    const opts = passOptions(assignment)
    try {
      return { opts, built: await build(opts.options) }
    } catch (error) {
      return { opts, error }
    }
  }
  const writeOn = async (a) => {
    await site.reset()
    try {
      return await site.write(a.built)
    } catch (error) {
      return {
        report: { status: 'stopped', code: error.code ?? 'write_failed', details: error.details ?? null }
      }
    }
  }
  const ctx = { attempt, writeOn, record, budget, plainGaps, late, site, ledger, log }
  const passes = []
  let incomplete = null
  for (let n = 1; n <= limits.passes; n++) {
    const assignment = packPass(places, probes, ledger)
    if (!assignment.size) break
    if (late()) {
      incomplete = 'time'
      break
    }
    const began = now()
    const out = await onePass(n, assignment, ctx, limits)
    passes.push({
      pass: n,
      probed: assignment.size,
      runs: out.runs,
      seconds: Math.round((now() - began) / 1000)
    })
    log('write safety pass ' + n + ': ' + assignment.size + ' probes, ' + out.runs + ' run(s)')
    if (out.incomplete) {
      incomplete = out.incomplete
      break
    }
  }
  const missing = ledger.missing(places, probes)
  if (!incomplete && missing.length) incomplete = 'passes'
  const reached = new Set(ledger.rows().map((r) => r.place))
  const failed = findings.some((f) => FAILING.has(f.kind))
  return {
    status: failed ? 'failed' : incomplete ? 'incomplete' : 'passed',
    ...(incomplete ? { incomplete } : {}),
    places: { written: written.length, probed: places.length, tested: reached.size },
    passes,
    findings,
    ledger: ledger.rows(),
    missing: missing.slice(0, 50),
    steps: budget.spent
  }
}

/** One pass: build, refusals traced and taken out, write, every page read; at most `reruns` runs again. */
async function onePass(n, assignment, ctx, limits) {
  const { attempt, writeOn, record, budget, plainGaps, late, site, ledger } = ctx
  const active = new Map(assignment)
  const take = (culprits) => {
    for (const { unit, failure } of culprits) {
      record(unit, active.get(unit), failure, n)
      active.delete(unit)
    }
  }
  for (let run = 1; run <= limits.reruns + 1; run++) {
    if (late()) return { runs: run - 1, incomplete: 'time' }
    const a = await attempt(active)
    for (const [key, problems] of a.opts.refused) {
      record(key, active.get(key), { kind: 'refused_by_build', code: 'page_copy_check', problems }, n)
      active.delete(key)
    }
    const refusal = buildRefusalOf(a, plainGaps)
    if (refusal) {
      const units = [...a.opts.used.keys()]
      const found = await bisect(
        units,
        async (subset) => buildRefusalOf(await attempt(only(active, subset)), plainGaps),
        budget,
        refusal
      )
      take(found.culprits)
      if (!found.culprits.length)
        return { runs: run, incomplete: found.exhausted.length ? 'steps' : 'unattributed' }
      continue
    }
    const w = await writeOn(a)
    if (w.report?.status !== 'done') {
      const stop = stopClassOf(w.report)
      const index = storedIndex(a.built.writePlan)
      // A whole value probe (the empty value, a number) carries no code: the plan cannot say where it went, so it
      // stays a suspect of every stop.
      const inOp = (key) => {
        const at = index.get(String(a.opts.used.get(key).code).toUpperCase())
        return !stop.op || !at || at.some((s) => s.op === stop.op)
      }
      const units = [...a.opts.used.keys()].filter(inOp)
      const found = await bisect(units, (subset) => stopOf(subset, active, ctx), budget, stop)
      take(found.culprits)
      if (!found.culprits.length)
        return { runs: run, incomplete: found.exhausted.length ? 'steps' : 'unattributed' }
      continue
    }
    const pages = await site.pages(a.built, w.record)
    const shown = new Set()
    let broken = null
    for (const page of pages) {
      const answer = await site.fetch(page.url)
      if (answer.status >= 500) {
        broken = page
        break
      }
      const judged = judgePage(answer.html, a.opts.used)
      for (const k of judged.shown) shown.add(k)
      for (const { place, judged: j } of judged.injected)
        if (active.has(place)) {
          record(place, active.get(place), j, n)
          active.delete(place)
        }
    }
    if (broken) {
      const found = await pageCulprits(broken, a, w, active, ctx)
      take(found.culprits)
      if (!found.culprits.length)
        return { runs: run, incomplete: found.exhausted.length ? 'steps' : 'unattributed' }
      continue
    }
    for (const [key, probe] of active)
      if (a.opts.used.has(key))
        ledger.set(key, probe.id, { status: 'written', pass: n, seen: shown.has(key) })
    return { runs: run }
  }
  return { runs: limits.reruns + 1, incomplete: 'reruns' }
}
