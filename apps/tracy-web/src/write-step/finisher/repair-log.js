// The repair log `repair-log/1` (spec #418): one record per repair and per fault left unrepaired, written as a file next to
// the run for the team (never shown to the customer). A record names the page, the block or slot, the fault kind, the step
// that caused it when known, the order, the before and after crop files, the outcome and the reason. Developers read it to
// choose which repeated faults become code rules.

export const REPAIR_LOG_VERSION = 'repair-log/1'
export const REPAIR_LOG_FILE = 'repair-log.json'

/** Every outcome a record may have. */
export const OUTCOMES = Object.freeze(['kept', 'undone', 'dropped', 'failed', 'logged-only'])

/** One record of the log. */
export function logRecord(fault, fields) {
  return {
    page: fault.page,
    viewport: fault.viewport,
    slot: fault.slot ?? null,
    faultKind: fault.kind,
    seen: fault.seen ?? null,
    causingStep: null,
    order: null,
    applyId: null,
    crops: { before: [], after: [] },
    outcome: 'logged-only',
    reason: null,
    ...fields
  }
}

/** The step a site check failure on the same slot names as the cause, when the first check names one. */
export function causingStepOf(firstCheck, slot) {
  if (!slot) return null
  for (const group of firstCheck?.groups ?? [])
    for (const failure of group.failures ?? [])
      if (failure.slot === slot && failure.causingStep !== undefined) return failure.causingStep
  return null
}

/** The log as it is kept: its records, their counts by outcome, what the run spent and how the final check ended. */
export function repairLog({ site, records, unshot, costUsd, ms, finalCheck }) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, records.filter((r) => r.outcome === o).length]))
  return {
    version: REPAIR_LOG_VERSION,
    site,
    counts: { found: records.length, ...counts },
    records,
    unshot,
    costUsd,
    ms,
    finalCheck: finalCheck ? { status: finalCheck.status, counts: finalCheck.counts } : null
  }
}
