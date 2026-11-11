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
        ? partial
          ? null
          : Math.round(spent * 10_000) / 10_000
        : measuredUsd(chain.totalUsd),
      ...((unfinished ? partial : measuredUsd(chain.totalUsd) === null)
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
