/**
 * The bounded cleanup turn (spec TracyHQ/tracy#189, ticket #197). After the Customize engine builds a brief site and the
 * leftover check runs (`demo-leftover-check.js`), a check that still reports leftovers starts ONE short agent turn whose
 * prompt holds only those findings (`website-opportunities/domain/leftover-cleanup.mjs`). The turn is bounded in time
 * and in tool calls, the check runs again at its end, and the build NEVER fails because of it: a turn that errors or
 * times out leaves the engine's site as it is and the hand-off report lists what is left. No findings, no turn.
 *
 * The turn goes through the same two doors the hand-off uses: `sessionAhead` makes a chat on the site, `prompt` queues
 * the message in it. It asks for nothing the site tools removed (it names no tool; the site's own agent preset decides).
 *
 * The receipt keeps `leftoverCleanup`: findings before, findings after, what the turn changed, and how the turn ended.
 * `receipt.leftovers` is replaced by the check that ran after the turn, so the hand-off lists what is left now.
 */
import { createHash } from 'node:crypto'
import { siteRowOf } from './build-store.js'
import { runLeftoverCheck } from './demo-leftover-check.js'
import { contentMapOfTemplate } from './brief-build-path.js'
import { isRecordRole, recordValuesOf } from 'website-opportunities/domain/record-roles.mjs'

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

/**
 * Run the cleanup turn for one brief build whose check still reports findings. Answers the build as it stands afterwards.
 * @param {{query: Function}} db
 * @param {{build: any, revision: any, domain: any, readSitePage: Function, turn: Function,
 *   contentMapOf?: typeof contentMapOfTemplate, now?: () => number}} input
 */
export async function cleanBuildLeftovers(
  db,
  { build, revision, domain, readSitePage, turn, contentMapOf = contentMapOfTemplate, now = Date.now }
) {
  if (typeof domain.renderLeftoverCleanupPrompt !== 'function') return build
  const before = build.receipt?.leftovers
  // A broken site has no findings to fix and still needs the turn: it is told the pages that do not answer.
  const noneBroken = !Array.isArray(before?.broken) || before.broken.length === 0
  if (!before || !Array.isArray(before.findings) || (before.findings.length === 0 && noneBroken)) return build
  // One turn per build: a worker that comes back after a lost lease finds the record and does not start another.
  if (build.receipt?.leftoverCleanup && build.receipt.leftoverCleanup.turn?.state !== 'running') return build
  const limits = domain.CLEANUP_LIMITS ?? { timeoutMs: 8 * 60_000, toolCalls: 40 }
  const started = new Date(now()).toISOString()
  const keep = async (patch) => {
    const { rows } = await db.query(
      `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || $2::jsonb, updated_at = now()
       where id = $1 returning *`,
      [build.id, JSON.stringify(patch)]
    )
    return rows[0] ?? { ...build, receipt: { ...build.receipt, ...patch } }
  }
  const summary = domain.summarizeLeftovers(before)
  let outcome = { state: 'error', code: 'CLEANUP_NOT_RUN' }
  try {
    // The record goes first: a crash while the turn runs leaves "running", and the next worker only re-checks.
    const resumed = build.receipt?.leftoverCleanup?.turn?.state === 'running'
    build = await keep({
      leftoverCleanup: {
        version: domain.LEFTOVER_CLEANUP_VERSION,
        before: summary,
        turn: { state: 'running', at: started }
      }
    })
    if (!resumed) {
      // A record place takes its own record or comes off, never the business name (#189 item 18, `record-roles.mjs`).
      const recordPlaces = (contentMapOf(revision.template)?.slots ?? [])
        .filter((slot) => isRecordRole(slot.role))
        .map((slot) => slot.key)
      const prompt = domain.renderLeftoverCleanupPrompt({
        leftovers: before,
        brief: revision.brief,
        limits,
        records: recordValuesOf(build.receipt?.sitePlan),
        recordPlaces
      })
      outcome = await turn({ prompt, requestId: `wo-cleanup:${build.id}`, limits })
    } else outcome = { state: 'error', code: 'CLEANUP_INTERRUPTED' }
  } catch (error) {
    if (error?.code === 'DEMO_LEASE_LOST') throw error
    outcome = { state: 'error', code: error?.code ?? 'CLEANUP_FAILED' }
  }
  // The check again, whatever the turn did: the report names what is left. An unreadable site keeps the earlier report.
  let after = before
  try {
    const kept = (build.receipt?.sitePlan?.pages ?? [])
      .filter((p) => p.decision === 'keep' && typeof p.path === 'string')
      .map((p) => p.path)
    after = await runLeftoverCheck({
      readPage: (path) => readSitePage(build.site_key, path),
      check: domain.checkDemoLeftovers,
      contentMap: contentMapOf(revision.template),
      brief: revision.brief,
      // The same plan as the check before the turn: a record the turn overwrote is still found.
      sitePlan: build.receipt?.sitePlan ?? null,
      siteOrigin: build.site_key,
      paths: kept,
      now
    })
  } catch (error) {
    if (error?.code === 'DEMO_LEASE_LOST') throw error
  }
  const changed = domain.compareLeftovers(before, after)
  const record = {
    version: domain.LEFTOVER_CLEANUP_VERSION,
    before: summary,
    after: domain.summarizeLeftovers(after),
    fixed: changed.fixed,
    introduced: changed.introduced,
    pagesLost: changed.pagesLost,
    turn: {
      state: outcome.state,
      ...(outcome.code ? { code: outcome.code } : {}),
      at: new Date(now()).toISOString()
    }
  }
  try {
    return await keep({ leftovers: after, leftoverCleanup: record })
  } catch (error) {
    if (error?.code === 'DEMO_LEASE_LOST') throw error
    return build
  }
}
