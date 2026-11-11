// Wiring: step 9 whole (ADR 0044; #448), the one entry point every caller runs: the write, then the first site check (a
// script, step 11's check), then step 9b (the repair pass through Tracy's site agent, write-step/repair-pass/) on the
// customer-visible faults of that check, then a site check of only the pages a turn changed inside the pass, then
// hand-over. Callers never run the parts on their own. It sits beside app.js because it joins the write step, the site
// check and the repair pass.
//
// One clock (repair-limits.js) runs from the end of the write; the first check spends it too. A `timeline` of the stages,
// from the start of the write, goes into repair-pass.json.
// Step 9b never keeps the site from the customer: with no site agent it does not run; a page that fails is logged and the
// others go on (repair-schedule.js); any other error in it is logged, the turns it made are taken back newest first, and
// the site is handed over as written with the first site check. It never throws to the step. No customer notice. With
// `saveFile`, the step's outputs are written side by side: the write report (with the site check handed over), the first
// site check, the site check handed over and the repair pass's result (faults sent, turns, what each changed, what was
// undone, the pages that failed, time and cost).
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { buildCommentTurn } from './lib/comment-turn.js'
import { defaultContracts } from './lib/contracts.js'
import { contractBaselineStore } from './site-check/demo-baseline.js'
import { withReadBack } from './site-check/read-back.js'
import { kitAltSlots } from './write-step/repair-pass/repair-alt-slots.js'
import { briefValues } from './write-step/repair-pass/repair-brief-values.js'
import { checkAccepted } from './write-step/repair-pass/repair-faults.js'
import { runRepairPass, undoTurns } from './write-step/repair-pass/repair-pass.js'
import { sweepTurns } from './write-step/repair-pass/repair-turns.js'
import { repairClock } from './write-step/repair-pass/repair-limits.js'
import { repairSummary } from './write-step/repair-pass/repair-summary.js'
import { runWriteStep } from './write-step/write-step.js'

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The brief's values a demo fault may name, from the write's brief file; none when it gives no brief. */
async function briefOf(files) {
  if (!files?.brief) return null
  try {
    return briefValues(JSON.parse(await readFile(files.brief, 'utf8')))
  } catch {
    return null
  }
}

/** Frames the manifest kept with a picture the looker rejected. Keep the exact fault names in the final write report. */
export function pictureReviewOf(manifest) {
  return [
    ...(Array.isArray(manifest?.frames) ? manifest.frames : []),
    ...(Array.isArray(manifest?.siteSettings) ? manifest.siteSettings : [])
  ]
    .filter(
      (entry) =>
        entry?.filledBy?.rung === 'best-rejected' &&
        typeof entry.frame === 'string' &&
        Array.isArray(entry.filledBy.faults) &&
        entry.filledBy.faults.every((fault) => typeof fault === 'string')
    )
    .map((entry) => ({
      frame: entry.frame,
      source: entry.source,
      sitePath: entry.sitePath,
      filledBy: { rung: 'best-rejected', faults: [...entry.filledBy.faults] }
    }))
}

/** The address a comment names for a page: the agent's, never a bare path. */
const pageAddressOf = (agent) => (page) => {
  if (typeof agent?.pageUrl !== 'function')
    throw new Error('the site agent gives no page address, and a comment never names a bare path')
  return agent.pageUrl(page)
}

