/**
 * The verdict on one measured content coverage file (`content-coverage.json`, written by
 * `packages/cms/tracy-quickstart-tools/content-coverage`), against the threshold in `policy.json`.
 * PURE: the file and the policy in, the verdict out. The audit command prints the same verdict, so
 * the person who measures sees what /ops will say before they commit.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const COVERAGE_SCHEMA = 'tracy-content-coverage/v1'

/** The policy this server judges with. */
export const COVERAGE_POLICY = Object.freeze(
  JSON.parse(readFileSync(fileURLToPath(new URL('./policy.json', import.meta.url)), 'utf8'))
)

/** `1.2.3` → [1, 2, 3]; anything else → null. */
const semver = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
const below = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Whether a coverage file is one this server can judge, or why not (a sentence).
 * @param {any} doc
 * @param {any} [policy]
 * @returns {string | null}
 */
export function coverageFileProblem(doc, policy = COVERAGE_POLICY) {
  if (!doc || typeof doc !== 'object') return 'the file is not a JSON object'
  if (doc.schemaVersion !== COVERAGE_SCHEMA) return `schemaVersion is not ${COVERAGE_SCHEMA}`
  if (!Array.isArray(doc.holes)) return 'it has no holes list'
  if (!doc.counts || typeof doc.counts !== 'object') return 'it has no counts'
  if (!Array.isArray(doc.hygiene)) return 'it has no page hygiene list (measured before 1.1.0)'
  const have = semver(doc.tool?.version)
  const need = semver(policy.minToolVersion)
  if (!have) return 'it names no tool version'
  if (need && below(have, need) < 0)
    return `it was measured with audit ${doc.tool.version}; ${policy.minToolVersion} or later is needed`
  return null
}

/**
 * Whether one hole holds Publish under the policy.
 * @param {any} hole
 * @param {any} [policy]
 */
export function holeBlocks(hole, policy = COVERAGE_POLICY) {
  if (!policy.blockingClasses.includes(hole?.class)) return false
  if (hole.class === 'capture' && hole.lock === 'locked' && policy.lockedCaptureIsHole !== true) return false
  const reason = typeof hole.accepted === 'string' ? hole.accepted.trim() : ''
  return reason.length < Number(policy.minAcceptedReasonLength ?? 1)
}

/**
 * Whether one page hygiene finding (a raw language constant, PHP error text, an unfilled
 * placeholder) holds Publish under the policy: the same accepted reason as a hole lifts it.
 * @param {any} finding
 * @param {any} [policy]
 */
export function hygieneBlocks(finding, policy = COVERAGE_POLICY) {
  if (!(policy.blockingHygieneKinds ?? []).includes(finding?.kind)) return false
  const reason = typeof finding.accepted === 'string' ? finding.accepted.trim() : ''
  return reason.length < Number(policy.minAcceptedReasonLength ?? 1)
}

/**
 * @param {any} doc a coverage file `coverageFileProblem` accepts
 * @param {any} [policy]
 * @returns {{ holds: boolean, blocking: any[], accepted: number, byClass: Record<string, number>, lockedContent: number, incomplete: string | null, coverage: Record<string, number>, hygiene: any[], hygieneByKind: Record<string, number>, hygieneAccepted: number }}
 */
export function judgeCoverage(doc, policy = COVERAGE_POLICY) {
  const blocking = doc.holes.filter((h) => holeBlocks(h, policy))
  const accepted = doc.holes.filter(
    (h) => policy.blockingClasses.includes(h.class) && !holeBlocks(h, policy)
  ).length
  /** @type {Record<string, number>} */
  const byClass = {}
  for (const h of blocking) byClass[h.class] = (byClass[h.class] ?? 0) + 1
  const found = Array.isArray(doc.hygiene) ? doc.hygiene : []
  const hygiene = found.filter((h) => hygieneBlocks(h, policy))
  const hygieneAccepted = found.filter(
    (h) => (policy.blockingHygieneKinds ?? []).includes(h?.kind) && !hygieneBlocks(h, policy)
  ).length
  /** @type {Record<string, number>} */
  const hygieneByKind = {}
  for (const h of hygiene) hygieneByKind[h.kind] = (hygieneByKind[h.kind] ?? 0) + 1
  const lockedContent = blocking.filter((h) => h.class === 'capture' && h.lock === 'locked').length
  const failed = Number(doc.pages?.failed ?? 0)
  const incomplete =
    failed > Number(policy.maxFailedPages ?? 0)
      ? `${failed} page${failed === 1 ? '' : 's'} did not render`
      : policy.capReachedHolds && doc.pages?.capReached === true
        ? 'the page cap cut the crawl'
        : null
  return {
    holds:
      blocking.length > Number(policy.maxUnacceptedHoles ?? 0) ||
      hygiene.length > Number(policy.maxUnacceptedHygiene ?? 0) ||
      incomplete !== null,
    blocking,
    accepted,
    byClass,
    lockedContent,
    incomplete,
    coverage: doc.coverage ?? {},
    hygiene,
    hygieneByKind,
    hygieneAccepted
  }
}

