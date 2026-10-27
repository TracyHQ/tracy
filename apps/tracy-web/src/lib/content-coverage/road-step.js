/**
 * The Road to live step "Content coverage": does the content contract of this release declare every
 * piece of demo text, every image and every link a visitor sees? Measured on a site built from the
 * quickstart with the content coverage audit (quickstart-contract skill, step 7), committed as
 * `content-coverage.json` beside the contract, judged here with `policy.json`.
 *
 *   done      every hole and every page hygiene finding the policy counts has an accepted reason
 *             (a raw language constant, PHP error text, an unfilled placeholder), every text and image slot
 *             has a role, or the step does not apply (a platform with no content map or field map, such as Shopify);
 *   blocked   the contract is not passed yet (the audit measures it);
 *   todo      not measured, measured on another map or lock (stale), unreadable, or holes, page
 *             problems (`params.hygiene*`, their own group on the panel) or missing slot roles
 *             (`params.roles*`, the third group; ADR 0038) remain, or the content map lacks Slot fit
 *             (`params.fit*`, the fourth group; ADR 0039 decision 7);
 *   warn      the same on a release already published: it is never taken off for it, as the Design
 *             system step does for a live release (ADR 0031): a warning only.
 *
 * The roles group runs on every platform (Joomla, WordPress, EmDash). Holes and page hygiene are measured only where the
 * audit exists (`policy.platforms`: Joomla); on the others the roles group alone decides, with the same verdicts.
 * The roles group has its own verdict (`judgeRoles`): holes and page hygiene decide `coverage-holes`
 * exactly as before; when only roles are left the code is `coverage-roles` (todo) or
 * `coverage-live-roles` (warn). A contract that declares no roles at all (every template released
 * before ADR 0038) holds a release not shown yet and warns one already shown.
 *
 * The Slot fit group (ADR 0039 decision 7) follows the same rule with its own verdict (`judgeFit`), after holes and
 * roles: when only Slot fit is left the code is `coverage-fit` (todo) or `coverage-live-fit` (warn). It is judged
 * only where the audit measures Slot fit (`policy.fitPlatforms`: Joomla); elsewhere its state is `not-applicable`.
 */
import { contractFor } from '../contracts.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { COVERAGE_POLICY, judgeCoverage, judgeFit, judgeRoles } from './judge.js'
import { coverageOfContract } from './reader.js'

export const COVERAGE_STEP = 'content-coverage'

/** How many holes the step names itself; the rest are counted, and listed by the audit's report. */
const SHOWN_HOLES = 8
/** How many page problems the step names itself; the panel lists them as their own group. */
const SHOWN_HYGIENE = 8

/**
 * What the step reads for a release when the caller does not hand it in: the coverage file of the
 * contract that seals this version.
 * @param {any} release
 * @param {import('../contracts.js').ContractIndex} contracts
 */
export function coverageOfRelease(release, contracts) {
  const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
  return coverageOfContract(contractFor(contracts, release?.tag, version))
}

/**
 * The roles group as flat step params: the state, how many slots lack a role and the first keys, the reason a
 * declaration is stale or invalid, and the group's own verdict.
 * @param {import('./roles.js').Roles} roles
 * @param {{ holds: boolean, warns: boolean }} verdict
 */
const rolesParamsOf = (roles, verdict) => ({
  rolesState: roles.state,
  rolesCount: roles.state === 'missing' ? roles.count : 0,
  rolesShown: roles.state === 'missing' ? roles.shown : [],
  rolesReason: 'reason' in roles ? roles.reason : null,
  rolesHolds: verdict.holds,
  rolesWarns: verdict.warns
})

/**
 * The Slot fit group as flat step params: the state, how many text and image slots have no fit and the first keys, the
 * reason a declaration is invalid, and the group's own verdict.
 * @param {import('./fit.js').Fit | { state: 'not-applicable' }} fit
 * @param {{ holds: boolean, warns: boolean }} verdict
 */
const fitParamsOf = (fit, verdict) => ({
  fitState: fit.state,
  fitCount: 'count' in fit ? fit.count : 0,
  fitShown: 'shown' in fit ? fit.shown : [],
  fitReason: 'reason' in fit ? fit.reason : null,
  fitHolds: verdict.holds,
  fitWarns: verdict.warns
})

/** Hole groups by cause, largest first, so the panel says WHERE the gap is, not only how big. */
function causesOf(blocking) {
  /** @type {Map<string, { cause: string, class: string, count: number }>} */
  const groups = new Map()
  for (const h of blocking) {
    const key = `${h.class}|${h.cause}`
    const g = groups.get(key) ?? { cause: String(h.cause ?? ''), class: String(h.class), count: 0 }
    g.count += 1
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 6)
}

