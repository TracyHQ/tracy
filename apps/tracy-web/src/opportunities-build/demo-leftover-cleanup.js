/**
 * The bounded repair loop (spec TracyHQ/tracy#189, ticket #197, COO decision 30/10/2026). After the Customize engine builds
 * a brief site and the leftover check runs (`demo-leftover-check.js`), a check that still reports findings a site build
 * rule can repair starts at most three short agent turns, one per round. Each round's prompt holds only those findings
 * with the registry's repair text (`website-opportunities/domain/leftover-cleanup.mjs`, `build-rules.mjs`); the full check
 * runs again at its end, and the next round starts only when the count fell. The build NEVER fails because of it: a turn
 * that errors or times out leaves the engine's site as it is and the hand-off report lists what is left. Nothing to
 * repair, no turn.
 *
 * The turns go through the same two doors the hand-off uses: `sessionAhead` makes a chat on the site, `prompt` queues
 * the message in it. It asks for nothing the site tools removed (it names no tool; the site's own agent preset decides).
 * Reads of a locked site go through `readSitePage`, which carries the preview key.
 *
 * The receipt keeps `leftoverCleanup`: findings before the first round and after the last, what the loop changed, how the
 * last turn ended, why the loop stopped, and `rounds[]` ({round, before, after, fixed, introduced, turn}).
 * `receipt.leftovers` is replaced by the check that ran after the last round, so the hand-off lists what is left now.
 */
import { createHash } from 'node:crypto'
import { siteRowOf } from './build-store.js'
import { runLeftoverCheck } from './demo-leftover-check.js'
import { contentMapOfTemplate } from './brief-build-path.js'
import { isRecordRole, recordValuesOf } from 'website-opportunities/domain/record-roles.mjs'
import {
  CLEANUP_LIMITS,
  repairCount,
  REPAIR_LIMITS,
  renderRepairPrompt
} from 'website-opportunities/domain/leftover-cleanup.mjs'

const POLL_MS = 3_000
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const STOPPED = ['aborted', 'blocked', 'error', 'interrupted', 'max-tokens']

/**
 * The chat the cleanup turn runs in: its own, apart from the hand-off's `wo-demo-<build id>`, and in the only shape the
 * seat door allocates a server-held site chat in (`wo-demo-<uuid>`, `dsh-passwords` `site-session.ts`). A
 * `wo-cleanup-...` id was refused by the door on every build, so the turn never ran. Derived from the build id, so a
 * worker that comes back after a lost lease adopts the same chat.
 * @param {string} buildId
 */
