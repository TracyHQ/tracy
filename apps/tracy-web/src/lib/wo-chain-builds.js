/**
 * The per-site table of /ops/wo for step chain builds (#481, spec #472): one row per site the chain built, read from the
 * measurement the run frame keeps on the site's brief row (`site_brief.timings.chain`, written by
 * `sites/brief-engines/step-chain.js` and `brief-build.js`). The numbers are the runs' own minutes and spend; nothing here
 * is estimated. Staff only: the door (`ops/wo.js`) admits internal emails and nobody else.
 */

import { bornSiteAddress } from './site-address.js'
import { CURRENT_BRIEF } from './site-brief-row.js'
import { chainTemplateOf } from './step-chain-switch.js'

/** A run is "far above the usual" when it took more than this many times the median of the builds listed. */
export const SLOW_FACTOR = 2
/** Fewer builds than this have no usual duration yet, so none is highlighted. */
export const SLOW_MIN_BUILDS = 3
/** The states of a brief row whose run is still going (`sites/brief-store.js` `OPEN_STATES`; `lib/` cannot import a domain). */
const OPEN_STATES = ['queued', 'preparing', 'ready', 'applying']

/**
 * The chain's own steps in the order they start (`sites/brief-engines/step-chain.js`), with the English label the seller
 * reads (#516). The base site (`site`) is made by the host beside them and is not a step the seller waits on; the Write
 * step holds the Site check and the repair pass (step 9 whole).
 */
export const CHAIN_STEPS = Object.freeze([
  Object.freeze({ id: 'kit', label: 'Template kit' }),
  Object.freeze({ id: 'brand', label: 'Brand colors' }),
  Object.freeze({ id: 'plan', label: 'Page plan' }),
  Object.freeze({ id: 'copy', label: 'Page texts' }),
  Object.freeze({ id: 'pictures', label: 'Photos' }),
  Object.freeze({ id: 'write', label: 'Writing to the site' })
])
const CHAIN_IDS = CHAIN_STEPS.map((s) => s.id)

/**
 * The furthest active chain step, falling back to the furthest recorded step when none is active. Steps run side by
 * side: completed pictures must not hide the page texts that are still running.
 * @param {{ running?: unknown, steps?: unknown } | null | undefined} chain
 * @returns {string | null}
 */
export function chainStepOf(chain) {
  const active = (Array.isArray(chain?.running) ? chain.running : []).filter((id) =>
    CHAIN_IDS.includes(String(id))
  )
  const started = active.length ? active : Array.isArray(chain?.steps) ? chain.steps.map((s) => s?.step) : []
  const furthest = Math.max(-1, ...started.map((id) => CHAIN_IDS.indexOf(String(id))))
  return furthest < 0 ? null : CHAIN_IDS[furthest]
}

/** Whether a brief row's run is still going. @param {string | null | undefined} state */
export const chainRunOpen = (state) => OPEN_STATES.includes(String(state))

/** How many builds the table shows, newest first. */
export const CHAIN_BUILDS_LIMIT = 200

const finiteOrZero = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const measuredUsd = (value) => (value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null)

const medianOf = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ origin: string, siteDomain?: string }} config
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ builds: object[], medianMinutes: number, slowAfterMinutes: number | null }>}
 */
