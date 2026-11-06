// The result of step 9b as kept with the build's other step outputs (#448): what was found and skipped, each turn with
// the faults it carried, the turn sent and what it changed, what was undone, resent and dropped, how long it took and what
// it cost. `repair-pass.json` beside the write report and the site checks. Pure.

export const REPAIR_VERSION = 'repair-pass/1'

const faultLine = (f) => ({
  source: f.source,
  group: f.group,
  kind: f.kind,
  page: f.page,
  slot: f.slot,
  block: f.block,
  width: f.width,
  seen: f.measured ?? f.seen ?? null
})

const turnLine = (t) => ({
  page: t.page,
  round: t.round,
  turnId: t.turnId,
  state: t.state,
  requestIds: t.requestIds,
  numbers: t.numbers,
  faults: t.faults.map(faultLine),
  changes: t.changes,
  costUsd: t.costUsd,
  ms: t.ms,
  sent: t.text
})

const sum = (values) => {
  const known = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

/**
 * @param {{ outcome: object, found: { faults: object[], problem: string | null, costUsd: number | null },
 *   clock: { elapsed: () => number, limits: object }, site: string }} input
 */
export function repairSummary({ outcome, found, clock, site }) {
  const turns = (outcome.turns ?? []).map(turnLine)
  const agentUsd = sum(turns.map((t) => t.costUsd))
  return {
    version: REPAIR_VERSION,
    site,
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
    sessionId: outcome.sessionId ?? null,
    ms: clock.elapsed(),
    limits: { stopNewWorkMs: clock.limits.stopNewWorkMs, returnByMs: clock.limits.returnByMs },
    costUsd: { finder: found.costUsd ?? null, agent: agentUsd },
    finder: { faults: found.faults.length, problem: found.problem },
    sent: turns.reduce((n, t) => n + t.faults.length, 0),
    skipped: (outcome.skipped ?? []).map((s) => ({ ...faultLine(s.fault), reason: s.reason })),
    turns,
    undone: outcome.undone ?? [],
    resent: outcome.resent ?? [],
    dropped: outcome.dropped ?? [],
    notSent: outcome.notSent ?? [],
    checks: outcome.checks ?? 1
  }
}
