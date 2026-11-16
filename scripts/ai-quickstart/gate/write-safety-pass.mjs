// One pass of write safety (ticket #586): the build with the pass's probes, every build refusal found in memory and
// taken out before the write (no rerun), the write on a fresh site, a stop traced on the site, every page read (a page that does not answer as planned
// traced through its blocks), each probe judged on the pages. What survives is entered in the ledger as written on
// the site, and only where the probe is found in what was written for that place (`write-safety-reached.mjs`): a probe
// the build dropped is `not_written` and its place untested, and a probe never written is never judged as run by a
// page. A stop of the run's own state ends the pass with no culprit sought. A pass runs again after each culprit found on
// the site is taken out, at most `reruns` times. A site stop is searched only among the places stored where it names (its
// operation, and the column or slot a read back names); the one place stored there is blamed by the stop itself, more
// are halved, one trial per halving (the rerun meets any other culprit). A stop or a broken page the step limit leaves
// untraced is a finding of its own (`stop_not_traced`, `page_not_traced`): its suspects are set aside (`park`) as
// untested with that reason and the pass runs again without them, so every stop it meets is recorded. Pure but for the
// injected parts.
import { bisect } from './bisect.mjs'
import { buildCulprits, pageCulprits, stopOf } from './write-safety-trials.mjs'
import { buildRefusalOf, judgePage, pageBroken, stopClassOf } from './write-safety-judge.mjs'
import { placeAt, storedIndex } from './write-safety-places.mjs'
import { cleanedInPlan, reachedInPlan, reachedOnPage } from './write-safety-reached.mjs'
import { settleUnreached } from './write-safety-unreached.mjs'

/** Why a search found no culprit: its budget ran out, or the failure needs several values together. */
const unnamed = (found, budgetName) => (found.exhausted.length ? budgetName : 'unattributed')

/**
 * The build of a pass that the build itself accepts, found in memory before any site sees it: every refusal of the
 * page writer's copy check and every value the build's guards refuse is recorded and taken out, and the build made
 * again, until it refuses nothing. Then every probe the plan does not hold at its place is settled
 * (`write-safety-unreached.mjs`: refused or normalized by the build alone, or dropped by another place's probe and
 * tried again in a later pass), so the site is written only with a plan that holds every probe the pass keeps. No
 * rerun, no site step: each round takes at least one probe out, so the rounds end; only the time limit stops them.
 * Answers the attempt, or `{incomplete}`.
 */
async function builtInMemory(n, active, ctx, take) {
  const { attempt, record, late } = ctx
  for (;;) {
    if (late()) return { incomplete: 'time' }
    const a = await attempt(active)
    for (const [key, problems] of a.opts.refused) {
      record(
        key,
        active.get(key),
        { kind: 'refused_by_build', code: 'page_copy_check', problems, evidence: 'named_alone' },
        n
      )
      active.delete(key)
    }
    const refusal = buildRefusalOf(a, ctx.plainGaps)
    if (!refusal) {
      // A probe the accepted plan does not hold is settled in memory before any site (review 7 D2).
      if (!(await settleUnreached(n, active, a, ctx)).changed) return a
      continue
    }
    const found = await buildCulprits(refusal, a, active, ctx)
    take(found.culprits)
    if (!found.culprits.length) return { incomplete: 'unattributed' }
  }
}

/**
 * @param {number} n the pass number
 * @param {Map<string, object>} assignment place key to probe
 * @param {object} ctx `{attempt, writeOn, record, budget, buildBudget, plainGaps, plainIndex, plainAt, late, site,
 *   ledger}`
 * @param {{reruns: number}} limits
 * @returns {Promise<{runs: number, incomplete?: string}>}
 */