export async function listChainBuilds(pool, config, { limit = CHAIN_BUILDS_LIMIT, now = Date.now } = {}) {
  const { rows } = await pool.query(
    `select b.site_key, b.quickstart, b.state, b.created_at, b.updated_at, b.error, b.timings,
            coalesce(case when b.timings ->> 'attemptStartedAt' ~ '^[1-9][0-9]{0,14}$'
                          then (b.timings ->> 'attemptStartedAt')::numeric end,
                     extract(epoch from b.created_at) * 1000) as attempt_started_at,
            b.timings -> 'chain' as chain, s.label
       from site_brief b left join site s on s.site_key = b.site_key
      where b.timings ? 'chain' and ${CURRENT_BRIEF}
      order by attempt_started_at desc
      limit $1`,
    [limit]
  )
  const builds = rows.map((row) => {
    const chain = row.chain ?? {}
    const steps = Array.isArray(chain.steps) ? chain.steps : []
    const spent = steps.reduce((sum, s) => sum + (measuredUsd(s.usd) ?? measuredUsd(s.knownUsd) ?? 0), 0)
    const partial = steps.some((s) => measuredUsd(s.usd) === null)
    const attemptMs = Number(row.attempt_started_at)
    const startedMs =
      Number.isFinite(attemptMs) && attemptMs > 0 ? attemptMs : new Date(row.created_at).getTime()
    // A snapshot of a run that was going: still going while the row is open, otherwise it ended without finishing its
    // record (a hard failure), at the step that was under way (the write when none was).
    const unfinished = chain.ending === 'running'
    const running = unfinished && OPEN_STATES.includes(row.state)
    const ending = running
      ? 'running'
      : unfinished
        ? 'failed'
        : chain.ending === 'complete'
          ? 'complete'
          : 'soft-failure'
    const underway = Array.isArray(chain.running) ? chain.running.map(String) : []
    // A dead worker leaves its last progress snapshot, not a terminal measurement. Its settlement is
    // immutable on new rows; legacy updated_at can include later edits and is only an upper bound.
    const interrupted = unfinished && !running
    // A worker lost during an active step cannot report that step's final provider charge.
    const unknownSpend = partial || (interrupted && underway.length > 0)
    const validEnd = (value) => Number.isFinite(value) && value >= startedMs && value <= now()
    const stamped = /^[1-9][0-9]{0,14}$/.test(String(row.timings?.interruptedAt ?? ''))
      ? Number(row.timings.interruptedAt)
      : NaN
    const updated = row.updated_at == null ? NaN : new Date(row.updated_at).getTime()
    const endedMs = validEnd(stamped) ? stamped : validEnd(updated) ? updated : null
    const interruption = interrupted
      ? {
          reason: typeof row.error === 'string' ? row.error : null,
          endedAt: endedMs === null ? null : new Date(endedMs).toISOString(),
          timeSource: validEnd(stamped) ? 'settled' : endedMs === null ? 'snapshot' : 'last-update',
          bound: validEnd(stamped) ? null : endedMs === null ? 'lower' : 'upper',
          // Settlement is not proof of the provider's execution end or its unreported spend.
          executionEndedAt: null,
          steps: underway.map((step) => ({ step, minutes: null, usd: null }))
        }
      : null
    return {
      siteKey: row.site_key,
      label: row.label ?? null,
      address: row.label && config.siteDomain ? bornSiteAddress(row.label, config) : null,
      template: chainTemplateOf(row.quickstart) || null,
      startedAt: new Date(startedMs).toISOString(),
      // A running build counts its minutes from the press until now; spend is what the finished steps cost so far.
      totalMinutes: running
        ? Math.round(((now() - startedMs) / 60_000) * 100) / 100
        : interrupted && endedMs !== null
          ? Math.max(
              finiteOrZero(chain.totalMinutes),
              Math.round(((endedMs - startedMs) / 60_000) * 100) / 100
            )
          : finiteOrZero(chain.totalMinutes),
      rawChain: chain,
      interruption,
      totalUsd: unfinished
        ? unknownSpend
          ? null
          : Math.round(spent * 10_000) / 10_000
        : measuredUsd(chain.totalUsd),
      ...((unfinished ? unknownSpend : measuredUsd(chain.totalUsd) === null)
        ? { knownUsd: Math.round((measuredUsd(chain.knownUsd) ?? spent) * 10_000) / 10_000 }
        : {}),
      ending,
      failedStep:
        ending === 'failed'
          ? (underway[0] ?? 'write')
          : ending !== 'running' && typeof chain.failedStep === 'string'
            ? chain.failedStep
            : null,
      runningSteps: running ? underway : [],
      steps: steps.map((s) => ({
        step: String(s.step),
        minutes: finiteOrZero(s.minutes),
        usd: measuredUsd(s.usd),
        ...(measuredUsd(s.usd) === null ? { knownUsd: measuredUsd(s.knownUsd) ?? 0 } : {}),
        outcome: String(s.outcome ?? ''),
        error: typeof s.error === 'string' ? s.error : null
      })),
      slow: false
    }
  })
  // The usual duration is the median of the builds that finished; a running build is judged against it so far.
  const medianMinutes = medianOf(builds.filter((b) => b.ending !== 'running').map((b) => b.totalMinutes))
  const finished = builds.filter((b) => b.ending !== 'running').length
  const slowAfterMinutes =
    finished >= SLOW_MIN_BUILDS && medianMinutes > 0 ? medianMinutes * SLOW_FACTOR : null
  if (slowAfterMinutes !== null) for (const b of builds) b.slow = b.totalMinutes > slowAfterMinutes
  return { builds, medianMinutes, slowAfterMinutes }
}

