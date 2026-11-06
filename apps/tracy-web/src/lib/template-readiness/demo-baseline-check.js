/**
 * The demo baseline piece of the template readiness verdict (ticket #433, piece and step `demo-baseline`): the
 * `demo-baseline.json` committed beside the contract that seals the release, measured once per quickstart version on the
 * untouched site (PR #428, `template-kit/demo-baseline-file.js`). The site check and the write step bench judge a written
 * site against it, so a version without one cannot tell demo words from the customer's.
 *
 *   blocked demo-baseline-waiting   no contract seals the release yet (the contract piece says what to do)
 *   todo    demo-baseline-missing   { contract, version }: no file beside the contract
 *   todo    demo-baseline-invalid   { contract, version, reason }: unreadable, or not measured on the untouched site
 *   todo    demo-baseline-stale     { contract, version, reason }: it measured another quickstart version
 *   done    demo-baseline-recorded  { contract }
 *
 * The fix of every red code is the two step 0 commands: measure on a fresh untouched quickstart site, then record the
 * file beside the contract (`fixes.js`). This piece asks every Joomla release; which templates Road to live holds from
 * Publish for it is still `demo-baseline-policy.json` (the Template kit step's `kit-demo-baseline-missing`). A release
 * already shown on Design inspiration only warns, as the other checks (spec #429: a published template is never
 * taken off for a new check). The file is read by `baselineOfContract`, the same reader the site check uses.
 */
import { contractFor } from '../contracts.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { baselineOfContract } from '../template-kit/demo-baseline-file.js'

export const DEMO_BASELINE_STEP = 'demo-baseline'

/** @param {any} release @param {any} world */
export function judgeDemoBaseline(release, world) {
  const platform = release?.setting?.platform ?? release?.platform
  if (platform !== 'joomla') return null
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  const contract = contractFor(world?.contracts ?? new Map(), release?.tag, version)
  if (!contract) return { state: 'blocked', code: 'demo-baseline-waiting', params: {}, blockedBy: 'contract' }
  const read = world?.demoBaseline ?? baselineOfContract(contract)
  if (read.state === 'read')
    return { state: 'done', code: 'demo-baseline-recorded', params: { contract: contract.id } }
  // What a red answer is: a hold on a new release, only a warning on one already shown on Design inspiration.
  const state = shownOnInspiration(release) ? 'warn' : 'todo'
  const params = { contract: contract.id, version: version ?? null }
  if (read.state === 'none') return { state, code: 'demo-baseline-missing', params }
  if (read.state === 'stale')
    return { state, code: 'demo-baseline-stale', params: { ...params, reason: read.reason } }
  return { state, code: 'demo-baseline-invalid', params: { ...params, reason: read.reason } }
}

/** The check, as the verdict's `CHECKS` lists one. */
export const DEMO_BASELINE_CHECK = Object.freeze({
  piece: 'demo-baseline',
  step: DEMO_BASELINE_STEP,
  judge: judgeDemoBaseline
})
