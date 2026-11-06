// Wiring: step 9 whole (ADR 0044; #448), the one entry point every caller runs: the write, then the first site check with
// the finder beside it, then step 9b (the repair pass through Tracy's site agent, write-step/repair-pass/), then the site
// check again inside the pass, then hand-over. Callers never run the parts on their own. It sits beside app.js because it
// joins the write step, the site check and the repair pass.
//
// One clock (repair-limits.js) runs from the end of the write: the first site check and the finder spend it, then 9b.
// Step 9b never keeps the site from the customer: with no site agent it does not run; any error in it is logged, the turns
// it made are taken back newest first, and the site is handed over as written with the first site check. No customer
// notice. With `saveFile`, the step's outputs are written side by side: the write report (with the site check handed over),
// the first site check, the site check handed over and the repair pass's result (faults sent, turns, what each changed,
// what was undone, time and cost).
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { buildCommentTurn } from './lib/comment-turn.js'
import { defaultContracts } from './lib/contracts.js'
import { contractBaselineStore } from './site-check/demo-baseline.js'
import { withReadBack } from './site-check/read-back.js'
import { briefValues } from './write-step/repair-pass/repair-brief-values.js'
import { runRepairPass, undoTurns } from './write-step/repair-pass/repair-pass.js'
import { sweepTurns } from './write-step/repair-pass/repair-turns.js'
import { repairClock } from './write-step/repair-pass/repair-limits.js'
import { repairSummary } from './write-step/repair-pass/repair-summary.js'
import { runWriteStep } from './write-step/write-step.js'

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The finder beside the first check, on the step clock; a finder that fails or is late finds nothing, and says so. */
async function findBeside(finder, report, clock) {
  if (!finder) return { faults: [], problem: null, costUsd: null }
  try {
    const done = await clock.within(
      () => finder.find(report),
      Math.min(clock.limits.finderMs, clock.returnLeft())
    )
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

/** The brief's values a demo fault may name, from the write's brief file; none when it gives no brief. */
async function briefOf(files) {
  if (!files?.brief) return null
  try {
    return briefValues(JSON.parse(await readFile(files.brief, 'utf8')))
  } catch {
    return null
  }
}

/** The address a comment names for a page: the agent's, never a bare path. */
const pageAddressOf = (agent) => (page) => {
  if (typeof agent?.pageUrl !== 'function')
    throw new Error('the site agent gives no page address, and a comment never names a bare path')
  return agent.pageUrl(page)
}

/** After a 9b error: every turn of the pass's request ids (a late one too) taken back, newest first, each undo kept. */
async function takeBack(pass, reason, firstCheck) {
  const { ledger } = pass
  if (pass.sessionId)
    await sweepTurns(pass, { turns: [] }).catch((error) =>
      pass.log(`step 9b: the turn records could not be read after the error: ${error?.message ?? error}`)
    )
  const back = ledger.turns.filter((t) => t.turnId && !ledger.undone.has(t.turnId)).reverse()
  const undone = await undoTurns(pass, back, 'step 9b failed').catch((error) => [
    {
      turnId: null,
      page: null,
      why: 'step 9b failed',
      status: 'undo-failed',
      ok: false,
      code: null,
      reason: String(error?.message ?? error)
    }
  ])
  return { status: 'failed', error: reason, turns: ledger.turns, undone, check: firstCheck }
}

/**
 * @param {{ write: object, checkSite: (report: object, options: { baseline: object | null }) => Promise<object>,
 *   baselines?: { read: (contract: string) => Promise<object | null> } | null, contracts?: Map<string, object>,
 *   finder?: { find: (report: object) => Promise<{ faults: object[], problem?: string | null, costUsd?: number | null }> } | null,
 *   agent?: object | null, saveFile?: ((name: string, data: string) => Promise<void>) | null,
 *   pageHtml?: ((page: string) => Promise<string | null>) | null,
 *   limits?: object | null, timer?: Function, now?: () => number, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn: (line: string) => void } }} input `write` is the write step's input (write-step.js); `agent` the site
 *   agent of the pass (repair-pass.js), none to write and check only; `pageHtml` a page as the site serves it, for the
 *   element each comment points at; `finder.find(report, { pages })` looks only at those pages
 * @returns {Promise<{ report: object, siteCheck: object | null, firstCheck: object | null, repair: object | null }>}
 */
export async function runStepNine(input) {
  const { write, checkSite, baselines, contracts, finder = null, agent = null, saveFile = null } = input
  const { limits = null, timer, now = Date.now, sleep = realSleep, log = console, pageHtml = null } = input
  const written = await runWriteStep({ now, sleep, ...write })
  if (written.status !== 'done') return { report: written, siteCheck: null, firstCheck: null, repair: null }
  // The demo baseline committed beside the contract at step 0 (demo-baseline.json), unless the caller gives its own lookup.
  const store = baselines ?? contractBaselineStore({ index: contracts ?? defaultContracts() })
  const baseline = await store.read(written.contract).catch(() => null)
  const siteCheck = (report) => checkSite(report, { baseline })
  // One clock for the whole of step 9 after the write: the first check and the finder spend it before 9b starts.
  const clock = repairClock({ now, sleep, limits, ...(timer ? { timer } : {}) })
  const [firstCheck, found, brief] = await Promise.all([
    siteCheck(written),
    findBeside(finder, written, clock),
    briefOf(write.files)
  ])
  if (found.problem) log.warn(`step 9b finder: ${found.problem}`)

  const ledger = { turns: [], undone: new Set(), records: new Map() }
  let sequence = 0
  const runId = randomUUID().slice(0, 8)
  const pass = {
    agent,
    clock,
    ledger,
    buildCommentTurn,
    checkSite: () => siteCheck(written),
    urlOf: pageAddressOf(agent),
    pageHtml,
    refind: finder ? async (pages) => finder.find(written, { pages }) : null,
    log: (line) => log.warn(line),
    nextRequestId: () => `step9b-${runId}-${++sequence}`
  }
  let outcome
  if (!agent) outcome = { status: 'not-run', reason: 'no site agent was given', check: firstCheck }
  else
    try {
      outcome = await runRepairPass(pass, { firstCheck, found: found.faults, brief })
    } catch (error) {
      const reason = String(error?.message ?? error)
      log.warn(`step 9b failed, the site is handed over as written: ${reason}`)
      outcome = await takeBack(pass, reason, firstCheck)
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
