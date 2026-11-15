// One pass of write safety (ticket #586): the build with the pass's probes, a build refusal traced in memory and taken
// out, the write on a fresh site, a stop traced on the site, every page read (a page that does not answer as planned
// traced through its blocks), each probe judged on the pages. What survives is entered in the ledger as written on
// the site, and only where the probe is found in what was written for that place (`write-safety-reached.mjs`): a probe
// the build dropped is `not_written` and its place untested, and a probe never written is never judged as run by a
// page. A stop of the run's own state ends the pass with no culprit sought. A pass runs again after each culprit is
// taken out, at most `reruns` times. Pure but for the injected parts.
import { bisect } from './bisect.mjs'
import { buildCulprits, pageCulprits, stopOf } from './write-safety-trials.mjs'
import { buildRefusalOf, judgePage, pageBroken, stopClassOf } from './write-safety-judge.mjs'
import { storedIndex } from './write-safety-places.mjs'
import { reachedInPlan, reachedOnPage } from './write-safety-reached.mjs'

/** Why a search found no culprit: its budget ran out, or the failure needs several values together. */
const unnamed = (found, budgetName) => (found.exhausted.length ? budgetName : 'unattributed')

/**
 * @param {number} n the pass number
 * @param {Map<string, object>} assignment place key to probe
 * @param {object} ctx `{attempt, writeOn, record, budget, buildBudget, plainGaps, plainIndex, late, site, ledger}`
 * @param {{reruns: number}} limits
 * @returns {Promise<{runs: number, incomplete?: string}>}
 */
export async function onePass(n, assignment, ctx, limits) {
  const { attempt, writeOn, record, budget, late, site, ledger } = ctx
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
    const refusal = buildRefusalOf(a, ctx.plainGaps)
    if (refusal) {
      const found = await buildCulprits(refusal, a, active, ctx)
      take(found.culprits)
      if (!found.culprits.length) return { runs: run, incomplete: unnamed(found, 'build_steps') }
      continue
    }
    const w = await writeOn(a)
    if (w.report?.status !== 'done') {
      const stop = stopClassOf(w.report)
      if (stop.kind === 'run_state') return { runs: run, incomplete: 'run_state', stop: stop.code }
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
      if (!found.culprits.length) return { runs: run, incomplete: unnamed(found, 'steps') }
      continue
    }
    const pages = await site.pages(a.built, w.record)
    const index = storedIndex(a.built.writePlan)
    const reached = reachedInPlan(a.opts.used, a.built.writePlan, index, ctx.plainIndex)
    const written = new Map([...a.opts.used].filter(([k]) => reached.has(k)))
    const shown = new Set()
    let broken = null
    for (const page of pages) {
      const answer = await site.fetch(page.url)
      const failure = pageBroken(answer, page)
      if (failure) {
        broken = { page, failure }
        break
      }
      for (const k of reachedOnPage(answer.html, a.opts.used, reached)) reached.add(k)
      const judged = judgePage(answer.html, written)
      for (const k of judged.shown) shown.add(k)
      for (const { place, judged: j } of judged.injected)
        if (active.has(place)) {
          record(place, active.get(place), j, n)
          active.delete(place)
        }
    }
    if (broken) {
      const found = await pageCulprits(broken.page, broken.failure, a, w, active, ctx)
      take(found.culprits)
      if (!found.culprits.length) return { runs: run, incomplete: unnamed(found, 'steps') }
      continue
    }
    for (const [key, probe] of active)
      if (a.opts.used.has(key))
        ledger.set(key, probe.id, {
          status: reached.has(key) ? 'written' : 'not_written',
          site: true,
          reached: reached.has(key),
          pass: n,
          seen: shown.has(key)
        })
    return { runs: run }
  }
  return { runs: limits.reruns + 1, incomplete: 'reruns' }
}
