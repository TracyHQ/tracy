// The record of a brand run before the site exists (ticket #616, `brand-before-site.js`): its spend and the chain its
// `dispose` keeps, in the engine's shape. Pure.
import { chainSummary } from './sites/brief-engines/step-chain-record.js'

/** The spend of the record: unknown (`null`, with the known part) when any line's spend is unknown. */
export function spendOfRecord(record) {
  const known = record.reduce((sum, l) => sum + (Number.isFinite(l.usd) ? l.usd : Number(l.knownUsd ?? 0)), 0)
  return record.every((l) => Number.isFinite(l.usd)) ? { usd: known } : { usd: null, knownUsd: known }
}

/**
 * The chain `dispose` keeps, in the engine's shape (`chainSummary`: `ending`, `stop`, `failedStep`, `totalUsd`,
 * `totalMinutes`, `steps`), which every reader of a kept chain reads. A brand run has no Write step by design, so a run
 * without a stop is complete, never the engine's unfinished build.
 */
export function chainOf(run, stop) {
  const summary = chainSummary(run.record, stop?.step ?? null, run.now() - run.t0, null, null, stop ?? null)
  if (stop) return summary
  const { failedStep: _failed, stop: _stop, ...complete } = summary
  return { ...complete, ending: 'complete' }
}
