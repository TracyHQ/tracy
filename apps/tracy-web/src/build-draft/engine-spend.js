/**
 * The spend gate of the build chat's engine (#609): before a step that spends money starts, the account's hourly limit
 * for that step is counted (`spend-limits.js`), then the step is reserved in the research cost ledger at its ceiling
 * (`chargeable`, the Website Opportunities ledger seam), so the deployment's daily research cap holds for the build chat
 * too. A refusal of either answers null: the door says `TRY_LATER_SAY` and nothing runs.
 *
 * The reservation is admitted BEFORE the step is marked running, and the step runs inside it: a step that then cannot
 * start releases it (`notSent`), a step that fails leaves it to the ledger's rule (unreconciled, it may have been
 * billed), a step that ends settles it.
 */
import { overLimitOrClosed } from '../lib/rate.js'
import {
  LEDGER_PROVIDER,
  LEDGER_PURPOSE,
  SPEND_LIMITS,
  SPEND_WINDOW_MS,
  STEP_CEILING_CENTS
} from './spend-limits.js'

/**
 * Whether the account may still start `step` this hour, without counting a start: read before an irreversible write
 * that only a start justifies (compose `restart` discards the plan first).
 */
export async function spendLeft(pool, accountId, step, now) {
  const limit = SPEND_LIMITS[step]
  if (!limit) return true
  const windowStart = new Date(Math.floor(now() / SPEND_WINDOW_MS) * SPEND_WINDOW_MS)
  try {
    const { rows } = await pool.query(
      'select count from rate_bucket where bucket = $1 and window_start = $2',
      [`build-chat:${step}:${accountId}`, windowStart]
    )
    return (rows[0]?.count ?? 0) < limit.perHour
  } catch {
    return false
  }
}

/**
 * What a finished step really cost, in cents, from what its run answered (`engine.js`): `costCents` when the step knew
 * the cost of all it spent, else null (the ledger then keeps the ceiling). A cost is never made up: a part of the
 * step's spend is not its cost.
 * @param {unknown} ran
 * @returns {number | null}
 */
export function stepCostCents(ran) {
  const cost = /** @type {any} */ (ran)?.costCents
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null
}

/**
 * @param {{pool: import('pg').Pool, charge?: (spec: object, fn: Function) => Promise<any>, now: () => number}} deps
 * @returns {(accountId: string, step: string) => Promise<null | {run: (fn: () => Promise<any>) => Promise<any>,
 *   cancel: () => void}>}
 */
export function spendGate({ pool, charge, now }) {
  return async function admit(accountId, step) {
    const limit = SPEND_LIMITS[step]
    if (
      limit &&
      (await overLimitOrClosed(
        pool,
        `build-chat:${step}:${accountId}`,
        limit.perHour,
        now(),
        SPEND_WINDOW_MS
      ))
    )
      return null
    const maxCents = STEP_CEILING_CENTS[step]
    if (!charge || maxCents === undefined) return { run: (fn) => fn(), cancel: () => {} }
    let admitted
    const admission = new Promise((resolve) => (admitted = resolve))
    let go
    const started = new Promise((resolve, reject) => (go = { resolve, reject }))
    const spec = {
      provider: LEDGER_PROVIDER,
      operation: step,
      maxCents,
      purpose: LEDGER_PURPOSE,
      payer: { kind: 'account', accountId },
      // The step's whole real cost when its result knows it (`costCents`, `stepCostCents`): the row then settles at
      // that cost, marked reported. A step that does not know it settles at its ceiling, as before.
      actualCents: stepCostCents
    }
    const charged = charge(spec, async ({ notSent }) => {
      admitted(true)
      const fn = await started.catch(() => null)
      if (!fn) {
        notSent()
        return undefined
      }
      return fn()
    })
    // A reservation the caps refused never reaches the step: nothing to start.
    charged.catch(() => admitted(false))
    if (!(await admission)) return null
    return {
      run: (fn) => (go.resolve(fn), charged),
      cancel: () => go.reject(new Error('the step did not start'))
    }
  }
}