export async function onePass(n, assignment, ctx, limits) {
  const { writeOn, record, budget, site, ledger, park, untraced } = ctx
  let short = null
  const active = new Map(assignment)
  const take = (culprits) => {
    for (const { unit, failure } of culprits) {
      record(unit, active.get(unit), failure, n)
      active.delete(unit)
    }
  }
  for (let run = 1; run <= limits.reruns + 1; run++) {
    const a = await builtInMemory(n, active, ctx, take)
    if (a.incomplete) return { runs: run - 1, incomplete: a.incomplete }
    const w = await writeOn(a)
    if (w.report?.status !== 'done') {
      const stop = stopClassOf(w.report)
      if (stop.kind === 'run_state') return { runs: run, incomplete: 'run_state', stop: stop.code }
      const index = storedIndex(a.built.writePlan)
      // A whole value probe (the empty value, a number) carries no code, so the pass plan cannot say where it went:
      // the plain plan can, where it stores the place itself (review 5 Z1), found by the place key and never by the
      // pass's code (review 6 U1). Only a place neither plan stores stays a suspect of every stop.
      const whereOf = (key) => placeAt(key, a.opts.used.get(key), index, ctx.plainAt)
      const inOp = (key) => {
        const at = whereOf(key)
        return !stop.op || !at || at.some((s) => s.op === stop.op)
      }
      let units = [...a.opts.used.keys()].filter(inOp)
      // A read back names the column or the slot that differed: only the places stored there are suspects.
      const there = units.filter((key) =>
        (whereOf(key) ?? []).some(
          (s) =>
            s.op === stop.op &&
            (stop.slot ? s.loc?.slot === stop.slot : stop.column ? s.loc?.column === stop.column : false)
        )
      )
      if (there.length) units = there
      if (units.length === 1) {
        take([{ unit: units[0], failure: { ...stop, evidence: 'named_alone' } }])
        continue
      }
      const found = await bisect(units, (subset) => stopOf(subset, active, ctx), budget, stop, {
        firstOnly: true
      })
      take(found.culprits)
      if (!found.culprits.length) {
        short ??= unnamed(found, 'steps')
        untraced({
          ...stop,
          kind: 'stop_not_traced',
          class: stop.kind,
          pass: n,
          suspects: units,
          why: unnamed(found, 'steps')
        })
        if (!units.length) return { runs: run, incomplete: short }
        for (const key of units) {
          park(key, {
            why: found.exhausted.length ? 'suspect_of_untraced_stop' : 'suspect_of_unattributed_stop',
            op: stop.op ?? null,
            code: stop.code
          })
          active.delete(key)
        }
      }
      continue
    }
    const pages = await site.pages(a.built, w.record)
    const index = storedIndex(a.built.writePlan)
    const reached = reachedInPlan(a.opts.used, a.built.writePlan, index, ctx.plainAt)
    // A probe the build cleaned is judged on its cleaned form (#597): the page must show the words as typed.
    const cleaned = cleanedInPlan(a.opts.used, a.built.writePlan, index)
    const written = new Map(
      [...a.opts.used]
        .filter(([k]) => reached.has(k))
        .map(([k, u]) => [k, cleaned.has(k) ? { ...u, cleaned: true } : u])
    )
    const shown = new Set()
    // Places a page printed only cut short, and places a page printed so that their probe was judged (review 6 S2).
    const cutOn = new Set()
    const judgedOn = new Set()
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
      for (const k of judged.shown) {
        shown.add(k)
        if (judged.cut.has(k)) cutOn.add(k)
        else judgedOn.add(k)
      }
      // Judged on this page, not isolated by trials: the finding says so and names the page (review 5 Z2).
      for (const { place, judged: j } of judged.injected)
        if (active.has(place)) {
          record(place, active.get(place), { ...j, evidence: 'page', judgedOn: page.pageType ?? null }, n)
          active.delete(place)
        }
    }
    if (broken) {
      const found = await pageCulprits(broken.page, broken.failure, a, w, active, ctx)
      take(found.culprits)
      if (!found.culprits.length) {
        // An untraced broken page: its suspects are every probe of the pass that page could show.
        const suspects = found.suspects ?? [...a.opts.used.keys()].filter((k) => active.has(k))
        short ??= unnamed(found, 'steps')
        if (!suspects.length) return { runs: run, incomplete: short }
        untraced({
          ...broken.failure,
          kind: 'page_not_traced',
          class: broken.failure.kind,
          page: broken.page.pageType ?? null,
          cause: broken.failure.cause ?? broken.page.pageType ?? null,
          pass: n,
          suspects,
          why: unnamed(found, 'steps')
        })
        for (const key of suspects) {
          park(key, {
            why: found.exhausted?.length ? 'suspect_of_untraced_page' : 'suspect_of_unattributed_page',
            page: broken.page.pageType ?? null
          })
          active.delete(key)
        }
      }
      continue
    }
    // A probe every page printed only cut short was judged by none: it has a result, `not_judged`, and its place is
    // not tested from it (review 6 S2).
    const cutOnly = (key) => cutOn.has(key) && !judgedOn.has(key)
    for (const [key, probe] of active)
      if (a.opts.used.has(key))
        ledger.set(key, probe.id, {
          status: !reached.has(key)
            ? 'not_written'
            : cutOnly(key)
              ? 'not_judged'
              : cleaned.has(key)
                ? 'cleaned_by_build'
                : 'written',
          ...(reached.has(key) && cutOnly(key) ? { why: 'every_print_cut' } : {}),
          site: true,
          reached: reached.has(key),
          pass: n,
          seen: shown.has(key)
        })
    return short ? { runs: run, incomplete: short } : { runs: run }
  }
  return { runs: limits.reruns + 1, incomplete: short ?? 'reruns' }
}
