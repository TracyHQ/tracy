// The cost of one brand run (brand step trial bench, #320): every model call is checked against the run's cap before
// it goes out, and every call a tool makes (a drawing, a reviewer question) is logged with its cost. The agent's own
// turns are checked and logged by the worker (brand-rounds.js, brand-call-store.js).
import { logCall } from './brand-call-store.js'
import { spentOf } from './brand-store.js'

export class CostCapReached extends Error {
  constructor(spent, cap) {
    super(`BRAND_COST_CAP: the run has spent $${spent.toFixed(4)} of its $${cap.toFixed(2)} cap`)
    this.code = 'BRAND_COST_CAP'
    this.spent = spent
    this.cap = cap
  }
}

/**
 * @param {{ pool: import('pg').Pool, runId: string, capUsd: number, round: () => number, leaseToken?: string | null }} input
 * @returns {{ check: () => Promise<void>, record: (call: object) => Promise<boolean> }} `check` throws CostCapReached
 *   once the run has spent its cap; `record` logs one finished call of kind 'drawing' or 'reviewer'.
 */
export function createSpend({ pool, runId, capUsd, round, leaseToken = null }) {
  return {
    async check() {
      const spent = await spentOf(pool, runId)
      if (spent >= capUsd) throw new CostCapReached(spent, capUsd)
    },
    record: (call) => logCall(pool, { runId, round: round(), leaseToken, ...call })
  }
}
