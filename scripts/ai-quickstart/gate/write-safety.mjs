// Write safety of the release gate (ticket #586, product decisions 1 and 2): does the site keep and print as words what
// a customer could type into any place the build writes? First the plain marker build must be written on the site
// and its pages answer as planned: otherwise no value can be blamed and the measurement is `incomplete`. Then, in
// passes, each on a fresh site, the marker build writes a probe (`write-probes.mjs`) at every place it can; the pass is
// written, every page read, and each probe classed (`write-safety-judge.mjs`, one pass in `write-safety-pass.mjs`). A
// refusal or an error is traced to the one value that caused it (`write-safety-trials.mjs`), that probe is taken out
// and the pass runs again. A place counts as tested only when its probe is found in what was written there and the
// pages answered (`write-safety-reached.mjs`). The ledger of the finished passes is kept after each one
// (`write-safety-state.mjs`), so a run stopped by its time limit resumes from the next pass. The site and the build are
// injected: a memory site in the unit test, a real one through `gate.mjs` (`release-gate.mjs`). Without a way to reset
// the site the measurement is `not_run`.
import { stepBudget } from './bisect.mjs'
import { coverageOf } from './write-safety-coverage.mjs'
import { gapKey, pageBroken } from './write-safety-judge.mjs'
import { onePass } from './write-safety-pass.mjs'
import { resultOf } from './write-safety-result.mjs'
import { nameOf, passOptions, shortOf, storedIndex } from './write-safety-places.mjs'
import { resumed } from './write-safety-state.mjs'
import { packPass, probeLedger } from './write-probes.mjs'

/**
 * The limits of one run of the measurement (#586), from the times measured on a real T4 template (plugin 0.24.85, a
 * database snapshot reset): a marker build in memory about 7 s, a full site write about 40 s, a reset and the page
 * reads about 30 s, so a pass about 80 s. A pass gives a place one probe, so the passes cover the place that takes most
 * probes (21); 21 clean passes take about 28 minutes. Site steps (a fresh site and a write each, about 20 s when the
 * write stops early, 70 s when it runs to the end) are limited; builds in memory (about 1.5 s each) are only counted,
 * and a refusal found in memory is no rerun. A site stop names its operation and, for a read back, the column or slot:
 * on the T4 template of run 4 that is one probed place, blamed with no step, so a stop costs one rerun of the pass, not a
 * bisection over the pass (about 9 steps each in run 4, which left 0 of 316 places tested). A pass may meet many such
 * stops, hence `reruns` 20 per pass; the time limit bounds them all. Past a limit the measurement is `incomplete` and
 * the next run into the same run folder resumes it (a resumed record is never released).
 */
export const LIMITS = Object.freeze({ passes: 24, steps: 20, minutes: 60, reruns: 20 })

const incompleteOf = (reason, more = {}) => ({ status: 'incomplete', incomplete: reason, reason, ...more })

/**
 * @param {{build: (options: object) => Promise<object>, site: object | null, probes: object[], limits?: object,
 *   now?: () => number, log?: (line: string) => void, plain?: {report: object} | null, state?: object | null,
 *   stateKey?: string | null, universeKeys?: string[] | null}} input `universeKeys`: the place keys the marker test's
 *   universe counts as written, for the coverage table `site`: `{reset, write, pages, fetch, off?,
 *   back?}`; `plain`: the site write of the plain marker build the run already made (the marker test), else write
 *   safety writes it once itself; `state`/`stateKey`: where the passes are kept and under what key
 */
