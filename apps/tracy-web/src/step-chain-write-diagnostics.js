// Structural evidence only: never persist model prompts, measured values or raw errors. Checker prose is kept for one
// thing: the final check's faults keep their reason, masked (lib/wo-bench-run-timing.js maskedReason: quoted words, long
// numbers, addresses, bearer tokens, paths and long tokens), so a build that ends with blocks says what to fix.
import { maskedReason } from './lib/wo-bench-run-timing.js'
import { KIT_GROUPS, PAGE_READ_GROUPS, ROUTE_GROUPS, SITE_CHECK_GROUPS } from './site-check/site-check.js'
import { PAGE_CHECK_GROUPS } from './site-check/page-groups.js'
import { stepName } from './lib/site-build-steps.js'
import { CHECK_GROUP_KINDS, NEVER_SENT, SENT_KINDS } from './write-step/repair-pass/repair-kinds.js'

const GROUPS = new Set(
  [...KIT_GROUPS, ...PAGE_READ_GROUPS, ...ROUTE_GROUPS, ...SITE_CHECK_GROUPS, ...PAGE_CHECK_GROUPS].map(
    (g) => g.name
  )
)
const KINDS = new Set([...Object.keys(SENT_KINDS), ...Object.keys(NEVER_SENT)])
const STATUSES = new Set([
  'done',
  'stopped',
  'failed',
  'incomplete',
  'undo-failed',
  'not-run',
  'nothing-to-send',
  'green',
  'red',
  'unmeasured',
  'not-applicable',
  'skipped'
])
const CODES = new Set([
  'STEP_NINE_CHECK_FAILED',
  'STEP_NINE_BASELINE_UNPROVEN',
  'CONTRACT_MISMATCH',
  'TOO_MANY_SLOTS',
  'BAD_FILE',
  'MISSING_FILE',
  'INSPECT_REFUSED'
])
const SKIPS = new Set([
  'not-demo',
  'unsupported-alt-target',
  'not-visible',
  'never-sent',
  'unknown-kind',
  'no-page'
])
const STAGES = new Set(['write', 'setup-checkpoint', 'first-check', 'session', 'turn', 'check'])
const NOT_SENT = new Set(['time-limit', 'too-long', 'undo-unverified', 'open-turn', 'item-cap'])
export const MAX_WRITE_DIAGNOSTICS_BYTES = 20480
/** How many faults of the final check the diagnostics keep, each with its masked reason (taken in turn by group). */
export const FINAL_FAULTS = 60
const list = (v) => (Array.isArray(v) ? v : [])
const known = (v, allowed) => (allowed.has(v) ? v : 'unknown')
const number = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(v, Number.MAX_SAFE_INTEGER) : null)
const counts = (v) =>
  Object.fromEntries(
    ['block', 'warn', 'unmeasured', 'notApplicable', 'written', 'skipped']
      .filter((k) => number(v?.[k]) !== null)
      .map((k) => [k, number(v[k])])
  )

// Site paths have no origin, credentials, query or fragment. Local filesystem paths are never site evidence.
const page = (v) =>
  typeof v === 'string' &&
  v.length <= 160 &&
  /^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*\/?)?$/.test(v) &&
  !/^\/(?:Users|home|private|tmp|var|etc|proc|root)(?:\/|$)/i.test(v) &&
  !v.split('/').includes('..')
    ? v
    : null
