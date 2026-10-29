/**
 * Brief readiness after the build (#50, spec #38): what the live site shows of the brief, read off one QA round of the
 * host (`apps/tracy-host/src/demo-qa.js`). Pure: the caller keeps it on the round.
 *
 * Two checks are the site's own: "no template sample text left" (the host's `no-demo-words`) and "collected items
 * shown" (`collected-used`). The brief's own checks (photos, labels, sources, hero, offerings, people, routes) are
 * carried with the verdict they had on the brief: measuring them again on the live site needs to know which collected
 * item fills which slot, which is the placement work's (spec #38, Out of Scope), so they say `on: 'brief'`.
 *
 * 🔒 UNKNOWN IS NEVER PASSED. A host check that did not run or could not judge is `unknown`, and a round with an
 * unknown site check is never `pass`.
 */

/** Each live check and the host check it is read from. */
export const LIVE_CHECKS = Object.freeze({
  'no-template-sample-text': 'no-demo-words',
  'collected-items-shown': 'collected-used'
})
/** How many findings of a failed check a round keeps: enough to say what is left, never a page dump. */
const DETAIL_MAX = 5

/**
 * @param {any} readiness the brief's readiness (`brief.readiness`); none for a brief made before it was measured
 * @param {{id: string, pass: boolean, skipped?: string, measured?: any, detail?: any[]}[]} checks one round's checks
 * @returns {null | {verdict: 'pass' | 'fail' | 'unknown', checks: object[], brief: {verdict: string, checks: object[]}}}
 */
export function liveReadinessOf(readiness, checks) {
  if (!readiness) return null
  const by = new Map((Array.isArray(checks) ? checks : []).map((c) => [c.id, c]))
  const live = Object.entries(LIVE_CHECKS).map(([id, hostId]) => {
    const c = by.get(hostId)
    if (!c || c.skipped)
      return { id, verdict: 'unknown', from: hostId, measured: c?.skipped ?? 'not checked' }
    return {
      id,
      verdict: c.pass ? 'pass' : 'fail',
      from: hostId,
      measured: c.measured ?? null,
      ...(c.pass ? {} : { detail: (c.detail ?? []).slice(0, DETAIL_MAX) })
    }
  })
  const verdict = live.some((c) => c.verdict === 'fail')
    ? 'fail'
    : live.some((c) => c.verdict === 'unknown')
      ? 'unknown'
      : 'pass'
  return {
    verdict,
    checks: live,
    brief: {
      verdict: readiness.verdict,
      checks: (readiness.checks ?? []).map((c) => ({ id: c.id, verdict: c.verdict, on: 'brief' }))
    }
  }
}