/** Fewer builds of one template than this are not its own estimate yet: every template's builds are used instead. */
export const ESTIMATE_MIN_BUILDS = 3

/**
 * What a chain build is expected to take, measured (#516, spec #512): the median minutes and the median USD of the chain
 * builds that ended complete, for the same template when it has `ESTIMATE_MIN_BUILDS` of them, else over every template;
 * null when no chain build ever ended complete. Nothing is invented: a soft failure (steps skipped) and a run that never
 * finished are left out, since neither says what a whole build takes.
 *
 * The returned function also carries `steps(template)` (#537): the same builds, the same template rule, read per chain
 * step (`chainStepEstimates`), so a step that has not run yet can say what it usually takes. Steps run side by side, so
 * the per-step minutes add up to more than the whole build's minutes.
 * @param {import('pg').Pool} pool
 * @returns {Promise<((template: string) => { minutes: number, usd: number } | null) &
 *   { steps: (template: string) => Record<string, { minutes: number, usd: number }> }>} by template (`chainTemplateOf`)
 */
export async function chainEstimates(pool, { limit = CHAIN_BUILDS_LIMIT } = {}) {
  const { rows } = await pool.query(
    `select b.quickstart, b.timings -> 'chain' as chain
       from site_brief b left join site s on s.site_key = b.site_key
      where b.timings -> 'chain' ->> 'ending' = 'complete' and ${CURRENT_BRIEF}
      order by b.created_at desc
      limit $1`,
    [limit]
  )
  const builds = rows.map((r) => ({
    template: chainTemplateOf(r.quickstart),
    minutes: finiteOrZero(r.chain?.totalMinutes),
    usd: finiteOrZero(r.chain?.totalUsd),
    steps: Array.isArray(r.chain?.steps) ? r.chain.steps : []
  }))
  const estimate = (list) =>
    list.length === 0
      ? null
      : {
          minutes: Math.round(medianOf(list.map((b) => b.minutes)) * 10) / 10,
          usd: Math.round(medianOf(list.map((b) => b.usd)) * 100) / 100
        }
  const all = estimate(builds)
  const allSteps = chainStepEstimates(builds)
  const own = (template) => builds.filter((b) => b.template === template)
  const byTemplate = (template) => {
    const list = own(template)
    return list.length >= ESTIMATE_MIN_BUILDS ? estimate(list) : all
  }
  byTemplate.steps = (template) => {
    const list = own(template)
    return list.length >= ESTIMATE_MIN_BUILDS ? chainStepEstimates(list) : allSteps
  }
  return byTemplate
}