// A slot is a content map key (`module-106.2`) or a kit id (`block-106.2`, `body-classes_group-boxing.link-4`,
// `menuItem-189.0`): before (dev lat28, 22/11/2026) only content map keys were kept, so most faults of the final check named
// no slot and could not be traced to one.
const slot = (v) =>
  typeof v === 'string' &&
  (/^(?:module|article|contact|menu|menuItem|category|component|custom|site|image|tag|user)-\d+(?:-[a-zA-Z0-9_-]+)?(?:[.:][a-zA-Z0-9_-]+)*$/.test(
    v
  ) ||
    /^(?:block|body)-[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*(?:[.:][a-zA-Z0-9_-]+)*$/.test(v)) &&
  v.length <= 100
    ? v
    : null
const fault = (v, { withReason = false } = {}) => ({
  type: known(v?.kind ?? CHECK_GROUP_KINDS[v?.group], KINDS),
  group: known(v?.group, GROUPS),
  page: page(v?.page),
  slot: slot(v?.slot),
  level: ['block', 'warn'].includes(v?.level) ? v.level : null,
  ...(withReason && typeof v?.reason === 'string' && v.reason ? { reason: maskedReason(v.reason) } : {})
})

/**
 * Why a group could not tell, as a fixed code (never its text): the site check's unmeasured reasons
 * (site-check/*.js GroupUnmeasured, site-check.js statusOf and measure), sorted by what they say. Dev lat20 and lat21
 * (20/11/2026): Arabian Tea House's page checks were all unmeasured and the diagnostics could not say why.
 */
const UNMEASURED = [
  ['no-host', /^No host was given/],
  ['no-pages', /lists no page/],
  ['host-no-verdicts', /^The host gave no verdicts/],
  ['host-no-verdict', /^The host gave no verdict for /],
  ['host-skipped', /^The host could not judge /],
  ['host-no-reading', /^The host answered no /],
  ['read-refused', /was refused[ :(]|only reads;/],
  ['missing-input', /^No (kit|page reader|pictures|manifest|copy|plan)\b|was given, so/],
  ['nothing-checked', /^Nothing was measured \(0 checked\)/],
  ['timeout', /tim(ed|e) ?out|deadline|aborted/i]
]
export function unmeasuredCode(reason) {
  if (typeof reason !== 'string' || !reason) return null
  return UNMEASURED.find(([, test]) => test.test(reason))?.[0] ?? 'other'
}
/**
 * What a read the site check sent was refused with (site-check.js readsOnly): the action, its operation and the
 * plugin's code, never the message. Dev s2a and t1b (21–22/11/2026): every page group of Arabian Tea House's final check
 * was unmeasured as `read-refused` within a second of starting, and nothing said which read or why.
 * @returns {{ action: string, operation: string | null, code: string } | null}
 */
export function refusalOf(reason) {
  const m =
    /^([a-z][a-z0-9_.]{0,63}) ([a-z][a-z0-9_]{0,31})? ?was refused \(([A-Za-z][A-Za-z0-9_.-]{1,63})\)/.exec(
      String(reason ?? '')
    )
  return m ? { action: m[1], operation: m[2] ?? null, code: m[3] } : null
}

/** A code-like word the host gave with "no verdicts" (an error code such as HOST_TIMEOUT), never prose. */
export function hostCodeOf(reason) {
  const m = /^The host gave no verdicts: ([A-Z][A-Z0-9_]{2,40})$/.exec(String(reason ?? ''))
  return m ? m[1] : null
}

/**
 * How many failures of each group each build step causes (site-build-steps.js names: template, brand, planner, copy,
 * pictures, write), counted over every failure, not only the faults kept: which step to fix for a group, by number.
 */
export function causesOf(groups) {
  const out = {}
  for (const g of list(groups)) {
    const failures = list(g?.failures)
    if (!failures.length || !GROUPS.has(g.name)) continue
    const tally = {}
    for (const f of failures) {
      const step = stepName(f?.causingStep ?? g.causingStep)
      tally[step] = (tally[step] ?? 0) + 1
    }
    out[g.name] = tally
  }
  return out
}

/** How many failures of each kind each group found, by the fixed kind codes the groups give (never their words). */
export function kindsOf(groups) {
  const out = {}
  for (const g of list(groups)) {
    if (!GROUPS.has(g?.name)) continue
    const tally = {}
    for (const f of list(g.failures))
      if (typeof f?.kind === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(f.kind))
        tally[f.kind] = (tally[f.kind] ?? 0) + 1
    if (Object.keys(tally).length) out[g.name] = tally
  }
  return out
}

/**
 * The failures kept as faults, taken in turn from every group (its first, then every group's second, ...), so a group
 * listed late is seen as well as one listed first. Before (dev lat23, 21/11/2026) the faults kept were the first in
 * group order, almost all one group's (unaddressable items), and none showed where the read-back or alt blocks were.
 */
export function sampleFaults(groups) {
  const lists = list(groups).map((g) => list(g?.failures).map((f) => ({ ...f, group: g.name })))
  const out = []
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/** A bounded staff-only summary retained after temporary step files have been removed. */
export function stepNineDiagnostics(step) {
  let truncated = false
  const take = (items, max) => {
    const rows = list(items)
    if (rows.length > max) truncated = true
    return rows.slice(0, max)
  }
  const check = (value, final = false) =>
    value
      ? {
          status: known(value.status, STATUSES),
          counts: counts(value.counts),
          groupCount: list(value.groups).length,
          causes: causesOf(value.groups),
          kinds: kindsOf(value.groups),
          groups: take(value.groups, 40).map((g) => ({
            name: known(g.name, GROUPS),
            status: known(g.status, STATUSES),
            checked: number(g.checked),
            failureCount: list(g.failures).length,
            ms: number(g.ms),
            ...(g.status === 'unmeasured' && unmeasuredCode(g.reason)
              ? { why: unmeasuredCode(g.reason) }
              : {}),
            ...(g.status === 'unmeasured' && hostCodeOf(g.reason) ? { hostCode: hostCodeOf(g.reason) } : {}),
            ...(g.status === 'unmeasured' && refusalOf(g.reason) ? { refused: refusalOf(g.reason) } : {})
          })),
          // The final check's faults also keep why each failed, masked (maskedReason): without it, dev builds that ended
          // with 46 to 82 blocks (21–22/11/2026) said which groups failed, not what to fix.
          faults: final
            ? take(sampleFaults(value.groups), FINAL_FAULTS).map((f) => fault(f, { withReason: true }))
            : take(sampleFaults(value.groups), 24).map((f) => fault(f))
        }
      : null
  const repair = step?.repair
  const result = {
    version: 1,
    write: {
      status: known(step?.report?.status, STATUSES),
      writeStatus: step?.report?.writeStatus == null ? null : known(step.report.writeStatus, STATUSES),
      causeCode: step?.report?.cause == null ? null : known(step.report.cause.code, CODES),
      counts: counts(step?.report?.counts)
    },
    writersSettled: typeof step?.writersSettled === 'boolean' ? step.writersSettled : null,
    firstCheck: check(step?.firstCheck),
    finalCheck: check(step?.siteCheck, true),
    repair: repair
      ? {
          status: known(repair.status, STATUSES),
          ms: number(repair.ms),
          turnCount: list(repair.turns).length,
          sessionCount: list(repair.sessions).length,
          skippedCount: list(repair.skipped).length,
          remainingCount: list(repair.remaining).length,
          errorCount: list(repair.errors).length,
          checks: number(repair.checks),
          undoneCount: list(repair.undone).length,
          notSentCount: list(repair.notSent).length,
          skipped: take(repair.skipped, 16).map((s) => ({ ...fault(s), code: known(s.code, SKIPS) })),
          notSent: take(repair.notSent, 16).map((s) => ({
            page: page(s.page),
            code: known(s.reason, NOT_SENT),
            faults: number(s.faults)
          })),
          timeline: take(repair.timeline, 24).map((t) => ({
            stage: known(t.stage, STAGES),
            startMs: number(t.startMs),
            endMs: number(t.endMs)
          }))
        }
      : null,
    truncated
  }
  const arrays = [
    result.firstCheck?.faults,
    result.finalCheck?.faults,
    result.repair?.skipped,
    result.repair?.notSent,
    result.repair?.timeline,
    result.firstCheck?.groups,
    result.finalCheck?.groups
  ].filter(Boolean)
  while (Buffer.byteLength(JSON.stringify(result)) > MAX_WRITE_DIAGNOSTICS_BYTES) {
    const largest = arrays.filter((a) => a.length).sort((a, b) => b.length - a.length)[0]
    if (!largest) break
    largest.pop()
    result.truncated = true
  }
  return result
}
