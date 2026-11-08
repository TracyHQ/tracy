/**
 * The Customize your site check, split in two pieces of the readiness verdict:
 *
 *   cowork-pin   the rules that read the Claude Cowork plugin a new site gets (`PLUGIN_RULES`): STAB-1 judges, from
 *                the plugin's own bytes, whether the pinned plugin carries the content contract the release names
 *                (`readers/cowork-plugin-contracts.js`). STAB-1 also judges that the profile row, the contract and the
 *                release fit each other: those are the same one-build question, so they ride on this piece too;
 *   customize    every other rule of the check (the seven questions a customer answers).
 *
 * Each half is judged by the very Road to live step function (`customizeStep`) over the stored check with only its
 * own rules, so both carry Road to live codes (`customize-ready`, `customize-must-fix`, `customize-unchecked`, ...)
 * and never a parallel set. Road to live itself keeps one Customize your site step over every rule.
 */
import { customizeStep } from './check-steps.js'

/** The Customize your site rules that read the pinned Claude Cowork plugin. */
export const PLUGIN_RULES = Object.freeze(['STAB-1'])

/** The stored check with only the results `keep` says yes to (the check itself when nothing is stored yet). */
function narrowed(readiness, keep) {
  const results = readiness?.report?.results
  if (!Array.isArray(results)) return readiness
  return { ...readiness, report: { ...readiness.report, results: results.filter((r) => keep(r.id)) } }
}

/**
 * The two halves of Customize your site for `release`, each a step entry `{ step: 'customize', state, code, params,
 * blockedBy? }` judged with the road's own `waitingOn`.
 * @param {{ release: any, version: string | null, readiness: any }} input
 * @param {(steps: string[]) => string | undefined} waitingOn
 */
export function customizeHalves({ release, version, readiness }, waitingOn) {
  /** @param {(id: string) => boolean} keep */
  const half = (keep) => {
    let entry = null
    const put = (step, state, code, params = {}, blockedBy = undefined) => {
      entry = /** @type {any} */ ({ step, state, code, params })
      if (blockedBy) entry.blockedBy = blockedBy
      return entry
    }
    customizeStep(put, waitingOn, { release, version, readiness: narrowed(readiness, keep) })
    return /** @type {any} */ (entry)
  }
  return {
    plugin: half((id) => PLUGIN_RULES.includes(id)),
    rest: half((id) => !PLUGIN_RULES.includes(id))
  }
}
