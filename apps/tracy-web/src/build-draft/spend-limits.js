/**
 * How often the owner may start a step that spends money (#609): research (place details, a crawl, the business reading
 * and the needs profile), compose (a plan model call), the answer reading (one short model call before compose when the
 * owner typed an answer), a change request (a model call) and the brand step (the brand
 * bench and its image). Counted per account in a fixed one hour window (`lib/rate.js` `overLimitOrClosed`); a build
 * draft belongs to exactly one account, so a limit per account is a limit per draft too. A start past its limit is
 * refused with one plain sentence (`TRY_LATER_SAY`) and nothing runs.
 *
 * 🔒 ONE PLACE FOR THE NUMBERS. Every limit and every ledger ceiling of the build chat is here.
 *
 * Each step that starts is also reserved in the deployment wide research cost ledger (`wo_cost_ledger`, the ledger the
 * Website Opportunities research pays through, capped by `/ops/wo` researchDailyCapCents), at the ceiling below,
 * counted against the account as payer. The ceilings are conservative estimates, not measured bills. A step settles at
 * its real cost, marked reported, when its result knows the cost of all it spent (`engine-spend.js` `stepCostCents`):
 * the brand step, when every call of its run reported a cost, and compose and revise, when every call they made through
 * the build model door reported its usage and the price table lists the model (`model-usage.js`). The others settle at
 * their ceiling: research knows the cost of its business reading and its needs profile only, not of its place details
 * and crawl. The step chain's paid picture calls inside research (the photograph labelling and its observation,
 * `gather-vision.js`) run under the same research reservation, each counted against the operator's cap for one
 * research job (`/ops/wo` researchJobCapCents) together with the business reading, and refused past it.
 */

/** One hour, the window every limit counts in. */
export const SPEND_WINDOW_MS = 3_600_000

/** Starts allowed per account per hour, by step. */
export const SPEND_LIMITS = Object.freeze({
  research: Object.freeze({ perHour: 6 }),
  compose: Object.freeze({ perHour: 10 }),
  // The answer reading runs at most once per compose that has a typed answer, so it never needs more starts.
  answers: Object.freeze({ perHour: 10 }),
  revise: Object.freeze({ perHour: 20 }),
  brand: Object.freeze({ perHour: 4 })
})

/**
 * UNVERIFIED: what one step may cost at most, in cents, for the ledger reservation. Research: Google place details
 * (3), the editorial reading (held to its own job cap) and the needs profile call; the brand step: its bench of model
 * calls and one generated image; compose and revise: one plan sized model answer.
 */
export const STEP_CEILING_CENTS = Object.freeze({
  research: 40,
  compose: 15,
  // The answer reading (`answer-readings.js`): a few short typed answers with their questions in, a short reply out,
  // well under a tenth of the plan composer's call (the whole profile and every block in, a plan out), so a tenth of
  // compose's ceiling, rounded up to whole cents with headroom.
  answers: 2,
  revise: 10,
  brand: 30
})

/** The ledger's provider and purpose names for the build chat's steps. */
export const LEDGER_PROVIDER = 'tracy-build-chat'
export const LEDGER_PURPOSE = 'build-chat'

/** Said when a step was asked for more often than its limit, or the day's research budget is spent. */
export const TRY_LATER_SAY =
  'I have done this many times in a short while, so I paused here. Please try again later.'
