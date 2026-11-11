// The result of step 9b as kept with the build's other step outputs (#448): what was skipped, each turn with
// the faults it carried, how it joined (sent, late, duplicate), the items as sent, the turn sent, what it changed and on
// which pages, what was undone (or failed to be, with why), resent, dropped, not sent and the pages that failed, how long it took and what it cost,
// and the timeline of the step's stages from the start of the write (write, first check, each session,
// turn and check after).
// `repair-pass.json` beside the write report and the site checks. Pure.

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
  how: t.how ?? 'sent',
  sessionId: t.sessionId ?? null,
  turnId: t.turnId,
  state: t.state,
  ...(t.cancelled ? { cancelled: true } : {}),
  ...(t.leftOpen ? { leftOpen: true } : {}),
  changedPages: t.changedPages ?? null,
  verdict: t.verdict ?? 'unverified',
  regressions: t.regressions ?? [],
  newlyObserved: t.newlyObserved ?? [],
  remaining: t.remaining ?? [],
  items: (t.items ?? []).map((i) => ({
    url: i.url,
    selector: i.element?.selector ?? '',
    locateFrom: i.locateFrom ?? null,
    ...(i.locateProblem ? { locateProblem: i.locateProblem } : {})
  })),
  requestIds: t.requestIds,
  numbers: t.numbers,
  faults: t.faults.map(faultLine),
  changes: t.changes,
  costUsd: t.costUsd,
  ms: t.ms,
  sent: t.text
})

/**
 * @param {{ outcome: object, clock: { elapsed: () => number, limits: object }, site: string, timeline?: object[] }} input
 */
export function repairSummary({ outcome, clock, site, timeline = [] }) {
  const turns = (outcome.turns ?? []).map(turnLine)
  const measured = turns.filter((t) => Number.isFinite(t.costUsd))
  const agentKnown = measured.reduce((sum, t) => sum + t.costUsd, 0)
  const agentUsd = measured.length === turns.length ? agentKnown : null
  return {
    version: REPAIR_VERSION,
    site,
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
    sessions: outcome.sessions ?? [],
    ms: clock.elapsed(),
    limits: { stopNewWorkMs: clock.limits.stopNewWorkMs, returnByMs: clock.limits.returnByMs },
    costUsd: { agent: agentUsd, ...(agentUsd === null ? { agentKnown } : {}) },
    sent: turns.reduce((n, t) => n + t.faults.length, 0),
    skipped: (outcome.skipped ?? []).map((s) => ({ ...faultLine(s.fault), code: s.code, reason: s.reason })),
    turns,
    undone: outcome.undone ?? [],
    resent: outcome.resent ?? [],
    dropped: outcome.dropped ?? [],
    notSent: outcome.notSent ?? [],
    errors: outcome.errors ?? [],
    checks: outcome.checks ?? 1,
    remaining: outcome.remaining ?? [],
    timeline
  }
}
