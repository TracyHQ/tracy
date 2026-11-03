// The brand bench worker (brand step trial bench, #320): a durable queue over brand_run, one run at a time, parallel to
// the site planner bench (its own table, its own queue). A run claims the queued row, runs the locked prompt over the
// brand agent door with the brand tools, saves every model call as it happens, runs the gate on the file the agent
// saved and plays the fix rounds (brand-rounds.js). After the last fix round or at the cost cap it builds the safe
// version by code (brand-safe-version.js).
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes
// at the round the saved rounds say, from the saved turns. A call that was answered is never sent again, and neither
// is one that was dispatched and never answered (the provider may have charged it): that run fails with
// AGENT_TURN_UNANSWERED. A cancel is honoured between two model calls and between two rounds.
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { brandPrompt } from './brand-prompt.js'
import { brandDoors } from './brand-doors.js'
import { createReview } from './brand-reviewer.js'
import { nextRound, playRound } from './brand-rounds.js'
import { buildSafeVersion } from './brand-safe-version.js'
import { saveRound } from './brand-round-store.js'
import { cancelAsked, setProgress } from './brand-store.js'
import { openKit } from '../site-planner/kit-source.js'

/** One run at a time; a lease of 3 minutes renewed every minute; a redeploy costs one of the 20 claims. */
export const BRAND_QUEUE = Object.freeze({ concurrency: 1, leaseMs: 3 * 60_000, maxAttempts: 20 })

class LeaseLost extends Error {}

/**
 * @param {{ pool: import('pg').Pool, secret: string, config?: any, fetchImpl?: typeof fetch,
 *   wiring: () => Promise<{ tools: object[], filesFor: (runId: string) => object, fontFor: (kit: object) => Promise<object | null> }>,
 *   kitImages: { ensure: Function }, index?: Map<string, object>, log?: Console, now?: () => number, retry?: object }} deps
 *   `wiring` gives the tools, the run file folders and the template font (brand-wiring.js; tests pass fakes).
 */
export function createBrandQueue({ log = console, now, ...deps }) {
  return createDurableQueue({
    pool: deps.pool,
    table: 'brand_run',
    keyColumn: 'id',
    name: 'brand',
    ...BRAND_QUEUE,
    log,
    ...(now ? { now } : {}),
    run: (row, lease) => runBrandRun(deps, row, lease)
  })
}

/** Run one claimed run to its verdict. False when the lease was lost and nothing more was written. */
export async function runBrandRun(deps, row, lease) {
  const { pool } = deps
  const runId = row.id
  const leaseToken = lease.token
  const must = async (written) => {
    if (!(await written)) throw new LeaseLost()
  }
  const end = (status, error = null, fields = {}) =>
    lease.finish({
      status,
      error,
      ...fields,
      step: 'done',
      checked_at: new Date(),
      finished_at: new Date(),
      updated_at: new Date()
    })
  try {
    if (row.cancel_requested_at) {
      if (row.step !== 'waiting')
        await must(saveRound(pool, { runId, round: row.round, state: 'cancelled', leaseToken }))
      return end('cancelled')
    }
    const ready = await prepare(deps, row)
    if (!ready.ok) return end('failed', `${ready.code}: ${ready.reason}`)
    for (;;) {
      const next = await nextRound(pool, runId)
      if (next.end) return end(...next.end)
      if (next.safe) return await safeVersion(deps, { row, ready, reason: next.safe, leaseToken, must, end })
      const { round, followUp } = next
      // A cancel asked during the last call of a round ends the run before the next round opens.
      if (round > 0 && next.opening && (await cancelAsked(pool, runId))) return end('cancelled')
      await must(setProgress(pool, { runId, step: round ? 'fixing' : 'working', round, leaseToken }))
      if (next.opening) await must(saveRound(pool, { runId, round, state: 'working', leaseToken }))
      const verdict = await playRound(deps, { row, ready, round, followUp, leaseToken, must })
      if (verdict) return end(...verdict)
    }
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

async function safeVersion(deps, { row, ready, reason, leaseToken, must, end }) {
  await must(setProgress(deps.pool, { runId: row.id, step: 'safe-version', round: row.round, leaseToken }))
  try {
    const file = await buildSafeVersion({
      tools: ready.tools,
      ctx: ready.ctx,
      kit: ready.kit,
      brief: row.brief,
      reason
    })
    return end('succeeded', null, {
      outcome: 'safe-version',
      safe_version_reason: reason,
      brand_file: JSON.stringify(file)
    })
  } catch (error) {
    return end('failed', String(error?.message ?? error))
  }
}

// Everything the run was started with must still hold: a run that silently ran on another model, prompt or a kit the
// server no longer reads would not measure what it records.
async function prepare(deps, row) {
  const { pool, secret, index, kitImages } = deps
  const prompt = brandPrompt()
  if (prompt.sha256 !== row.prompt_sha256)
    return { ok: false, code: 'BRAND_PROMPT_CHANGED', reason: 'the approved prompt changed since the start' }
  const kit = openKit(row.kit?.ref, index ? { index } : {})
  if (!kit) return { ok: false, code: 'BRAND_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const doors = await brandDoors({ pool, secret, override: row.door?.agent?.override ?? null })
  if (!doors.ok) return doors
  for (const side of ['agent', 'reviewer']) {
    const now = doors[side].snapshot
    const was = row.door?.[side]
    if (!['providerId', 'model', 'endpointHost'].every((k) => now[k] === was?.[k]))
      return {
        ok: false,
        code: 'BRAND_DOOR_CHANGED',
        reason: `the ${side} door now uses ${now.providerId} ${now.model}, the run was started on ${was?.providerId} ${was?.model}`
      }
  }
  const images = await kitImages.ensure(kit)
  if (!images.ok) return images
  const wiring = await deps.wiring()
  const font = await wiring.fontFor(kit)
  if (!font)
    return { ok: false, code: 'BRAND_FONT_UNRESOLVED', reason: 'the template heading font cannot be read' }
  const files = wiring.filesFor(row.id)
  return {
    ok: true,
    prompt,
    kit,
    agent: doors.agent,
    tools: wiring.tools,
    ctx: { files, kit: kit.doc, brief: row.brief, font, runId: row.id, kitImages: images.images },
    reviewFor: ({ spend, tool }) =>
      createReview({ door: doors.reviewer.door, fetchImpl: deps.fetchImpl, spend, tool })
  }
}