/**
 * The verdict on the slot roles group (ADR 0038), apart from holes and page hygiene: the roles of a release not shown on
 * Design inspiration hold Publish (when the policy says so); one already shown only warns. A group that passes neither.
 * @param {import('./roles.js').Roles} roles
 * @param {{ live: boolean }} about
 * @param {any} [policy]
 * @returns {{ holds: boolean, warns: boolean }}
 */
export function judgeRoles(roles, { live }, policy = COVERAGE_POLICY) {
  if (roles.state === 'ready') return { holds: false, warns: false }
  const holds = !live && policy.rolesHoldNewRelease !== false
  return { holds, warns: !holds }
}

/**
 * The verdict on the Slot fit group (ADR 0039 decision 7), the same rule as roles: a release not shown on Design
 * inspiration whose content map lacks Slot fit is held from Publish (when the policy says so); one already shown only
 * warns. A platform the fit audit does not measure yet (`policy.fitPlatforms`) is not judged at all.
 * @param {import('./fit.js').Fit | { state: 'not-applicable' }} fit
 * @param {{ live: boolean }} about
 * @param {any} [policy]
 * @returns {{ holds: boolean, warns: boolean }}
 */
export function judgeFit(fit, { live }, policy = COVERAGE_POLICY) {
  if (fit.state === 'ready' || fit.state === 'not-applicable') return { holds: false, warns: false }
  const holds = !live && policy.fitHoldNewRelease !== false
  return { holds, warns: !holds }
}

/**
 * The verdict on the label rules group (ADR 0040, spec #37), read from the `labelRules` block the audit committed in
 * `content-coverage.json`; this never measures anything. R2 to R9 hold a release not shown on Design inspiration when
 * one fails (`policy.labelRules.blocking`), a release already shown only warns. R1 is a number and never holds. A map
 * whose role vocabulary is not in `policy.labelRules.blockingVocabularies` (version 2) is `reported`: its failing rules
 * are listed and nothing holds. A file measured before the rules existed has none (`none`).
 *
 *   none      the file has no `labelRules` block (an audit before 1.2.0): not judged
 *   reported  failing rules are listed, the map's vocabulary is not judged yet: never holds
 *   ready     the map is judged and no blocking rule fails
 *   failing   at least one blocking rule fails
 * @param {any} doc a coverage file `coverageFileProblem` accepts
 * @param {{ live: boolean }} about
 * @param {any} [policy]
 * @returns {{ state: 'none' | 'reported' | 'ready' | 'failing', holds: boolean, warns: boolean, failing: Array<{rule: string, title: string, count: number, keys: string[]}>, factShare: number | null }}
 */
export function judgeLabelRules(doc, { live }, policy = COVERAGE_POLICY) {
  const block = doc?.labelRules
  if (!block || typeof block !== 'object' || typeof block.rules !== 'object' || block.rules === null)
    return { state: 'none', holds: false, warns: false, failing: [], factShare: null }
  const failing = Object.entries(block.rules)
    .filter(([, r]) => Number(r?.count) > 0)
    .map(([rule, r]) => ({
      rule,
      title: String(r.title ?? rule),
      count: Number(r.count),
      keys: Array.isArray(r.keys) ? r.keys.map(String) : []
    }))
  const factShare = Number.isFinite(block.r1?.percent) ? block.r1.percent : null
  const settings = policy.labelRules ?? {}
  if (!(settings.blockingVocabularies ?? []).includes(block.roleVocabularyVersion))
    return { state: 'reported', holds: false, warns: false, failing, factShare }
  const blocking = failing.filter((f) => (settings.blocking ?? []).includes(f.rule))
  if (blocking.length === 0) return { state: 'ready', holds: false, warns: false, failing, factShare }
  const holds = !live && policy.labelRulesHoldNewRelease !== false
  return { state: 'failing', holds, warns: !holds, failing, factShare }
}
