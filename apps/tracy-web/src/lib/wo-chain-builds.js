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
