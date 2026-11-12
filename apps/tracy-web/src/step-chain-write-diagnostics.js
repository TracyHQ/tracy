// Structural evidence only: never persist checker prose, model prompts, measured values or raw errors.
import { KIT_GROUPS, PAGE_READ_GROUPS, ROUTE_GROUPS, SITE_CHECK_GROUPS } from './site-check/site-check.js'
import { PAGE_CHECK_GROUPS } from './site-check/page-groups.js'
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
export const MAX_WRITE_DIAGNOSTICS_BYTES = 8192
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
  /^\/(?:[a-zA-Z0-9._~-]+\/?)*$/.test(v) &&
  !/^\/(?:Users|home|private|tmp|var|etc|proc|root)(?:\/|$)/i.test(v) &&
  !v.split('/').includes('..')
    ? v
    : null
const slot = (v) =>
  typeof v === 'string' &&
  /^(?:module|article|contact|menu|category|component|custom|site|image)-\d+(?:[.:-][a-zA-Z0-9_-]+)*$/.test(
    v
  ) &&
  v.length <= 100
    ? v
    : null
const fault = (v) => ({
  type: known(v?.kind ?? CHECK_GROUP_KINDS[v?.group], KINDS),
  group: known(v?.group, GROUPS),
  page: page(v?.page),
  slot: slot(v?.slot),
  level: ['block', 'warn'].includes(v?.level) ? v.level : null
})

/** A bounded staff-only summary retained after temporary step files have been removed. */
export function stepNineDiagnostics(step) {
  let truncated = false
  const take = (items, max) => {
    const rows = list(items)
    if (rows.length > max) truncated = true
    return rows.slice(0, max)
  }
  const check = (value) =>
    value
      ? {
          status: known(value.status, STATUSES),
          counts: counts(value.counts),
          groupCount: list(value.groups).length,
          groups: take(value.groups, 40).map((g) => ({
            name: known(g.name, GROUPS),
            status: known(g.status, STATUSES),
            checked: number(g.checked),
            failureCount: list(g.failures).length,
            ms: number(g.ms)
          })),
          faults: take(
            list(value.groups).flatMap((g) => list(g.failures).map((f) => ({ ...f, group: g.name }))),
            24
          ).map(fault)
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
    finalCheck: check(step?.siteCheck),
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