export function cleanupSessionId(buildId) {
  const hex = createHash('sha256').update(`leftover-cleanup:${buildId}`).digest('hex')
  return `wo-demo-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * The production turn port: make a chat, queue the prompt, wait for the turn to close or the time to run out.
 * @param {{query: Function}} db
 * @param {{sessionAhead?: Function, prompt?: Function, now?: () => number, sleep?: (ms: number) => Promise<void>}} deps
 * @param {{build: any, email: string}} context
 * @returns {(input: {prompt: string, requestId: string, limits: {timeoutMs: number}}) => Promise<{state: string, code?: string}>}
 */
export function cleanupTurnPort(db, deps, { build, email }) {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? sleepFor
  return async ({ prompt, requestId, limits }) => {
    if (!deps.sessionAhead || !deps.prompt) return { state: 'error', code: 'CLEANUP_UNAVAILABLE' }
    const site = await siteRowOf(db, build.site_key)
    if (!site) return { state: 'error', code: 'CLEANUP_SITE_GONE' }
    const sessionId = await deps.sessionAhead(site, email, cleanupSessionId(build.id))
    if (!sessionId) return { state: 'error', code: 'CLEANUP_SESSION_FAILED' }
    if ((await deps.prompt(site, email, sessionId, requestId, prompt)) !== true)
      return { state: 'error', code: 'CLEANUP_PROMPT_REFUSED' }
    const until = now() + limits.timeoutMs
    for (;;) {
      const { rows } = await db.query(
        `select state, end_reason from site_turn where site_key = $1 and session_id = $2 and rpc_id = $3
         order by opened_at desc limit 1`,
        [build.site_key, sessionId, requestId]
      )
      const turn = rows[0]
      if (turn && ['closed', 'stale'].includes(turn.state))
        return STOPPED.includes(turn.end_reason)
          ? {
              state: 'error',
              code: `CLEANUP_TURN_${String(turn.end_reason).toUpperCase().replace(/-/g, '_')}`
            }
          : { state: 'completed' }
      if (now() >= until) return { state: 'timeout' }
      await sleep(POLL_MS)
    }
  }
}

/** The check after a round: the same full check as the build's first one, contact facts and first screen included. */
async function recheck({ build, revision, domain, readSitePage, contentMapOf, now }) {
  const kept = (build.receipt?.sitePlan?.pages ?? [])
    .filter((p) => p.decision === 'keep' && typeof p.path === 'string')
    .map((p) => p.path)
  return runLeftoverCheck({
    readPage: (path) => readSitePage(build.site_key, path),
    check: domain.checkDemoLeftovers,
    contactCheck: domain.checkContactFacts ?? null,
    heroCheck: domain.checkHeroAnswers ?? null,
    contentMap: contentMapOf(revision.template),
    brief: revision.brief,
    // The same plan as the check before the round: a record a round overwrote is still found.
    sitePlan: build.receipt?.sitePlan ?? null,
    siteOrigin: build.site_key,
    paths: kept,
    now
  })
}

/** Why the loop stops after a round, or null to run another. */
function stopReason({ outcome, count, before, pagesLost, round, rounds }) {
  if (outcome.state !== 'completed') return outcome.state === 'timeout' ? 'timeout' : 'error'
  if (pagesLost.length) return 'pages-lost'
  if (count === 0) return 'clean'
  if (count >= before) return 'no-progress'
  if (round >= rounds) return 'rounds'
  return null
}

/**
 * The repair loop for one brief build whose check still reports findings (COO decision 30/10/2026). Each round hands the
 * agent only the findings a site build rule can repair, with that rule's repair text (`renderRepairPrompt`), in one turn
 * of the same chat; the full check runs again; the loop goes on while the count falls, at most `REPAIR_LIMITS.rounds`
 * rounds within `REPAIR_LIMITS.totalMs`. It stops at none left, a count that did not fall, a page lost, a turn that ended
 * in an error or a timeout, or the last round, and the gate after it shows Needs fixes with what is left. It never fails
 * the build. Answers the build as it stands afterwards.
 * @param {{query: Function}} db
 * @param {{build: any, revision: any, domain: any, readSitePage: Function, turn: Function,
 *   contentMapOf?: typeof contentMapOfTemplate, now?: () => number}} input
 */
export async function cleanBuildLeftovers(
  db,
  { build, revision, domain, readSitePage, turn, contentMapOf = contentMapOfTemplate, now = Date.now }
) {
  const first = build.receipt?.leftovers
  if (!first || !Array.isArray(first.findings)) return build
  const earlier = build.receipt?.leftoverCleanup
  const rounds0 = Array.isArray(earlier?.rounds) ? earlier.rounds : []
  const running = earlier?.turn?.state === 'running' || rounds0.some((r) => r.turn?.state === 'running')
  // One loop per build: a worker that comes back after a lost lease finds the record and does not start another.
  if (earlier && !running) return build
  if (!earlier && repairCount(first) === 0) return build
  const limits = domain.CLEANUP_LIMITS ?? CLEANUP_LIMITS
  const startedAt = now()
  const keep = async (patch) => {
    const { rows } = await db.query(
      `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || $2::jsonb, updated_at = now()
       where id = $1 returning *`,
      [build.id, JSON.stringify(patch)]
    )
    return rows[0] ?? { ...build, receipt: { ...build.receipt, ...patch } }
  }
  const version = domain.LEFTOVER_CLEANUP_VERSION
  const firstSummary = earlier?.before ?? domain.summarizeLeftovers(first)
  // A record place takes its own record or comes off, never the business name (#189 item 18, `record-roles.mjs`).
  const recordPlaces = (contentMapOf(revision.template)?.slots ?? [])
    .filter((slot) => isRecordRole(slot.role))
    .map((slot) => slot.key)
  const records = recordValuesOf(build.receipt?.sitePlan)
  /** @type {any[]} */
  const rounds = [...rounds0]
  let current = first
  let outcome = { state: 'error', code: 'CLEANUP_NOT_RUN' }
  let stopped = null
  const final = async (after, reason) => {
    const changed = domain.compareLeftovers(first, after)
    return keep({
      leftovers: after,
      leftoverCleanup: {
        version,
        before: firstSummary,
        after: domain.summarizeLeftovers(after),
        fixed: changed.fixed,
        introduced: changed.introduced,
        pagesLost: changed.pagesLost,
        turn: {
          state: outcome.state,
          ...(outcome.code ? { code: outcome.code } : {}),
          at: new Date(now()).toISOString()
        },
        rounds,
        stopped: reason
      }
    })
  }
  try {
    if (running) {
      // 🔒 A round that was running when its worker died is marked interrupted and only re-checked: its turn may still be
      // editing the site, so no new round starts over it.
      outcome = { state: 'error', code: 'CLEANUP_INTERRUPTED' }
      const at = rounds.length ? rounds.length - 1 : -1
      let after = current
      try {
        after = await recheck({ build, revision, domain, readSitePage, contentMapOf, now })
      } catch (error) {
        if (error?.code === 'DEMO_LEASE_LOST') throw error
      }
      if (at >= 0) {
        const changed = domain.compareLeftovers(first, after)
        rounds[at] = {
          ...rounds[at],
          after: repairCount(after),
          fixed: changed.fixed.length,
          introduced: changed.introduced.length,
          turn: { state: 'interrupted', code: 'CLEANUP_INTERRUPTED', at: new Date(now()).toISOString() }
        }
      }
      return await final(after, 'interrupted')
    }
    for (let round = rounds.length + 1; round <= REPAIR_LIMITS.rounds; round += 1) {
      const before = repairCount(current)
      const left = REPAIR_LIMITS.totalMs - (now() - startedAt)
      if (left < REPAIR_LIMITS.minRoundMs) {
        stopped = 'time'
        break
      }
      const roundLimits = { ...limits, timeoutMs: Math.min(limits.timeoutMs, left) }
      // The record goes first: a crash while the turn runs leaves "running", and the next worker only re-checks.
      rounds.push({ round, before, turn: { state: 'running', at: new Date(now()).toISOString() } })
      build = await keep({
        leftoverCleanup: { version, before: firstSummary, turn: { state: 'running' }, rounds }
      })
      outcome = { state: 'error', code: 'CLEANUP_FAILED' }
      try {
        const prompt = renderRepairPrompt({
          leftovers: current,
          brief: revision.brief,
          limits: roundLimits,
          records,
          recordPlaces,
          round,
          rounds: REPAIR_LIMITS.rounds
        })
        outcome = await turn({ prompt, requestId: `wo-cleanup:${build.id}:${round}`, limits: roundLimits })
      } catch (error) {
        if (error?.code === 'DEMO_LEASE_LOST') throw error
        outcome = { state: 'error', code: error?.code ?? 'CLEANUP_FAILED' }
      }
      // The check again, whatever the turn did. An unreadable site keeps the earlier report.
      let after = current
      try {
        after = await recheck({ build, revision, domain, readSitePage, contentMapOf, now })
      } catch (error) {
        if (error?.code === 'DEMO_LEASE_LOST') throw error
      }
      const count = repairCount(after)
      const changed = domain.compareLeftovers(current, after)
      rounds[rounds.length - 1] = {
        round,
        before,
        after: count,
        fixed: changed.fixed.length,
        introduced: changed.introduced.length,
        turn: {
          state: outcome.state,
          ...(outcome.code ? { code: outcome.code } : {}),
          at: new Date(now()).toISOString()
        }
      }
      current = after
      stopped = stopReason({
        outcome,
        count,
        before,
        pagesLost: changed.pagesLost,
        round,
        rounds: REPAIR_LIMITS.rounds
      })
      if (stopped) break
    }
    return await final(current, stopped ?? 'rounds')
  } catch (error) {
    if (error?.code === 'DEMO_LEASE_LOST') throw error
    return build
  }
}
