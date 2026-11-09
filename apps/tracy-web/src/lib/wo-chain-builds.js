/**
 * The per-site table of /ops/wo for step chain builds (#481, spec #472): one row per site the chain built, read from the
 * measurement the run frame keeps on the site's brief row (`site_brief.timings.chain`, written by
 * `sites/brief-engines/step-chain.js` and `brief-build.js`). The numbers are the runs' own minutes and spend; nothing here
 * is estimated. Staff only: the door (`ops/wo.js`) admits internal emails and nobody else.
 */
import { CURRENT_BRIEF } from './site-brief-row.js'
import { bornSiteAddress } from './site-address.js'
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
 * The furthest chain step a measurement has started (running or recorded), or null before the first. Steps run side by
 * side (brand beside the plan, copy beside the pictures), so the furthest one is the step the build has reached.
 * @param {{ running?: unknown, steps?: unknown } | null | undefined} chain
 * @returns {string | null}
 */
export function chainStepOf(chain) {
  const started = [
    ...(Array.isArray(chain?.running) ? chain.running : []),
    ...(Array.isArray(chain?.steps) ? chain.steps.map((s) => s?.step) : [])
  ]
  const furthest = Math.max(-1, ...started.map((id) => CHAIN_IDS.indexOf(String(id))))
  return furthest < 0 ? null : CHAIN_IDS[furthest]
}

/** Whether a brief row's run is still going. @param {string | null | undefined} state */
export const chainRunOpen = (state) => OPEN_STATES.includes(String(state))

/** How many builds the table shows, newest first. */
export const CHAIN_BUILDS_LIMIT = 200

const finiteOrZero = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

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
    `select b.site_key, b.quickstart, b.state, b.created_at, b.timings -> 'chain' as chain, s.label
       from site_brief b left join site s on s.site_key = b.site_key
      where b.timings ? 'chain' and ${CURRENT_BRIEF}
      order by b.created_at desc
      limit $1`,
    [limit]
  )
  const builds = rows.map((row) => {
    const chain = row.chain ?? {}
    const steps = Array.isArray(chain.steps) ? chain.steps : []
    const spent = steps.reduce((sum, s) => sum + finiteOrZero(s.usd), 0)
    const createdMs = new Date(row.created_at).getTime()
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
    return {
      siteKey: row.site_key,
      label: row.label ?? null,
      address: row.label && config.siteDomain ? bornSiteAddress(row.label, config) : null,
      template: chainTemplateOf(row.quickstart) || null,
      startedAt: new Date(row.created_at).toISOString(),
      // A running build counts its minutes from the press until now; spend is what the finished steps cost so far.
      totalMinutes: running
        ? Math.round(((now() - createdMs) / 60_000) * 100) / 100
        : finiteOrZero(chain.totalMinutes),
      totalUsd: unfinished ? Math.round(spent * 10_000) / 10_000 : finiteOrZero(chain.totalUsd),
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
        usd: finiteOrZero(s.usd),
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
 * @param {import('pg').Pool} pool
 * @returns {Promise<(template: string) => { minutes: number, usd: number } | null>} by template (`chainTemplateOf`)
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
    usd: finiteOrZero(r.chain?.totalUsd)
  }))
  const estimate = (list) =>
    list.length === 0
      ? null
      : {
          minutes: Math.round(medianOf(list.map((b) => b.minutes)) * 10) / 10,
          usd: Math.round(medianOf(list.map((b) => b.usd)) * 100) / 100
        }
  const all = estimate(builds)
  return (template) => {
    const own = builds.filter((b) => b.template === template)
    return own.length >= ESTIMATE_MIN_BUILDS ? estimate(own) : all
  }
}

/**
 * The progress of one chain build as the doors give it (#516): every chain step in order with its English label,
 * its minutes once done, and whether it is done, under way (`current`, several at once when steps run side by side) or `upcoming`; the furthest
 * step reached; the start; minutes so far (counted to now while the run goes, the run's own total once it ended); the
 * USD the finished steps spent; and the estimate (`chainEstimates`).
 * @param {{ chain?: any, open: boolean, startedAt: Date | string, now: number,
 *   estimate: { minutes: number, usd: number } | null }} args
 */
export function chainRunView({ chain, open, startedAt, now, estimate }) {
  const recorded = Array.isArray(chain?.steps) ? chain.steps : []
  const done = new Map(recorded.map((s) => [String(s?.step), finiteOrZero(s?.minutes)]))
  const underway = new Set(open && Array.isArray(chain?.running) ? chain.running.map(String) : [])
  const startMs = new Date(startedAt).getTime()
  const spent = recorded.reduce((sum, s) => sum + finiteOrZero(s?.usd), 0)
  return {
    steps: CHAIN_STEPS.map(({ id, label }) => ({
      id,
      label,
      state: done.has(id) ? 'done' : underway.has(id) ? 'current' : 'upcoming',
      minutes: done.get(id) ?? null
    })),
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
