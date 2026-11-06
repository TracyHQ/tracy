// Wiring: step 9 whole (ADR 0044; #448), the one entry point every caller runs: the write, then the first site check with
// the finder beside it, then step 9b (the repair pass through Tracy's site agent, write-step/repair-pass/), then the site
// check again inside the pass, then hand-over. Callers never run the parts on their own. It sits beside app.js because it
// joins the write step, the site check and the repair pass.
//
// Step 9b never keeps the site from the customer: with no site agent it does not run; any error in it is logged, the turns
// it made are taken back newest first, and the site is handed over as written with the first site check. No customer
// notice. With `saveFile`, the step's outputs are written side by side: the write report (with the site check handed over),
// the first site check, the site check handed over and the repair pass's result (faults sent, turns, what each changed,
// what was undone, time and cost).
import { randomUUID } from 'node:crypto'
import { buildCommentTurn } from './lib/comment-turn.js'
import { defaultContracts } from './lib/contracts.js'
import { contractBaselineStore } from './site-check/demo-baseline.js'
import { withReadBack } from './site-check/read-back.js'
import { runRepairPass, undoTurns } from './write-step/repair-pass/repair-pass.js'
import { repairClock } from './write-step/repair-pass/repair-limits.js'
import { repairSummary } from './write-step/repair-pass/repair-summary.js'
import { runWriteStep } from './write-step/write-step.js'

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The finder beside the first check, bounded by its own limit; a finder that fails or is late finds nothing, and says so. */
async function findBeside(finder, report, clock) {
  if (!finder) return { faults: [], problem: null, costUsd: null }
  try {
    const done = await clock.within(() => finder.find(report), clock.limits.finderMs)
    if (done.late) return { faults: [], problem: 'the finder did not end in its time', costUsd: null }
    return {
      faults: done.value?.faults ?? [],
      problem: done.value?.problem ?? null,
      costUsd: done.value?.costUsd ?? null
    }
  } catch (error) {
    return { faults: [], problem: String(error?.message ?? error), costUsd: null }
  }
}

/**
 * @param {{ write: object, checkSite: (report: object, options: { baseline: object | null }) => Promise<object>,
 *   baselines?: { read: (contract: string) => Promise<object | null> } | null, contracts?: Map<string, object>,
 *   finder?: { find: (report: object) => Promise<{ faults: object[], problem?: string | null, costUsd?: number | null }> } | null,
 *   agent?: object | null, saveFile?: ((name: string, data: string) => Promise<void>) | null,
 *   limits?: object | null, timer?: Function, now?: () => number, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn: (line: string) => void } }} input `write` is the write step's input (write-step.js); `agent` the site
 *   agent of the pass (repair-pass.js), none to write and check only
 * @returns {Promise<{ report: object, siteCheck: object | null, firstCheck: object | null, repair: object | null }>}
 */
export async function runStepNine(input) {
  const { write, checkSite, baselines, contracts, finder = null, agent = null, saveFile = null } = input
  const { limits = null, timer, now = Date.now, sleep = realSleep, log = console } = input
  const written = await runWriteStep({ now, sleep, ...write })
  if (written.status !== 'done') return { report: written, siteCheck: null, firstCheck: null, repair: null }
  // The demo baseline committed beside the contract at step 0 (demo-baseline.json), unless the caller gives its own lookup.
  const store = baselines ?? contractBaselineStore({ index: contracts ?? defaultContracts() })
  const baseline = await store.read(written.contract).catch(() => null)
  const siteCheck = (report) => checkSite(report, { baseline })
  const findClock = repairClock({ now, sleep, limits, ...(timer ? { timer } : {}) })
  const [firstCheck, found] = await Promise.all([siteCheck(written), findBeside(finder, written, findClock)])
  if (found.problem) log.warn(`step 9b finder: ${found.problem}`)

  const clock = repairClock({ now, sleep, limits, ...(timer ? { timer } : {}) })
  const ledger = { turns: [], undone: new Set() }
  let sequence = 0
  const runId = randomUUID().slice(0, 8)
  const pass = {
    agent,
    clock,
    ledger,
    buildCommentTurn,
    checkSite: () => siteCheck(written),
    urlOf: (page) => agent?.pageUrl?.(page) ?? page,
    log: (line) => log.warn(line),
    nextRequestId: () => `step9b-${runId}-${++sequence}`
  }
  let outcome
  if (!agent) outcome = { status: 'not-run', reason: 'no site agent was given', check: firstCheck }
  else
    try {
      outcome = await runRepairPass(pass, { firstCheck, found: found.faults })
    } catch (error) {
      const reason = String(error?.message ?? error)
      log.warn(`step 9b failed, the site is handed over as written: ${reason}`)
      const back = ledger.turns.filter((t) => !ledger.undone.has(t.turnId)).reverse()
      const undone = await undoTurns(pass, back, 'step 9b failed').catch(() => [])
      outcome = { status: 'failed', error: reason, turns: ledger.turns, undone, check: firstCheck }
    }
  const handed = outcome.check
  const repair = repairSummary({ outcome, found, clock, site: write.siteKey })
  const report = withReadBack(written, handed)
  if (saveFile) {
    const out = (name, value) => saveFile(name, `${JSON.stringify(value, null, 2)}\n`)
    await out('site-write-report.json', report)
    await out('first-site-check.json', firstCheck)
    await out('site-check.json', handed)
    await out('repair-pass.json', repair)
  }
  return { report, siteCheck: handed, firstCheck, repair }
}