/**
 * @param {(step: string, state: any, code: string, params?: Record<string, unknown>, blockedBy?: string) => unknown} put
 * @param {(steps: string[]) => string | undefined} waitingOn
 * @param {{ release: any, version: string | null, contractId?: string | null, coverage: import('./reader.js').Coverage, roles: import('./roles.js').Roles, fit: import('./fit.js').Fit, policy?: any }} input
 *   `contractId`: the contract that seals this version (`contractStatus` `profile`), the folder the audit measures
 *   `roles`: the slot roles of that contract (`rolesOfRelease`), the third group
 *   `fit`: the Slot fit of its content map (`fitOfRelease`), the fourth group
 */
export function contentCoverageStep(
  put,
  waitingOn,
  { release, version, contractId = null, coverage, roles, fit, policy = COVERAGE_POLICY }
) {
  const slug =
    String(release.tag ?? '')
      .split('/')
      .at(-2) ?? ''
  const plain = { version, slug, platform: release.platform, contract: contractId }
  // Which platforms the step judges at all: the slot roles group runs on every platform with a content map or a field
  // map (ADR 0038); holes and page hygiene only where the audit measures (`policy.platforms`).
  const rolesPlatforms = policy.rolesPlatforms ?? policy.platforms
  if (!rolesPlatforms.includes(release.platform))
    return put(COVERAGE_STEP, 'done', 'coverage-not-needed', plain)
  const measured = policy.platforms.includes(release.platform)
  const live = shownOnInspiration(release)
  const wait = live ? undefined : waitingOn(['release', 'install-file', 'contract'])
  if (wait) return put(COVERAGE_STEP, 'blocked', 'coverage-waiting', plain, wait)
  const rolesVerdict = judgeRoles(roles, { live }, policy)
  // Slot fit is measured by the audit, so it is judged only where the audit measures it (ADR 0039).
  const fitGroup = (policy.fitPlatforms ?? []).includes(release.platform) ? fit : { state: 'not-applicable' }
  const fitVerdict = judgeFit(fitGroup, { live }, policy)
  const base = {
    ...plain,
    ...rolesParamsOf(roles, rolesVerdict),
    ...fitParamsOf(fitGroup, fitVerdict)
  }
  const failing = live ? 'warn' : 'todo'
  if (!measured) {
    // No audit for this platform: only the roles group decides, with the same verdicts as where it is measured.
    if (rolesVerdict.holds) return put(COVERAGE_STEP, 'todo', 'coverage-roles', { ...base, live, measured })
    if (rolesVerdict.warns)
      return put(COVERAGE_STEP, 'warn', 'coverage-live-roles', { ...base, live, measured })
    return put(COVERAGE_STEP, 'done', 'coverage-not-needed', { ...base, live, measured })
  }
  if (coverage.state === 'none')
    return put(COVERAGE_STEP, failing, 'coverage-not-measured', { ...base, live })
  if (coverage.state === 'invalid')
    return put(COVERAGE_STEP, failing, 'coverage-invalid', { ...base, live, reason: coverage.reason })
  if (coverage.state === 'stale')
    return put(COVERAGE_STEP, failing, 'coverage-stale', {
      ...base,
      live,
      reason: coverage.reason,
      measuredAt: coverage.doc?.measuredAt ?? null
    })
  const doc = coverage.doc
  const verdict = judgeCoverage(doc, policy)
  const params = {
    ...base,
    live,
    measuredAt: doc.measuredAt ?? null,
    toolVersion: doc.tool?.version ?? null,
    coverage: verdict.coverage,
    pages: doc.pages ?? null,
    holes: verdict.blocking.length,
    byClass: verdict.byClass,
    lockedContent: verdict.lockedContent,
    accepted: verdict.accepted,
    incomplete: verdict.incomplete,
    causes: causesOf(verdict.blocking),
    shown: verdict.blocking
      .slice(0, SHOWN_HOLES)
      .map((h) => ({ kind: h.kind, value: h.value, class: h.class, lock: h.lock ?? null, cause: h.cause })),
    hygiene: verdict.hygiene.length,
    hygieneByKind: verdict.hygieneByKind,
    hygieneAccepted: verdict.hygieneAccepted,
    hygieneShown: verdict.hygiene.slice(0, SHOWN_HYGIENE).map((h) => ({
      kind: h.kind,
      value: h.value,
      token: h.token ?? null,
      where: h.where ?? null,
      pages: Number(h.pages ?? 0),
      firstPage: h.firstPage ?? null
    }))
  }
  if (verdict.holds)
    return live
      ? put(COVERAGE_STEP, 'warn', 'coverage-live-holes', params)
      : put(COVERAGE_STEP, 'todo', 'coverage-holes', params)
  if (rolesVerdict.holds) return put(COVERAGE_STEP, 'todo', 'coverage-roles', params)
  if (fitVerdict.holds) return put(COVERAGE_STEP, 'todo', 'coverage-fit', params)
  if (rolesVerdict.warns) return put(COVERAGE_STEP, 'warn', 'coverage-live-roles', params)
  if (fitVerdict.warns) return put(COVERAGE_STEP, 'warn', 'coverage-live-fit', params)
  return put(COVERAGE_STEP, 'done', 'coverage-ready', params)
}

