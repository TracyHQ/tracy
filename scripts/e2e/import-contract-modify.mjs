#!/usr/bin/env node
/** Real browser pilot; never launches Chrome or runs without a visible copy workspace.
 * Usage: SESSION_SECRET=... node scripts/e2e/import-contract-modify.mjs /private/path/case.json
 * Case: {origin,email,siteKey,label,platform,sitesRoot,dshHome,out,cdp?,turns:[{prompt,selection?}],
 * caseId,arm:'baseline'|'treatment',repetition:1,model:{provider,id},
 * version:{sourceCommit,runtimeCommit},oracle:[executable,...args],reset:[executable,...args]}.
 * Oracle receives TRACY_BENCH_PHASE=baseline|turn-N|reset and prints JSON:
 * {ok:true,stored:true,rendered:true,fingerprint:"stable baseline state digest"}.
 * Reset is an explicit copy-only rollback command. Case/oracle/reset are trusted local inputs,
 * never source-page instructions. All commands execute directly, without a shell.
 * Selection: {enableSelector,frameUrlPattern,targetSelector,confirmedSelector} uses real UI clicks;
 * confirmedSelector must identify the selection chip, not merely the clicked DOM element.
 * Output omits prompts, Claude Cowork plugin payloads and authentication secrets.
 * Multi-session: execution:'multi-session', streams:[{workspacePath:'/<siteKey>/s/session-...',turns}].
 * Prepare distinct copy sessions before running. Only final-state oracle and whole-case rollback
 * are supported for overlapping writes; deployment version attestation remains external.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newestSessionLog, readSessionLog } from '../measure/session-metrics.mjs'
import { correlatedTurn, turnMetrics, totalMetrics } from './import-contract-metrics.mjs'
import { overlapSummary, modelEvidence } from './import-contract-overlap.mjs'
import { prepareViewer, viewerWorkspaceUrl } from './import-contract-viewer.mjs'
import { mintSession } from '../../apps/tracy-web/src/lib/session.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (spec.execution === 'multi-session') {
  if (
    !Array.isArray(spec.streams) ||
    spec.streams.length < 2 ||
    spec.streams.some((s) => !s.turns?.length || s.turns.some((t) => t.selection))
  )
    throw new Error('Multi-session requires at least two nonempty streams; selection is not implemented')
  spec.turns = spec.streams.flatMap((s) => s.turns)
}
if (!['joomla', 'wordpress'].includes(spec.platform) || !/^[a-z0-9-]{3,80}$/.test(spec.label))
  throw new Error('A valid imported CMS and copy label are required')
if (!spec.turns?.length || !spec.oracle?.length || !spec.reset?.length || !process.env.SESSION_SECRET)
  throw new Error('Turns, read-only oracle, verified rollback and SESSION_SECRET are required')
if (
  !spec.caseId ||
  !['baseline', 'treatment'].includes(spec.arm) ||
  !Number.isInteger(spec.repetition) ||
  spec.repetition < 1 ||
  !spec.model?.provider ||
  !spec.model?.id ||
  !spec.version?.sourceCommit ||
  !spec.version?.runtimeCommit
)
  throw new Error('caseId, arm, repetition, model and code/runtime version metadata are required')
const require = createRequire(
  path.join(root, 'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/package.json')
)
const { chromium } = require('playwright')
const origin = new URL(spec.origin)
const identity = JSON.parse(readFileSync(path.join(spec.sitesRoot, spec.label, '.tracy/site.json'), 'utf8'))
if (
  identity.origin !== 'imported' ||
  identity.siteKey !== spec.siteKey ||
  identity.platform !== spec.platform
)
  throw new Error('Benchmark identity must be a verified imported copy of the requested CMS')
const out = path.resolve(spec.out)
mkdirSync(out, { recursive: true })
function command(argv, phase) {
  return execFileSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      TRACY_BENCH_PHASE: phase,
      TRACY_BENCH_LABEL: spec.label,
      TRACY_BENCH_SITE_KEY: spec.siteKey
    }
  })
}
function oracle(phase) {
  const result = JSON.parse(command(spec.oracle, phase))
  if (result.ok !== true || result.stored !== true || result.rendered !== true || !result.fingerprint)
    throw new Error(`Stored/rendered oracle failed for ${phase}`)
  return result
}
const browser = await chromium.connectOverCDP(spec.cdp ?? 'http://127.0.0.1:9222')
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addCookies([
  {
    name: 'tracy_sess',
    value: await mintSession(spec.email, process.env.SESSION_SECRET),
    domain: origin.hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: origin.protocol === 'https:'
  }
])
const page = await context.newPage()
const report = {
  caseId: spec.caseId,
  arm: spec.arm,
  repetition: spec.repetition,
  model: spec.model,
  version: spec.version,
  execution: spec.execution ?? 'sequential',
  overlapSupported: spec.execution === 'queued',
  multiSessionSupported: spec.execution === 'multi-session',
  platform: spec.platform,
  label: spec.label,
  turns: [],
  resetVerified: false,
  valid: false
}
let baseline
let quiescent = true
async function idle(target) {
  const stop = target.getByRole('button', { name: 'Stop generating', exact: true })
  const send = target.getByRole('button', { name: 'Send message', exact: true })
  const deadline = Date.now() + 30000
  let stable = 0
  while (Date.now() < deadline) {
    if (!(await stop.isVisible().catch(() => false)) && (await send.isVisible().catch(() => false))) stable++
    else stable = 0
    if (stable >= 2) return
    await target.waitForTimeout(500)
  }
  throw new Error('Browser remains active or queued; rollback requires idle confirmation')
}
function events(target = page, optional = false) {
  const id = /\/s\/(session-[0-9a-f-]+)/.exec(target.url())?.[1]
  if (!id && optional) return []
  if (!id) throw new Error('Workspace has no correlated session ID')
  const dir = path.join(spec.dshHome, 'sessions', `--site-${spec.label}--`, id)
  let names
  try {
    names = readdirSync(dir)
  } catch (error) {
    if (optional && error.code === 'ENOENT') return []
    throw error
  }
  const file = newestSessionLog(names)
  if (!file && optional) return []
  if (!file) throw new Error('Session history missing')
  const log = readSessionLog(path.join(dir, file))
  if (!log.restored) throw new Error('Session schema restoration unavailable; metrics would be unreliable')
  if (target === page) report.session = id
  return log.events
}
try {
  baseline = oracle('baseline')
  await page.goto(viewerWorkspaceUrl(`/${encodeURIComponent(spec.siteKey)}/`, origin), {
    waitUntil: 'domcontentloaded'
  })
  await prepareViewer(page, identity.address)
  const composer = page.locator('[role="textbox"][contenteditable]:visible').last()
  const modelCursor = events(page, true).length
  if (spec.execution === 'multi-session') {
    report.streams = []
    const workers = await Promise.all(
      spec.streams.map(async (stream) => {
        const workspace = new URL(stream.workspacePath ?? '', origin)
        if (
          workspace.origin !== origin.origin ||
          !workspace.pathname.startsWith(`/${encodeURIComponent(spec.siteKey)}/`) ||
          !/\/s\/session-[0-9a-f-]+/.test(workspace.pathname)
        )
          throw new Error('Each stream requires a prepared session workspacePath on this copy')
        const target = await context.newPage()
        await target.goto(viewerWorkspaceUrl(workspace.href, origin), {
          waitUntil: 'domcontentloaded'
        })
        await prepareViewer(target, identity.address)
        return target
      })
    )
    const preparedIds = workers.map((target) => /\/s\/(session-[0-9a-f-]+)/.exec(target.url())?.[1])
    if (preparedIds.some((id) => !id) || new Set(preparedIds).size !== workers.length)
      throw new Error('Separate prepared sessions are required before any concurrent prompts are sent')
    const outcomes = await Promise.allSettled(
      spec.streams.map(async (stream, streamIndex) => {
        const target = workers[streamIndex]
        const result = { stream: streamIndex + 1, session: null, turns: [], quiescent: true }
        report.streams.push(result)
        for (const [index, turn] of stream.turns.entries()) {
          const before = events(target, true).length
          const submitted = Date.now()
          await target.locator('[role="textbox"][contenteditable]:visible').last().fill(turn.prompt)
          quiescent = result.quiescent = false
          await target.getByRole('button', { name: 'Send message', exact: true }).click()
          let correlated = { completed: false, rows: [] }
          while (Date.now() - submitted < (spec.timeoutMs ?? 300000)) {
            await target.waitForTimeout(1000)
            correlated = correlatedTurn(events(target, true).slice(before), turn.prompt)
            if (correlated.completed) break
          }
          result.session = /\/s\/(session-[0-9a-f-]+)/.exec(target.url())?.[1] ?? null
          result.turns.push({
            index: index + 1,
            ...turnMetrics(correlated.rows),
            ...modelEvidence(correlated.rows, spec.model),
            completed: correlated.completed,
            startedAt: correlated.rows[0]?.time ?? null,
            endedAt: correlated.completed ? (correlated.rows.at(-1)?.time ?? null) : null,
            elapsedMs: Date.now() - submitted,
            oraclePassed: false,
            oracleStatus: 'case-final-only'
          })
          if (!correlated.completed) throw new Error('Multi-session timeout; active streams prevent rollback')
          await idle(target)
          result.quiescent = true
        }
      })
    )
    quiescent = report.streams.length === spec.streams.length && report.streams.every((s) => s.quiescent)
    report.turns = report.streams.flatMap((s) => s.turns)
    report.overlap = overlapSummary(report.streams)
    report.oracleCoverage = 'case-final only; per-write oracle and per-write undo attribution unavailable'
    report.modelPinned = report.turns.length > 0 && report.turns.every((t) => t.modelPinned)
    if (outcomes.some((o) => o.status === 'rejected'))
      throw new Error('At least one concurrent stream failed')
    if (!report.overlap.uniqueSessions || !report.overlap.overlapObserved)
      throw new Error('Distinct overlapping sessions were not observed')
    if (!report.modelPinned)
      throw new Error('Actual request model could not be verified against requested model')
    if (report.turns.some((t) => t.noViewer)) throw new Error('NO_VIEWER invalidates multi-session benchmark')
    oracle('case-final')
    report.caseOraclePassed = true
  } else if (spec.execution === 'queued') {
    if (spec.turns.some((turn) => turn.selection)) throw new Error('Queued selection is not implemented')
    const occurrences = spec.turns.map(
      (turn, index) => spec.turns.slice(0, index).filter((prior) => prior.prompt === turn.prompt).length
    )
    const before = events(page, true).length
    const caseStarted = Date.now()
    const submitted = []
    let submissionFailure = null
    try {
      for (const [index, turn] of spec.turns.entries()) {
        await composer.fill(turn.prompt)
        const send = page.getByRole('button', {
          name: index === 0 ? 'Send message' : 'Queue message',
          exact: true
        })
        if (index > 0 && !(await send.isVisible().catch(() => false)))
          throw new Error('Agent no longer active or composer not in queue mode; overlap was not achieved')
        quiescent = false
        await send.click()
        submitted.push(Date.now())
        if (index === 0)
          await page
            .getByRole('button', { name: 'Stop generating', exact: true })
            .waitFor({ state: 'visible' })
      }
    } catch (error) {
      submissionFailure = error.message
    }
    let rows = []
    let completed = submitted.length === 0
    while (!completed && Date.now() - caseStarted < (spec.timeoutMs ?? 300000)) {
      await page.waitForTimeout(2000)
      rows = events(page, true).slice(before)
      completed = spec.turns
        .slice(0, submitted.length)
        .every((turn, index) => correlatedTurn(rows, turn.prompt, occurrences[index]).completed)
      if (completed) break
    }
    if (!completed) {
      const stop = page.getByRole('button', { name: 'Stop generating', exact: true })
      if (await stop.isVisible().catch(() => false)) await stop.click()
      const cancelUntil = Date.now() + 30000
      while (!completed && Date.now() < cancelUntil) {
        await page.waitForTimeout(1000)
        rows = events(page, true).slice(before)
        completed = spec.turns
          .slice(0, submitted.length)
          .every((turn, index) => correlatedTurn(rows, turn.prompt, occurrences[index]).completed)
      }
    }
    if (completed) {
      await idle(page)
      quiescent = true
    }
    report.queueLogDiagnostics = turnMetrics(rows)
    report.queueLogDiagnostics.scope = 'all session events since first queued submit; diagnostic only'
    const seenTurns = new Set()
    for (const [index, turn] of spec.turns.entries()) {
      const correlated = correlatedTurn(rows, turn.prompt, occurrences[index])
      const turnId = correlated.rows[0]?.data?.turn
      const shared = turnId != null && seenTurns.has(turnId)
      if (turnId != null) seenTurns.add(turnId)
      const first = correlated.rows[0]?.time
      const last = correlated.rows.at(-1)?.time
      report.turns.push({
        index: index + 1,
        submitted: index < submitted.length,
        ...turnMetrics(shared ? [] : correlated.rows),
        completed: correlated.completed,
        elapsedMs: typeof first === 'number' && typeof last === 'number' ? last - first : null,
        queueWaitMs: typeof first === 'number' ? Math.max(0, first - submitted[index]) : null,
        sharedTurn: shared,
        oraclePassed: false,
        oracleStatus: 'case-final-only'
      })
    }
    report.caseElapsedMs = Date.now() - caseStarted
    report.oracleCoverage = 'final state only; per-edit oracle checkpoints unavailable for overlap'
    if (submissionFailure) throw new Error(submissionFailure)
    if (report.turns.some((turn) => turn.sharedTurn))
      throw new Error('Queued edits coalesced; per-edit attribution unavailable')
    if (!completed) throw new Error('Queued case timed out; no safe rollback while queue remains active')
    oracle('case-final')
    report.caseOraclePassed = true
    if (report.turns.some((turn) => turn.noViewer)) throw new Error('NO_VIEWER invalidates queued benchmark')
  } else {
    for (const [index, turn] of spec.turns.entries()) {
      if (turn.selection) {
        const s = turn.selection
        await page.locator(s.enableSelector).click()
        const frame = page.frames().find((f) => new RegExp(s.frameUrlPattern).test(f.url()))
        if (!frame) throw new Error('Selection viewer frame missing')
        await frame.locator(s.targetSelector).click()
        await page.locator(s.confirmedSelector).waitFor({ state: 'visible' })
      }
      const before = events(page, true).length
      const started = Date.now()
      await composer.fill(turn.prompt)
      quiescent = false
      await page.locator('button:visible[aria-label="Send message"]').first().click()
      let rows = []
      let finished = false
      while (Date.now() - started < (spec.timeoutMs ?? 300000)) {
        await page.waitForTimeout(2000)
        rows = events(page, true).slice(before)
        const correlated = correlatedTurn(rows, turn.prompt)
        if (correlated.completed) {
          finished = true
          rows = correlated.rows
          break
        }
      }
      if (!finished) rows = correlatedTurn(rows, turn.prompt).rows
      if (finished) {
        await idle(page)
        quiescent = true
      }
      if (!finished) {
        const stop = page.getByRole('button', { name: 'Stop generating', exact: true })
        if (await stop.isVisible().catch(() => false)) await stop.click()
        const cancelUntil = Date.now() + 30000
        while (!quiescent && Date.now() < cancelUntil) {
          await page.waitForTimeout(1000)
          const cancelled = correlatedTurn(events(page, true).slice(before), turn.prompt)
          rows = cancelled.rows
          if (cancelled.completed) {
            await idle(page)
            quiescent = true
          }
        }
      }
      const metrics = turnMetrics(rows)
      const measured = {
        index: index + 1,
        ...metrics,
        elapsedMs: Date.now() - started,
        completed: finished,
        oraclePassed: false,
        oracleStatus: 'not-run'
      }
      report.turns.push(measured)
      if (!finished) throw new Error('Timed out waiting for correlated browser turn')
      try {
        oracle(`turn-${index + 1}`)
        measured.oraclePassed = true
        measured.oracleStatus = 'passed'
      } catch (error) {
        measured.oracleStatus = 'failed'
        throw error
      }
      await page.screenshot({ path: path.join(out, `turn-${index + 1}.png`) })
      if (metrics.noViewer) throw new Error('NO_VIEWER invalidates this benchmark')
    }
  }
  if (spec.execution !== 'multi-session')
    Object.assign(report, modelEvidence(events().slice(modelCursor), spec.model))
  if (!report.modelPinned)
    throw new Error('Actual request model could not be verified against requested model')
  report.versionAttested = false
  report.versionEvidence =
    'source/runtime commits supplied by caller; runner has not independently attested deployment'
  report.controlledComparisonValid = false
  report.valid = true
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
}
{
  if (baseline && quiescent) {
    try {
      command(spec.reset, 'reset')
      report.resetVerified = oracle('reset').fingerprint === baseline.fingerprint
      if (!report.resetVerified) throw new Error('Rollback differs from baseline')
    } catch (error) {
      report.resetFailure = error.message
      process.exitCode = 1
    }
  }
  if (baseline && !quiescent) {
    report.resetFailure = 'Agent is still active; skipped rollback to avoid a concurrent write race'
    process.exitCode = 1
  }
  report.valid = report.valid && report.resetVerified
  report.totals = totalMetrics(report.turns)
  writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  try {
    await context.close()
  } finally {
    // For connectOverCDP, Browser.close disconnects this client transport. It does not terminate
    // the attached Chrome process; its other pages and contexts stay owned by their callers.
    await browser.close()
  }
}
