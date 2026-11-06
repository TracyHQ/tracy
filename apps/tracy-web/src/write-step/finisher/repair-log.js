// The repair log `repair-log/1` (spec #418): one record per repair and per fault left unrepaired, written as a file next to
// the run for the team (never shown to the customer). A record names the page, the block or slot, the fault kind, the step
// that caused it and the site check group that named it when the first check names one, the order, the before and after
// crop files (and whether they are the block or the whole tile), the outcome and the reason. The log also says whether the
// final site check gained any blocking failure the first check did not have. Developers read it to choose which repeated
// faults become code rules.

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
    causingCheck: null,
    order: null,
    applyId: null,
    crops: { by: null, before: [], after: [] },
    outcome: 'logged-only',
    reason: null,
    ...fields
  }
}

const failuresOf = (check) =>
  (check?.groups ?? []).flatMap((g) => (g.failures ?? []).map((f) => ({ group: g.name, ...f })))

/**
 * The cause the first site check names for a fault (`site-check/1` failures carry `causingStep`, and `group` the check
 * that raised them): a failure on the fault's slot, the one on the fault's page first. Nothing when no failure names it.
 * @returns {{ causingStep: number | null, causingCheck: string | null }}
 */
export function causeOf(firstCheck, { page, slot }) {
  if (!slot) return { causingStep: null, causingCheck: null }
  const onSlot = failuresOf(firstCheck).filter((f) => f.slot === slot && Number.isInteger(f.causingStep))
  const named = onSlot.find((f) => f.page === page) ?? onSlot.find((f) => !f.page) ?? onSlot[0]
  return named
    ? { causingStep: named.causingStep, causingCheck: named.group ?? null }
    : { causingStep: null, causingCheck: null }
}

const blockingKey = (f) => JSON.stringify([f.group, f.page ?? null, f.slot ?? null, f.width ?? null])

/** The blocking failures of the final check that the first check did not have, by group, page, slot and width. */
export function newBlockingFailures(firstCheck, finalCheck) {
  const before = new Set(
    failuresOf(firstCheck)
      .filter((f) => (f.level ?? 'block') === 'block')
      .map(blockingKey)
  )
  return failuresOf(finalCheck)
    .filter((f) => (f.level ?? 'block') === 'block' && !before.has(blockingKey(f)))
    .map((f) => ({
      group: f.group,
      page: f.page ?? null,
      slot: f.slot ?? null,
      width: f.width ?? null,
      causingStep: f.causingStep ?? null,
      reason: f.reason ?? null
    }))
}

/**
 * The log as it is kept: its records, their counts by outcome, what the run spent, how the final check ended and the
 * blocking failures it gained over the first check.
 */
export function repairLog({ site, records, unshot, costUsd, ms, firstCheck, finalCheck }) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, records.filter((r) => r.outcome === o).length]))
  const newBlocking = finalCheck ? newBlockingFailures(firstCheck, finalCheck) : []
  return {
    version: REPAIR_LOG_VERSION,
    site,
    counts: { found: records.length, ...counts, newBlocking: newBlocking.length },
    records,
    unshot,
    costUsd,
    ms,
    finalCheck: finalCheck ? { status: finalCheck.status, counts: finalCheck.counts, newBlocking } : null
  }
}
