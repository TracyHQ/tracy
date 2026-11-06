// The repair log `repair-log/1` (spec #418): one record per repair and per fault left unrepaired, written as a file next to
// the run for the team (never shown to the customer). A record names the page, the block or slot, the fault kind, the step
// that caused it and the site check group that named it when the first check names one, the order, the before and after
// crop files (and whether they are the block or the whole tile), the outcome and the reason. The log also says whether the
// final site check gained any blocking failure the first check did not have, in the groups both checks measured, and names
// the groups it could not compare. It keeps what the run took: its time and cost, the time of each stage (`timings`), its
// limits, the rounds it ran, and what stopped it when a hard limit did (#424). Developers read it to choose which repeated
// faults become code rules.

export const REPAIR_LOG_VERSION = 'repair-log/1'
export const REPAIR_LOG_FILE = 'repair-log.json'

/** Every outcome a record may have. */
export const OUTCOMES = Object.freeze([
  'kept',
  'undone',
  'dropped',
  'failed',
  'logged-only',
  // A site check failure the live site does not confirm, and one with nothing to write to (#423).
  'measurement-wrong',
  'no-door',
  // A fault left when a hard limit stopped the run (reason `budget`) or when no round was left (#424).
  'unrepaired',
  // A demo fact or demo contact link on a value the brief gives: the customer's own, never repaired (brief-values.js).
  'not-demo'
])

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
    // Which sources named the fault, and the site check groups that measured its kind green (fault-sources.js).
    ...(fault.sources ? { sources: fault.sources } : {}),
    ...(fault.missedBy ? { missedBy: fault.missedBy } : {}),
    ...fields
  }
}

/** A fault left unrepaired, by a limit or by the last round, with the cause the first site check names for it. */
export const unrepairedRecord = (firstCheck, fault, reason) =>
  logRecord(fault, { ...causeOf(firstCheck, fault), outcome: 'unrepaired', reason })

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

/** A group that measured: one stopped by an earlier group (not-run) or that could not tell (unmeasured) did not. */
const MEASURED = new Set(['green', 'red', 'not-applicable'])
const measuredGroups = (check) =>
  new Set((check?.groups ?? []).filter((g) => MEASURED.has(g.status)).map((g) => g.name))

/**
 * Which groups the two checks can be compared on: the ones both measured. The others are named, never read as clean.
 * @returns {{ compared: string[], notCompared: string[] }}
 */
export function comparedGroups(firstCheck, finalCheck) {
  const first = measuredGroups(firstCheck)
  const final = measuredGroups(finalCheck)
  const names = [
    ...new Set([...(firstCheck?.groups ?? []), ...(finalCheck?.groups ?? [])].map((g) => g.name))
  ]
  return {
    compared: names.filter((n) => first.has(n) && final.has(n)),
    notCompared: names.filter((n) => !(first.has(n) && final.has(n)))
  }
}

/**
 * The blocking failures of the final check that the first check did not have, by group, page, slot and width, in the
 * groups both checks measured only: a failure in a group the first check never ran cannot be told to be new.
 */
export function newBlockingFailures(firstCheck, finalCheck) {
  const { compared } = comparedGroups(firstCheck, finalCheck)
  const both = new Set(compared)
  const before = new Set(
    failuresOf(firstCheck)
      .filter((f) => (f.level ?? 'block') === 'block')
      .map(blockingKey)
  )
  return failuresOf(finalCheck)
    .filter((f) => both.has(f.group) && (f.level ?? 'block') === 'block' && !before.has(blockingKey(f)))
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
export function repairLog({
  site,
  records,
  unshot,
  replies = [],
  budget,
  rounds = 1,
  final = null,
  firstCheck,
  merge = null
}) {
  const finalCheck = final?.check ?? null
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, records.filter((r) => r.outcome === o).length]))
  const newBlocking = finalCheck ? newBlockingFailures(firstCheck, finalCheck) : []
  const { compared, notCompared } = finalCheck
    ? comparedGroups(firstCheck, finalCheck)
    : { compared: [], notCompared: [] }
  return {
    version: REPAIR_LOG_VERSION,
    site,
    counts: { found: records.length, ...counts, newBlocking: newBlocking.length },
    // How the checker's crops were cut: the repaired block, or the whole tile when no box held its words (repair-crops.js).
    cropModes: {
      block: records.filter((r) => r.crops?.by === 'block').length,
      tile: records.filter((r) => r.crops?.by === 'tile').length
    },
    records,
    // How the finder's faults and the first site check's failures were merged (fault-sources.js).
    merge,
    unshot,
    // The model calls' reply files (model-replies.js), each naming the image files it was shown.
    replies,
    costUsd: budget.costUsd,
    ms: budget.ms,
    // The time each stage took, summed over its calls (pages run side by side), and the run's limits (run-limits.js).
    timings: budget.timings,
    limits: budget.limits,
    overTarget: budget.overTarget,
    stoppedBy: budget.stoppedBy,
    rounds,
    undoneByFinalCheck: final?.undone ?? 0,
    finalCheck: finalCheck
      ? {
          status: finalCheck.status,
          counts: finalCheck.counts,
          allGroups: finalCheck.allGroups === true,
          compared,
          notCompared,
          newBlocking,
          // New blocking failures that name no slot or block a repair changed: logged, no repair undone for them.
          unblamed: final.unblamed ?? [],
          // What the check that ran again after the undos still gains over the first check.
          leftAfterUndo: final.leftAfterUndo ?? []
        }
      : { status: null, missing: final?.missing ?? 'the final site check did not run' }
  }
}