/** Ask the agent to retire each session of the pass (a build's agent offers it); one that cannot be is logged, never thrown. */
async function retireSessions(agent, sessions, warn, clock) {
  if (typeof agent?.retire !== 'function') return true
  for (const sessionId of sessions) {
    let done = null
    try {
      const answer = await clock.within(() => agent.retire({ sessionId }), clock.returnLeft())
      if (answer.late) {
        warn(`step 9b: the session ${sessionId} retirement did not answer in the time left`)
        return false
      }
      done = answer.value
    } catch (error) {
      done = { ok: false, reason: String(error?.message ?? error) }
    }
    if (!done?.ok)
      warn(`step 9b: the session ${sessionId} could not be retired${done?.reason ? `: ${done.reason}` : ''}`)
  }
  return true
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

/** Native settlement and checked writes are separate: an ended late turn is safe to recover, but not to deliver. */
async function repairWriterEvidence(agent, ledger, clock) {
  if (!agent || !ledger.records.size) return { settled: true, checked: true }
  const sessions = new Map()
  for (const [id, record] of ledger.records)
    sessions.set(record.sessionId, [...(sessions.get(record.sessionId) ?? []), id])
  let checked = true
  try {
    for (const [sessionId, requestIds] of sessions) {
      const turns = await clock.bounded('the final native repair records', () =>
        agent.turns({ sessionId, requestIds })
      )
      if (
        !Array.isArray(turns) ||
        turns.some((t) => !['closed', 'stale'].includes(t.state)) ||
        requestIds.some((id) => !turns.some((t) => t.rpcId === id))
      )
        return { settled: false, checked: false }
      for (const turn of turns) {
        const held = ledger.turns.find((t) => t.turnId === turn.turnId && t.sessionId === sessionId)
        if (
          !held ||
          (!held.judged && !ledger.undone.has(turn.turnId)) ||
          !isDeepStrictEqual(held.changes, turn.changes)
        )
          checked = false
      }
    }
    return { settled: true, checked }
  } catch {
    return { settled: false, checked: false }
  }
}

/**
 * @param {{ write: object, checkSite: (report: object, options: { baseline: object | null, allGroups: true,
 *     pages?: string[] }) => Promise<object>,
 *   baselines?: { read: (contract: string) => Promise<object | null> } | null, contracts?: Map<string, object>,
 *   agent?: object | null, saveFile?: ((name: string, data: string) => Promise<void>) | null,
 *   beforeRepair?: (() => Promise<void>) | null,
 *   pictures?: object | null,
 *   pageHtml?: ((page: string) => Promise<string | null>) | null,
 *   limits?: object | null, timer?: Function, now?: () => number, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn: (line: string) => void } }} input `write` is the write step's input (write-step.js); `agent` the site
 *   agent of the pass (repair-pass.js), none to write and check only; `pageHtml` a page as the site serves it, for the
 *   element each comment points at
 * @returns {Promise<{ report: object, siteCheck: object | null, firstCheck: object | null, repair: object | null }>}
 */
export async function runStepNine(input) {
  const { write, checkSite, baselines, contracts, agent = null, saveFile = null, pictures = null } = input
  const { limits = null, timer, now = Date.now, sleep = realSleep, log = console, pageHtml = null } = input
  const t0 = now()
  const timeline = []
  const mark = (stage, from, extra = {}) =>
    timeline.push({ stage, ...extra, startMs: from - t0, endMs: now() - t0 })
  const written = await runWriteStep({ now, sleep, ...write })
  mark('write', t0)
  if (written.status !== 'done')
    return { report: written, siteCheck: null, firstCheck: null, repair: null, writersSettled: true }
  // The setup hold must end before a native turn opens. A failed checkpoint permits no repair
  // prompt: its file moment could otherwise absorb the initial write and undo personalization.
  if (input.beforeRepair) {
    const checkpointFrom = now()
    try {
      await input.beforeRepair()
      mark('setup-checkpoint', checkpointFrom)
    } catch (error) {
      const report = {
        ...written,
        status: 'stopped',
        cause: { code: 'STEP_NINE_BASELINE_UNPROVEN', reason: String(error?.message ?? error) }
      }
      if (saveFile) await saveFile('site-write-report.json', `${JSON.stringify(report, null, 2)}\n`)
      return { report, siteCheck: null, firstCheck: null, repair: null, writersSettled: true }
    }
  }
  // The demo baseline committed beside the contract at step 0 (demo-baseline.json), unless the caller gives its own lookup.
  const store = baselines ?? contractBaselineStore({ index: contracts ?? defaultContracts() })
  const baseline = await store.read(written.contract).catch(() => null)
  // Every check of step 9 runs the page groups even when read-back is red: the repair pass needs the page faults, and
  // a red read-back stays blocking in the check (site-check.js `allGroups`, never green). A check after a turn reads
  // only the pages it changed (`pages`), every page when null.
  const siteCheck = (report, pages = null) =>
    checkSite(report, { baseline, allGroups: true, ...(pages ? { pages } : {}) })
  // One clock for the whole of step 9 after the write: the first check spends it before 9b starts.
  const clock = repairClock({ now, sleep, limits, ...(timer ? { timer } : {}) })
  const checkFrom = now()
  const [firstCheck, brief] = await Promise.all([
    siteCheck(written).then((check) => {
      mark('first-check', checkFrom)
      return check
    }),
    briefOf(write.files)
  ])
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
    log: (line) => log.warn(line),
    nextRequestId: () => `step9b-${runId}-${++sequence}`
  }
  let outcome
  if (!agent) outcome = { status: 'not-run', reason: 'no site agent was given', check: firstCheck }
  else
    try {
      outcome = await runRepairPass(pass, { firstCheck, brief })
    } catch (error) {
      const reason = String(error?.message ?? error)
      log.warn(`step 9b failed, the site is handed over as written: ${reason}`)
      outcome = await takeBack(pass, reason, firstCheck)
    }
  // The sessions of a build's repair pass are retired once it is over, whatever its outcome (a taken-back pass too).
  const retiredInTime = await retireSessions(
    agent,
    pass.result?.sessions ?? [],
    (line) => log.warn(line),
    clock
  )
  const evidence = retiredInTime
    ? await repairWriterEvidence(agent, ledger, clock)
    : { settled: false, checked: false }
  const writersSettled = evidence.settled
  if ((!writersSettled || !evidence.checked) && outcome.status === 'done')
    outcome = {
      ...outcome,
      status: 'incomplete',
      reason: !writersSettled
        ? 'Not every prompted repair request has a terminal native turn record.'
        : 'A native repair turn or its writes appeared after the last verified site check.'
    }
  const handed = outcome.check
  const repair = repairSummary({ outcome, clock, site: write.siteKey, timeline })
  const verified =
    writersSettled &&
    evidence.checked &&
    checkAccepted(handed) &&
    !['incomplete', 'failed'].includes(outcome.status)
  const report = {
    ...withReadBack(written, handed),
    pictureReview: pictureReviewOf(pictures),
    writeStatus: written.status,
    ...(!verified
      ? {
          status: 'stopped',
          cause: {
            code: 'STEP_NINE_CHECK_FAILED',
            reason: 'The write completed, but the final site check or repair verification did not pass.'
          }
        }
      : {})
  }
  if (saveFile) {
    const out = (name, value) => saveFile(name, `${JSON.stringify(value, null, 2)}\n`)
    await out('site-write-report.json', report)
    await out('first-site-check.json', firstCheck)
    await out('site-check.json', handed)
    await out('repair-pass.json', repair)
  }
  return {
    report,
    siteCheck: handed,
    firstCheck,
    repair,
    writersSettled
  }
}
