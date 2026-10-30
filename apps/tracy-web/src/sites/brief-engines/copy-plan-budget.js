/**
 * How long the copy plan of a brief build may take, sized by its work (spec TracyHQ/tracy#189, copy-plan stage).
 *
 * 🔒 THE WORDS GET THE TIME THEIR CALLS NEED, NOT A FIXED GRACE. A fixed 90 s after the site came up cut two builds in a row
 * (R11b, R12: 8 of 22 and 10 of 19 calls failed at the cut, `wordsAfterUpMs` 90113 and 90158), whatever the contract's size.
 * The budget is a base plus the waves of calls the plan sends (its batches over the calls in flight) and one wave for the
 * concurrent second round (the send-backs and the split retries of a lost batch), each wave as long as the measured p95 of
 * one call, under a hard ceiling. Before any call is measured the last run's p95 stands in, else a default.
 * Pure: no clock, no model; `planConcurrently` (`shared.js`) and the brief build (`brief-build.js`) read it.
 */

export const COPY_BUDGET = Object.freeze({
  /** What the plan costs besides its model calls: the planner's own runs, the translations of button labels. */
  baseMs: 15_000,
  /** One call's p95 before any call of this process was measured. */
  perCallMs: 45_000,
  /** Calls sent to the model at once. */
  inFlight: 12,
  /** The concurrent rounds after the first (send-backs, split retries of a lost batch). */
  laterRounds: 1,
  /** Never more than this for the words, however large the contract. */
  ceilingMs: 6 * 60_000
})

/**
 * The p95 of measured call durations, or null when none was measured.
 * @param {number[]} ms
 */
export function p95Of(ms) {
  const sorted = (ms ?? []).filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

/**
 * The budget of a plan of `calls` model calls, in ms from its start.
 * @param {{calls: number, p95Ms?: number | null, budget?: Partial<typeof COPY_BUDGET>}} input
 */
export function copyBudgetMs({ calls, p95Ms = null, budget = {} }) {
  const b = { ...COPY_BUDGET, ...budget }
  const perCall =
    Number.isFinite(p95Ms) && /** @type {number} */ (p95Ms) > 0 ? /** @type {number} */ (p95Ms) : b.perCallMs
  const waves = Math.ceil(Math.max(0, calls) / Math.max(1, b.inFlight)) + b.laterRounds
  return Math.min(b.ceilingMs, b.baseMs + waves * perCall)
}
