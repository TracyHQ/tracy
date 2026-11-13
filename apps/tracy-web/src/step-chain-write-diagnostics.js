// Structural evidence of a chain's Write step only: never persist checker prose, model prompts, measured values or raw
// errors. A build has no site check and no repair pass (ADR 0047, decisions 1 and 3), so the summary keeps the write's
// own status, cause code and counts, and nothing about checks or repairs.
const STATUSES = new Set(['done', 'stopped', 'failed', 'incomplete', 'not-run', 'skipped'])
// The cause codes the write step and its site recovery guard raise; any other code is kept as `unknown`.
const CODES = new Set([
  'STEP_NINE_BASELINE_UNPROVEN',
  'BAD_ACCENT',
  'BAD_FILE',
  'BRAND_WRITE_FAILED',
  'CONTRACT_MISMATCH',
  'INSPECT_REFUSED',
  'LAST_REPORT_OTHER_SITE',
  'MISSING_FILE',
  'NEEDS_NEW_SITE',
  'NO_TEMPLATE_CARD',
  'PICTURE_WRITE_FAILED',
  'RECOVERY_POINT_CHANGED',
  'REFUSED',
  'RESTORE_DOOR_UNAVAILABLE',
  'RESTORE_PENDING',
  'ROUTE_RESTORE_FAILED',
  'SITE_RECOVERY_POINT_PENDING',
  'TEMPLATE_CSS_UNREADABLE',
  'TOO_MANY_SLOTS',
  'WRITER_BUSY'
])
export const MAX_WRITE_DIAGNOSTICS_BYTES = 8192
const known = (v, allowed) => (allowed.has(v) ? v : 'unknown')
const number = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(v, Number.MAX_SAFE_INTEGER) : null)
const counts = (v) =>
  Object.fromEntries(
    ['written', 'hidden', 'skipped', 'failed', 'refused', 'unchanged']
      .filter((k) => number(v?.[k]) !== null)
      .map((k) => [k, number(v[k])])
  )

/** A bounded staff-only summary of a Write step, retained on its record line. */
export function stepNineDiagnostics(step) {
  return {
    version: 2,
    write: {
      status: known(step?.report?.status, STATUSES),
      writeStatus: step?.report?.writeStatus == null ? null : known(step.report.writeStatus, STATUSES),
      causeCode: step?.report?.cause == null ? null : known(step.report.cause.code, CODES),
      counts: counts(step?.report?.counts)
    },
    writersSettled: typeof step?.writersSettled === 'boolean' ? step.writersSettled : null
  }
}
