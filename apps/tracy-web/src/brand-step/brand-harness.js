// How every brand bench run calls the model, stored on the run (brand step trial bench, #320). It starts from the
// planner bench's harness for the same model (wire, price table, how images and reasoning travel for that provider)
// and sets the three brand settings the spec fixes: a 5-minute prompt cache window (turns are seconds apart, a 1-hour
// cache write costs more and buys nothing here), images to the agent at a 512 px long edge (the largest logo spot is
// 195 by 56), and an output budget and effort sized for a brand file, not a site plan. The cost cap is 1 USD per run,
// checked before every model call (brand-spend.js).
import { benchHarnessFor } from '../lib/bench-harness.js'

/** The most one run may spend on model calls, all three parts together, in USD. */
export const BRAND_CAP_USD = 1
/** The long edge, in pixels, of every picture the agent is shown. */
export const BRAND_IMAGE_EDGE = 512
/** A brand file and its reasoning fit well inside this; the planner's 128000 is for a whole site plan. */
export const BRAND_MAX_TOKENS = 32_000
/** Fix rounds after round 0. */
export const MAX_FIX_ROUNDS = 2

/**
 * The harness a run on this model records. `providerId` is the agent door's provider; `noCaps` (a step of a chain build,
 * #478) leaves the run without a cost cap (`capUsd: null`).
 */
export function brandHarnessFor(model, providerId, { noCaps = false } = {}) {
  const {
    writeAfterToolTurns: _planner,
    budgetUsd: _plannerBudget,
    images: _textOnly,
    ...base
  } = benchHarnessFor(model, providerId)
  return {
    ...base,
    effort: 'high',
    maxTokens: BRAND_MAX_TOKENS,
    cacheTtl: { system: '5m', rolling: '5m' },
    imageLongEdge: BRAND_IMAGE_EDGE,
    maxTurns: 80,
    capUsd: noCaps ? null : BRAND_CAP_USD,
    maxFixRounds: MAX_FIX_ROUNDS
  }
}

/** The keys of the stored harness that runAgent takes. */
export const HARNESS_KEYS = [
  'maxTokens',
  'effort',
  'cacheTtl',
  'cacheMarkers',
  'provider',
  'toolImages',
  'maxTurns',
  'callTimeoutMs',
  'idleMs',
  'retry',
  'wire',
  'price'
]

export const harnessOf = (harness) =>
  Object.fromEntries(HARNESS_KEYS.filter((k) => harness?.[k] !== undefined).map((k) => [k, harness[k]]))