/**
 * What each chain step usually takes (#537): per step id, the median minutes and the median USD that step took in the
 * builds given (each build's own `timings.chain.steps`). A step none of them recorded is left out. Pure.
 * @param {Array<{ steps: Array<{ step?: unknown, minutes?: unknown, usd?: unknown }> }>} builds
 * @returns {Record<string, { minutes: number, usd: number }>}
 */
export function chainStepEstimates(builds) {
  /** @type {Record<string, { minutes: number, usd: number }>} */
  const out = {}
  for (const id of CHAIN_IDS) {
    const seen = builds.flatMap((b) => b.steps.filter((s) => String(s?.step) === id))
    if (seen.length === 0) continue
    out[id] = {
      minutes: Math.round(medianOf(seen.map((s) => finiteOrZero(s.minutes))) * 10) / 10,
      usd: Math.round(medianOf(seen.map((s) => finiteOrZero(s.usd))) * 100) / 100
    }
  }
  return out
}

/**
 * The progress of one chain build as the doors give it (#516): every chain step in order with its English label,
 * its minutes once done, and whether it is done, under way (`current`, several at once when steps run side by side) or `upcoming`; the furthest
 * step reached; the start; minutes so far (counted to now while the run goes, the run's own total once it ended); the
 * USD the finished steps spent; and the estimate (`chainEstimates`).
 *
 * Per step (#537), new fields only:
 * - `usd`: what the step spent. A step reports its spend when it ends (`step-chain.js`), so a done step carries its own
 *   recorded USD and the run's `usd` is their sum; a step under way or not started carries null (its spend is not
 *   counted until it ends, so no figure is shown for it rather than a made up one).
 * - `minutes` of a step under way: counted from its own start (`timings.chain.runningSince`) to now; null when the
 *   snapshot has no start for it (a run started before the start was recorded).
 * - `estimate`: what a step not started usually takes, `{minutes, usd}` from the same complete builds the run's estimate
 *   reads, per step (`chainEstimates(...).steps`); null when none was measured, and absent on a done or running step.
 * @param {{ chain?: any, open: boolean, startedAt: Date | string, now: number,
 *   estimate: { minutes: number, usd: number } | null,
 *   stepEstimates?: Record<string, { minutes: number, usd: number }> | null }} args
 */
export function chainRunView({ chain, open, startedAt, now, estimate, stepEstimates = null }) {
  const recorded = Array.isArray(chain?.steps) ? chain.steps : []
  const done = new Map(
    recorded.map((s) => [String(s?.step), { minutes: finiteOrZero(s?.minutes), usd: finiteOrZero(s?.usd) }])
  )
  const underway = new Set(open && Array.isArray(chain?.running) ? chain.running.map(String) : [])
  const since =
    open && chain?.runningSince && typeof chain.runningSince === 'object' ? chain.runningSince : {}
  const startMs = new Date(startedAt).getTime()
  const spent = recorded.reduce((sum, s) => sum + finiteOrZero(s?.usd), 0)
  const runningMinutes = (id) => {
    const ms = Date.parse(String(since[id] ?? ''))
    return Number.isFinite(ms) ? Math.max(0, Math.round(((now - ms) / 60_000) * 10) / 10) : null
  }
  return {
    steps: CHAIN_STEPS.map(({ id, label }) => {
      const record = done.get(id)
      if (record) return { id, label, state: 'done', minutes: record.minutes, usd: record.usd }
      if (underway.has(id)) return { id, label, state: 'current', minutes: runningMinutes(id), usd: null }
      return { id, label, state: 'upcoming', minutes: null, usd: null, estimate: stepEstimates?.[id] ?? null }
    }),
    current: chainStepOf(chain),
    startedAt: new Date(startMs).toISOString(),
    minutes:
      open || !Number.isFinite(Number(chain?.totalMinutes))
        ? Math.max(0, Math.round(((now - startMs) / 60_000) * 10) / 10)
        : finiteOrZero(chain.totalMinutes),
    usd: Math.round(spent * 10_000) / 10_000,
    estimate
  }
}