export async function writeSafety(input) {
  const { build, site, probes, now = Date.now, log = () => {} } = input
  if (typeof site?.reset !== 'function') return { status: 'not_run', reason: 'no_reset_hook' }
  const limits = { ...LIMITS, ...input.limits }
  if (!probes?.length) return incompleteOf('no_probes')
  const start = now()
  const late = () => now() - start > limits.minutes * 60000
  const plain = passOptions()
  let plainBuilt
  try {
    plainBuilt = await build(plain.options)
  } catch (error) {
    return incompleteOf('plain_build_failed', { code: String(error?.code ?? 'build_failed') })
  }
  const plainIndex = storedIndex(plainBuilt.writePlan)
  const written = [...plain.seen.values()].filter((p) => plainIndex.has(String(p.code).toUpperCase()))
  const places = written.filter((p) => p.type)
  const coverage = coverageOf(plainBuilt.writePlan, plain.seen, input.universeKeys ?? null)
  const counts = { written: written.length, probed: places.length, tested: 0 }
  if (!places.length) return incompleteOf('no_places', { places: counts, coverage })
  const base = await plainOnSite(site, plainBuilt, input.plain)
  if (base) return incompleteOf(base.reason, { ...base, places: counts, coverage, findings: [], steps: 0 })

  const ledger = probeLedger()
  const findings = []
  const passes = []
  // The places set aside as suspects of a stop or a broken page no step was left to trace, with why: no later pass
  // probes them, and they end untested with that reason.
  const parked = new Map()
  const was = resumed(input.state, input.stateKey)
  for (const r of was?.ledger ?? []) ledger.set(r.place, r.probe, r)
  findings.push(...(was?.findings ?? []))
  // A pass carried from a saved state says so itself (review 4 X5): the record shows it was not measured in this run.
  passes.push(...(was?.passes ?? []).map((p) => ({ ...p, resumed: true })))
  for (const [k, v] of was?.parked ?? []) parked.set(k, v)
  const budget = stepBudget(Math.max(0, limits.steps - (was?.steps ?? 0)))
  // Builds in memory are counted, never limited: a refusal found there costs no site and no rerun (`write-safety-pass.mjs`).
  const buildBudget = stepBudget(Number.MAX_SAFE_INTEGER)
  const spent = () => ({
    steps: (was?.steps ?? 0) + budget.spent,
    buildSteps: (was?.buildSteps ?? 0) + buildBudget.spent
  })
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
      // How the place was found: the only probed place stored where a refusal names (`named_alone`), built alone
      // (`built_alone`), or a trial of a bisection (`trial`).
      evidence: failure.evidence ?? 'trial',
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
      return { report: { status: 'stopped', code: error.code ?? null, details: error.details ?? null } }
    }
  }
  const plainGaps = new Set((plainBuilt.gaps ?? []).map(gapKey))
  const park = (key, why) => {
    if (!parked.has(key)) parked.set(key, why)
  }
  // A stop or a broken page met and left untraced: a finding with what the site said, never a culprit.
  const untraced = ({ suspects, ...stop }) =>
    findings.push({
      kind: stop.kind,
      // What the site did (`door_refused`, `server_error`...) and where: never a place, none was traced.
      ...(stop.class ? { class: stop.class } : {}),
      ...(stop.page ? { page: stop.page } : {}),
      code: stop.code ?? null,
      ...(stop.op ? { op: stop.op } : {}),
      ...(stop.cause ? { cause: stop.cause } : {}),
      ...(stop.column ? { column: stop.column } : {}),
      ...(stop.slot ? { slot: stop.slot } : {}),
      culprit: 'not_traced',
      why: stop.why,
      suspects: suspects.length,
      pass: stop.pass
    })
  const ctx = {
    attempt,
    writeOn,
    record,
    budget,
    buildBudget,
    plainGaps,
    plainIndex,
    late,
    site,
    ledger,
    park,
    untraced,
    log
  }
  let incomplete = null
  let stop = null
  for (let n = passes.length + 1; n <= limits.passes; n++) {
    const assignment = packPass(
      places.filter((p) => !parked.has(p.key)),
      probes,
      ledger
    )
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
    input.state?.save({
      key: input.stateKey ?? null,
      ledger: ledger.rows(),
      findings,
      passes,
      parked: [...parked],
      ...spent()
    })
    if (out.incomplete) {
      incomplete = out.incomplete
      stop = out.stop ?? null
      break
    }
  }
  return resultOf({
    places,
    written,
    ledger,
    probes,
    findings,
    passes,
    incomplete,
    stop,
    coverage,
    was,
    spent,
    parked,
    ranFor: Math.round((now() - start) / 1000)
  })
}

/** The plain marker build on the site: written to the end, every page answering as planned; else why not. */
async function plainOnSite(site, built, given) {
  if (given) {
    return given.report?.status === 'done'
      ? null
      : { reason: 'plain_write_stopped', stop: { code: given.report?.code ?? null } }
  }
  await site.reset()
  let w
  try {
    w = await site.write(built)
  } catch (error) {
    w = { report: { status: 'stopped', code: error.code ?? null } }
  }
  if (w.report?.status !== 'done')
    return { reason: 'plain_write_stopped', stop: { code: w.report?.code ?? null } }
  for (const page of await site.pages(built, w.record)) {
    const failure = pageBroken(await site.fetch(page.url), page)
    if (failure) return { reason: 'plain_pages_broken', page: page.pageType ?? null, failure }
  }
  return null
}
