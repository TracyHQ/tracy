/**
 * The two Road to live steps decided by a stored check of the release's own version, moved here from
 * `road-to-live.js` unchanged so the template readiness verdict (`verdict.js`) and Road to live build them once:
 * Customize your site (ADR 0029) and Design system (ADR 0031).
 */
import { shownOnInspiration } from '../quickstart-releases.js'
import { summarizeReadiness } from '../template-customization-question-readiness/severity.js'
import { summarizeDsReadiness } from '../template-design-system-readiness/severity.js'

/**
 * The Customize your site step, from the stored check of this release's own version.
 *
 *   blocked   the contract is not passed yet (the check reads it);
 *   checking  the check is queued or running;
 *   todo      must-fix rules remain, the check could not run, nothing has checked this version, or
 *             a rule could not read the evidence it needs (`not-checked`: the Claude Cowork plugin a
 *             new site gets could not be read, or what it was read for changed since);
 *   warn      only worth-fixing rules remain, or a published release fails must-fix rules or has a
 *             rule not checked (it is never taken off for it, so the step only warns there);
 *   done      every rule the check could decide passes.
 * `params` always carries `passed`, `total`, `mustFix` and `worthFixing` (zero and empty before a
 * result exists), plus `version` and, once checked, `checkedAt`; `rechecking: true` while a release
 * that has a result is checked again (the state stays the last result's, so Publish is neither newly
 * held nor newly let through by a re-check).
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, readiness: any }} input the release, its version, its stored check
 */
export function customizeStep(put, waitingOn, { release, version, readiness }) {
  const own = readiness && (readiness.version ?? null) === version ? readiness : null
  const summary = own?.state === 'done' ? summarizeReadiness(own.report) : summarizeReadiness(null)
  const params = {
    ...summary,
    version,
    ...(own?.checkedAt ? { checkedAt: own.checkedAt } : {}),
    // Judged again in the background (new rules, a new profile row…): the last result below stands,
    // for the screen and for Publish, until the new one lands.
    ...(own?.recheckingSince && own.state !== 'checking' ? { rechecking: true } : {})
  }
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file', 'contract'])
  if (wait) return put('customize', 'blocked', 'customize-waiting', params, wait)
  if (!own) return put('customize', 'todo', 'customize-not-checked', params)
  if (own.state === 'checking') return put('customize', 'checking', 'customize-checking', params)
  if (own.state !== 'done')
    return put('customize', 'todo', 'customize-error', { ...params, reason: own.reason ?? null })
  if (summary.mustFix.length > 0)
    return live
      ? put('customize', 'warn', 'customize-live-failing', params)
      : put('customize', 'todo', 'customize-must-fix', params)
  // Nobody knows these pass, so a new Publish waits for them like a must-fix (25/10/2026).
  if (summary.notChecked.length > 0)
    return live
      ? put('customize', 'warn', 'customize-live-unchecked', params)
      : put('customize', 'todo', 'customize-unchecked', params)
  if (summary.worthFixing.length > 0) return put('customize', 'warn', 'customize-worth-fixing', params)
  return put('customize', 'done', 'customize-ready', params)
}

/**
 * The Design system step (ADR 0031), from the stored Template Design System Readiness check of this
 * release's own version, in the states and with the params of the Customize your site step:
 *
 *   blocked   the install file is not passed yet (the check reads the template's files);
 *   checking  the check is queued or running;
 *   todo      not measured at the current preview probe (`ds-not-at-probe`, shown alone, no grade),
 *             must-fix rules remain, the check could not run, nothing has checked this version, or
 *             (phase 2, `rule-severity.json` `unmeasured`) a built-site rule has no measurement file;
 *   warn      only worth-fixing rules remain, a built-site rule is not measured yet (phase 1), or a
 *             published release fails must-fix rules;
 *   done      every rule the check could decide passes.
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, readiness: any, severity?: import('../template-design-system-readiness/severity.js').DsSeverity, previewGap?: 'NO_DEMO' | 'NO_SLOT' | null }} input
 *   `previewGap`: why the Add site preview door would find no demo of this release, null when it has one (DEMO-1)
 */
export function designSystemStep(
  put,
  waitingOn,
  { release, version, readiness, severity, previewGap, doorHealth }
) {
  const own = readiness && (readiness.version ?? null) === version ? readiness : null
  const summary =
    own?.state === 'done'
      ? summarizeDsReadiness(own.report, severity, { previewGap, doorHealth })
      : summarizeDsReadiness(null, severity)
  const params = {
    ...summary,
    version,
    ...(own?.checkedAt ? { checkedAt: own.checkedAt } : {}),
    ...(own?.recheckingSince && own.state !== 'checking' ? { rechecking: true } : {})
  }
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file'])
  if (wait) return put('design-system', 'blocked', 'ds-waiting', params, wait)
  if (!own) return put('design-system', 'todo', 'ds-not-checked', params)
  if (own.state === 'checking') return put('design-system', 'checking', 'ds-checking', params)
  if (own.state !== 'done')
    return put('design-system', 'todo', 'ds-error', { ...params, reason: own.reason ?? null })
  // no measurement at the current preview probe: that alone, and Publish waits for it (never ds-ready)
  if (summary.notAtProbe) return put('design-system', live ? 'warn' : 'todo', 'ds-not-at-probe', params)
  if (summary.mustFix.length > 0)
    return live
      ? put('design-system', 'warn', 'ds-live-failing', params)
      : put('design-system', 'todo', 'ds-must-fix', params)
  // "Not measured yet" (spec decision 11): never a pass; it holds Publish only once the file says so
  if (summary.unmeasured.length > 0)
    return summary.unmeasuredHolds && !live
      ? put('design-system', 'todo', 'ds-not-measured', params)
      : put('design-system', 'warn', 'ds-not-measured', params)
  if (summary.worthFixing.length > 0) return put('design-system', 'warn', 'ds-worth-fixing', params)
  return put('design-system', 'done', 'ds-ready', params)
}