/**
 * The slot roles group in words, for the publish refusal: what is missing, or why the declaration cannot be used.
 * @param {Record<string, any>} p the step's params
 */
function rolesReasonText(p) {
  const count = Number(p.rolesCount ?? 0)
  const keys = Array.isArray(p.rolesShown) ? p.rolesShown : []
  if (p.rolesState === 'missing')
    return `${count} text or image slot${count === 1 ? ' has' : 's have'} no role (${keys.join(', ')}${count > keys.length ? ', ...' : ''})`
  if (p.rolesState === 'invalid')
    return `the slot roles declaration is not valid: ${String(p.rolesReason ?? 'no reason given')}`
  if (p.rolesState === 'stale')
    return `the slot roles are out of date: ${String(p.rolesReason ?? 'the contract changed')}`
  return 'the content contract declares no slot roles (every template released before ADR 0038 needs them)'
}

/**
 * The Slot fit group in words, for the publish refusal: what is missing, or why the declaration cannot be used.
 * @param {Record<string, any>} p the step's params
 */
function fitReasonText(p) {
  const count = Number(p.fitCount ?? 0)
  const keys = Array.isArray(p.fitShown) ? p.fitShown : []
  const named = keys.length > 0 ? ` (${keys.join(', ')}${count > keys.length ? ', ...' : ''})` : ''
  if (p.fitState === 'missing')
    return `Slot fit: ${count} text or image slot${count === 1 ? ' has' : 's have'} no fit${named}`
  if (p.fitState === 'invalid')
    return `Slot fit: the Slot fit declaration is not valid: ${String(p.fitReason ?? 'no reason given')}`
  return `Slot fit: the content map declares no Slot fit (every contract captured before ADR 0039 lacks it; ${count} text or image slot${count === 1 ? '' : 's'}${named})`
}

const FIT_FIX =
  ' Measure Slot fit with the content coverage audit (--fit --write) per the quickstart-contract skill, and ship it with the next contract version (a released content map never changes).'

/**
 * The publish door's refusal while Content coverage holds Publish.
 * @param {any} step the content-coverage step of the road
 */
export function contentCoverageRefusal(step) {
  const p = step?.params ?? {}
  const version = String(p.version ?? 'this version')
  const holes = Number(p.holes ?? 0)
  const problems = Number(p.hygiene ?? 0)
  const parts = [
    ...(holes > 0
      ? [
          `${holes} piece${holes === 1 ? '' : 's'} of demo content a visitor sees ${holes === 1 ? 'is' : 'are'} not declared by the content contract`
        ]
      : []),
    ...(problems > 0
      ? [
          `${problems} page problem${problems === 1 ? '' : 's'} a customer must never see (raw language constants, PHP errors, unfilled placeholders)`
        ]
      : []),
    ...(p.incomplete ? [String(p.incomplete)] : []),
    ...(p.rolesHolds ? [rolesReasonText(p)] : []),
    ...(p.fitHolds ? [fitReasonText(p)] : [])
  ]
  const rolesFix =
    ' Bind the roles in content-map.json during capture, per the quickstart-contract skill, then measure again.'
  const fitFix = p.fitHolds ? FIT_FIX : ''
  const onlyRoles = holes === 0 && problems === 0 && !p.incomplete
  const reason =
    step?.code === 'coverage-fit'
      ? `Content coverage: ${fitReasonText(p)}.${FIT_FIX}`
      : step?.code === 'coverage-roles'
        ? `Content coverage: ${[rolesReasonText(p), ...(p.fitHolds ? [fitReasonText(p)] : [])].join(', and ')}.${rolesFix}${fitFix}`
        : step?.code === 'coverage-holes' && onlyRoles
          ? `Content coverage: ${parts.join(', and ')}.${p.rolesHolds ? rolesFix : ''}${fitFix}`
          : step?.code === 'coverage-holes' && holes === 0 && problems === 0
            ? `Content coverage of ${version} is incomplete: ${String(p.incomplete ?? 'pages were not measured')}. Measure it again and commit content-coverage.json.`
            : step?.code === 'coverage-holes'
              ? `Content coverage: ${parts.join(', and ')}. Fix them (the capture rules, or the template for its own strings and page problems) or accept each with a reason in content-coverage.json, then measure again.${p.rolesHolds ? rolesFix : ''}${fitFix}`
              : step?.code === 'coverage-stale'
                ? `Content coverage of ${version} is stale: ${String(p.reason ?? 'the contract changed')}. Measure it again with the content coverage audit and commit content-coverage.json.`
                : step?.code === 'coverage-invalid'
                  ? `Content coverage of ${version} cannot be read: ${String(p.reason ?? 'no reason given')}. Measure it again and commit content-coverage.json.`
                  : `Content coverage of ${version} is not measured yet. Measure it with the content coverage audit (quickstart-contract skill, step 7) and commit content-coverage.json beside the contract.`
  return { error: 'CONTENT_COVERAGE_NOT_READY', reason }
}
