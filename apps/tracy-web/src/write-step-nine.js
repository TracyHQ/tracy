// Wiring: step 9 whole (ADR 0044; #448), the one entry point every caller runs: the write, then the first site check with
// the finder beside it, then step 9b (the repair pass through Tracy's site agent, write-step/repair-pass/), then the site
// check again inside the pass, then hand-over. Callers never run the parts on their own. It sits beside app.js because it
// joins the write step, the site check and the repair pass.
//
// One clock (repair-limits.js) runs from the end of the write. The first site check and the finder start at that moment,
// side by side; 9b starts once the first check ended (its groups judge the whole site at once, so no page's check faults
// exist before), and sends each page as soon as the finder answered it (repair-schedule.js `pageFeed`), while the finder
// still looks at the others. A `timeline` of the stages, from the start of the write, goes into repair-pass.json.
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
import { kitAltSlots } from './write-step/repair-pass/repair-alt-slots.js'
import { briefValues } from './write-step/repair-pass/repair-brief-values.js'
import { runRepairPass, undoTurns } from './write-step/repair-pass/repair-pass.js'
import { pageFeed } from './write-step/repair-pass/repair-schedule.js'
import { sweepTurns } from './write-step/repair-pass/repair-turns.js'
import { repairClock } from './write-step/repair-pass/repair-limits.js'
import { repairSummary } from './write-step/repair-pass/repair-summary.js'
import { runWriteStep } from './write-step/write-step.js'

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** After the finder is stopped at its limit, how long it has to hand back what it found so far. */
const FINDER_STOP_GRACE_MS = 15_000

const addCost = (a, b) =>
  typeof b === 'number' && Number.isFinite(b) ? Math.round(((a ?? 0) + b) * 1e8) / 1e8 : a

/**
 * The finder beside the first check, on the step clock. At its limit it is stopped (`signal`) and hands back every fault
 * it found before, with the pages it did not look at; a finder that fails, or gives nothing back once stopped, finds
 * nothing, and says so.
 */
async function findBeside(finder, report, clock, onPage) {
  if (!finder) return { faults: [], problem: null, problems: [], costUsd: null }
  const stop = new AbortController()
  const looking = Promise.resolve().then(() => finder.find(report, { signal: stop.signal, onPage }))
  try {
    let done = await clock.within(() => looking, Math.min(clock.limits.finderMs, clock.returnLeft()))
    if (done.late) {
      stop.abort(new Error('the finder time limit'))
      done = await clock.within(() => looking, Math.min(FINDER_STOP_GRACE_MS, clock.returnLeft()))
      if (done.late)
        return {
          faults: [],
          problem: 'the finder did not end in its time, and gave nothing back once stopped',
          problems: [],
          costUsd: null
        }
    }
    return {
      faults: done.value?.faults ?? [],
      problem: done.value?.problem ?? null,
      problems: done.value?.problems ?? [],
      costUsd: done.value?.costUsd ?? null
    }
  } catch (error) {
    return { faults: [], problem: String(error?.message ?? error), problems: [], costUsd: null }
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
  if (ledger.records.size)
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
  const done = pass.result ?? {}
  return {
    ...done,
    status: 'failed',
    error: reason,
    turns: ledger.turns,
    undone: [...(done.undone ?? []), ...undone],
    check: firstCheck
  }
}

/**
 * @param {{ write: object, checkSite: (report: object, options: { baseline: object | null, allGroups: true }) => Promise<object>,
 *   baselines?: { read: (contract: string) => Promise<object | null> } | null, contracts?: Map<string, object>,
 *   finder?: { find: (report: object, options?: { pages?: string[], signal?: AbortSignal }) => Promise<{ faults: object[],
 *     problem?: string | null, problems?: object[], costUsd?: number | null }> } | null,
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
  const t0 = now()
  const timeline = []
  const mark = (stage, from, extra = {}) =>
    timeline.push({ stage, ...extra, startMs: from - t0, endMs: now() - t0 })
  const written = await runWriteStep({ now, sleep, ...write })
  mark('write', t0)
  if (written.status !== 'done') return { report: written, siteCheck: null, firstCheck: null, repair: null }
  // The demo baseline committed beside the contract at step 0 (demo-baseline.json), unless the caller gives its own lookup.
  const store = baselines ?? contractBaselineStore({ index: contracts ?? defaultContracts() })
  const baseline = await store.read(written.contract).catch(() => null)
  // Every check of step 9 runs the page groups even when read-back is red: the repair pass needs the page faults, and
  // a red read-back stays blocking in the check (site-check.js `allGroups`, never green). A check after a turn reads
  // only the pages it changed (`pages`), every page when null.
  const siteCheck = (report, pages = null) =>
    checkSite(report, { baseline, allGroups: true, ...(pages ? { pages } : {}) })
  // One clock for the whole of step 9 after the write: the first check and the finder spend it while 9b starts.
  const clock = repairClock({ now, sleep, limits, ...(timer ? { timer } : {}) })
  const feed = finder ? pageFeed() : null
  const lookFrom = now()
  const onPage = (page, faults) => {
    mark('finder-page', lookFrom, { page, faults: Array.isArray(faults) ? faults.length : 0 })
    feed?.answer(page, faults)
  }
  // The finder and the first check start at the same moment.
  const finding = findBeside(finder, written, clock, onPage).then((found) => {
    if (finder) mark('finder', lookFrom, { faults: found.faults.length })
    feed?.end(found.faults)
    return found
  })
  const [firstCheck, brief] = await Promise.all([
    siteCheck(written).then((check) => {
      mark('first-check', lookFrom)
      return check
    }),
    briefOf(write.files)
  ])
  const again = { costUsd: null }
  const ledger = { turns: [], undone: new Set(), records: new Map() }
  let sequence = 0
  const runId = randomUUID().slice(0, 8)
  const pass = {
    agent,
    clock,
    ledger,
    buildCommentTurn,
    checkSite: (pages) => siteCheck(written, pages),
    urlOf: pageAddressOf(agent),
    pageHtml,
    // An alt fault names the slot the kit keeps that picture's alt in, when it is not the picture slot.
    altSlots: kitAltSlots(write.kit?.doc ?? null),
    mark,
    // A second look costs too: its cost joins the finder's.
    refind: finder
      ? async (pages) => {
          const look = await finder.find(written, { pages })
          again.costUsd = addCost(again.costUsd, look?.costUsd)
          return look
        }
      : null,
    log: (line) => log.warn(line),
    nextRequestId: () => `step9b-${runId}-${++sequence}`
  }
  let outcome
  if (!agent) outcome = { status: 'not-run', reason: 'no site agent was given', check: firstCheck }
  else
    try {
      outcome = await runRepairPass(pass, { firstCheck, feed, brief })
    } catch (error) {
      const reason = String(error?.message ?? error)
      log.warn(`step 9b failed, the site is handed over as written: ${reason}`)
      outcome = await takeBack(pass, reason, firstCheck)
    }
  const looked = await finding
  if (looked.problem) log.warn(`step 9b finder: ${looked.problem}`)
  for (const p of looked.problems)
    log.warn(`step 9b finder: ${p.page}${p.viewport ? ` (${p.viewport})` : ''} ${p.problem}`)
  const found = { ...looked, costUsd: addCost(looked.costUsd, again.costUsd) }
  const handed = outcome.check
  const repair = repairSummary({ outcome, found, clock, site: write.siteKey, timeline })
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
